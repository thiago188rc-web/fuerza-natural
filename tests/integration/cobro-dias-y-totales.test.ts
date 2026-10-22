import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { gymSettings, payments, plans, students } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { hoyISO } from "@/domain/fechas/hoy";
import { sumarMeses } from "@/domain/fechas/calendario";
import { seedTestGym } from "./helpers";

/**
 * El cobro elige CUÁNTOS DÍAS cubre el pago (§4bis), ya no pregunta la
 * forma de pago, y el historial cuenta pagos y personas por separado.
 * Contra Postgres REAL; lo único simulado es la sesión. Datos inventados.
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});

const { crearAlumnoAction } = await import("@/use-cases/alumnos/crear-alumno");
const { registrarPagoAction } = await import("@/use-cases/pagos/registrar-pago");
const { anularPagoAction } = await import("@/use-cases/pagos/anular-pago");
const { historialDePagosQuery } = await import("@/use-cases/pagos/consultas");

const HOY = hoyISO("America/Argentina/Buenos_Aires");

async function escenario() {
  const { ctx, planId } = await seedTestGym();
  const otroPlanId = randomUUID();
  const inactivoId = randomUUID();
  await withTenantTx(ctx, async (tx) => {
    await tx.insert(gymSettings).values({ gymId: ctx.gymId, precioMedioMes: "45000" });
    await tx.insert(plans).values([
      { id: otroPlanId, gymId: ctx.gymId, nombre: "5 días", diasSemana: 5, precioActual: "20000" },
      { id: inactivoId, gymId: ctx.gymId, nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE", activo: false },
    ]);
  });
  sesion.ctx = ctx;

  const alta = await crearAlumnoAction({ nombre: "Lía", apellido: "Prueba", planId });
  if (!alta.ok) throw new Error(`alta falló: ${JSON.stringify(alta)}`);
  return { ctx, planId, otroPlanId, inactivoId, studentId: alta.data.id };
}

const pago = (studentId: string, extra: Record<string, unknown> = {}) =>
  registrarPagoAction({
    studentId,
    fechaPago: HOY,
    modalidad: "MES_COMPLETO",
    cubreDesde: HOY,
    monto: 10000,
    idempotencyKey: randomUUID(),
    confirmarSuperposicion: true,
    ...extra,
  });

async function leerPago(ctx: AuthContext, id: string) {
  return withTenantTx(ctx, async (tx) => (await tx.select().from(payments).where(eq(payments.id, id)))[0]!);
}

describe.skipIf(!process.env.DATABASE_URL)("cobro: días del pago y forma de pago (Postgres real)", () => {
  beforeEach(() => {
    sesion.ctx = null;
  });

  it("sin elegir días, el pago va con el plan habitual; la forma de pago queda como 'sin dato'", async () => {
    const { ctx, studentId } = await escenario();
    const r = await pago(studentId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fila = await leerPago(ctx, r.data.id);
    expect(fila.planNombreSnapshot).toBe("3 días");
    expect(fila.planDiasSnapshot).toBe(3);
    // No un EFECTIVO que nadie dijo.
    expect(fila.metodo).toBe("OTRO");
  });

  it("eligiendo otros días, el snapshot es de ESE plan (leído de la base) y el plan habitual no cambia", async () => {
    const { ctx, planId, otroPlanId, studentId } = await escenario();
    const r = await pago(studentId, { planId: otroPlanId, monto: 20000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.planNombre).toBe("5 días");

    const fila = await leerPago(ctx, r.data.id);
    expect(fila.planId).toBe(otroPlanId);
    expect(fila.planNombreSnapshot).toBe("5 días");
    expect(fila.planDiasSnapshot).toBe(5);

    const alumno = await withTenantTx(ctx, async (tx) =>
      (await tx.select().from(students).where(eq(students.id, studentId)))[0]!,
    );
    expect(alumno.planId).toBe(planId);
  });

  it("rechaza un plan desactivado y uno de otro gimnasio, sin escribir nada", async () => {
    const { ctx, inactivoId, studentId } = await escenario();
    const ajeno = await seedTestGym();
    sesion.ctx = ctx;

    for (const planId of [inactivoId, ajeno.planId]) {
      const r = await pago(studentId, { planId });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("VALIDATION");
    }
    const filas = await withTenantTx(ctx, (tx) =>
      tx.select().from(payments).where(eq(payments.studentId, studentId)),
    );
    expect(filas).toHaveLength(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("historial de pagos: pagos ≠ personas (Postgres real)", () => {
  it("dos pagos de la misma persona son 2 pagos y 1 alumno; un anulado no cuenta en ninguno", async () => {
    const { studentId, planId } = await escenario();
    const otra = await crearAlumnoAction({ nombre: "Ana", apellido: "Otra", planId });
    if (!otra.ok) throw new Error(JSON.stringify(otra));

    // La misma persona paga el mes atrasado y el actual el mismo día.
    expect((await pago(studentId, { cubreDesde: sumarMeses(HOY, -1) })).ok).toBe(true);
    expect((await pago(studentId)).ok).toBe(true);
    const anulado = await pago(otra.data.id);
    if (!anulado.ok) throw new Error(JSON.stringify(anulado));
    expect((await anularPagoAction({ paymentId: anulado.data.id, motivo: "Cargado por error" })).ok).toBe(true);

    const h = await historialDePagosQuery({});
    if (!h.ok) throw new Error(JSON.stringify(h));
    expect(h.data.cobradoEnElRango.cantidad).toBe(2);
    expect(h.data.alumnosQuePagaron).toBe(1);
    expect(h.data.alumnosConMasDeUnPago).toBe(1);
    // Los activos no dependen de quién pagó.
    expect(h.data.activos).toBe(2);
  });
});
