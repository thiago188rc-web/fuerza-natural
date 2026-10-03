import { describe, it, expect, vi, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { activityLog, gymSettings, paymentPeriods, payments } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { hoyISO } from "@/domain/fechas/hoy";
import { seedTestGym } from "./helpers";

/**
 * Anular un pago, contra Postgres REAL (RLS, triggers y CHECKs activos).
 * Lo único simulado es la sesión. Datos inventados.
 *
 * Se salta entero si no hay DATABASE_URL.
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
const { fichaCompletaQuery } = await import("@/use-cases/alumnos/ficha");
const { metricasQuery } = await import("@/use-cases/metricas/consultas");

const HOY = hoyISO("America/Argentina/Buenos_Aires");

/** Un gimnasio con configuración, un alumno y un pago de este mes. */
async function escenario(monto = 50000) {
  const { ctx, planId } = await seedTestGym();
  await withTenantTx(ctx, (tx) => tx.insert(gymSettings).values({ gymId: ctx.gymId, precioMedioMes: "45000" }));
  sesion.ctx = ctx;

  const alta = await crearAlumnoAction({ nombre: "Lía", apellido: "Prueba", planId });
  if (!alta.ok) throw new Error(`alta falló: ${JSON.stringify(alta)}`);

  const pago = await registrarPagoAction({
    studentId: alta.data.id,
    fechaPago: HOY,
    modalidad: "MES_COMPLETO",
    cubreDesde: HOY,
    monto,
    metodo: "EFECTIVO",
    idempotencyKey: crypto.randomUUID(),
  });
  if (!pago.ok) throw new Error(`pago falló: ${JSON.stringify(pago)}`);

  return { ctx, studentId: alta.data.id, paymentId: pago.data.id };
}

async function leerPago(ctx: AuthContext, id: string) {
  return withTenantTx(ctx, async (tx) => {
    const [fila] = await tx.select().from(payments).where(eq(payments.id, id));
    return fila ?? null;
  });
}

describe.skipIf(!process.env.DATABASE_URL)("anular un pago (Postgres real)", () => {
  beforeEach(() => {
    sesion.ctx = null;
  });

  it("el DUENO anula: el pago queda, con fecha, autor y motivo, y la anulación se audita", async () => {
    const { ctx, paymentId } = await escenario();

    const r = await anularPagoAction({ paymentId, motivo: "Se cargó a otro alumno" });
    expect(r.ok).toBe(true);

    const pago = await leerPago(ctx, paymentId);
    expect(pago).not.toBeNull();
    expect(pago!.anuladoEn).not.toBeNull();
    expect(pago!.anuladoPor).toBe(ctx.userId);
    expect(pago!.anuladoMotivo).toBe("Se cargó a otro alumno");
    expect(pago!.monto).toBe("50000.00");

    const tramos = await withTenantTx(ctx, (tx) =>
      tx.select().from(paymentPeriods).where(eq(paymentPeriods.paymentId, paymentId)),
    );
    expect(tramos.length).toBeGreaterThan(0);

    const auditoria = await withTenantTx(ctx, (tx) =>
      tx
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.accion, "payment.annulled"), eq(activityLog.entidadId, paymentId))),
    );
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].actorUserId).toBe(ctx.userId);
    expect(auditoria[0].resumen).toContain("Se cargó a otro alumno");
  });

  it("STAFF no puede anular, y sin sesión tampoco: el pago no cambia", async () => {
    const { ctx, paymentId } = await escenario();

    sesion.ctx = { ...ctx, rol: "STAFF" };
    const comoStaff = await anularPagoAction({ paymentId, motivo: "Intento del personal" });
    expect(comoStaff).toMatchObject({ ok: false, kind: "FORBIDDEN" });

    sesion.ctx = null;
    const sinSesion = await anularPagoAction({ paymentId, motivo: "Intento anónimo" });
    expect(sinSesion).toMatchObject({ ok: false, kind: "FORBIDDEN" });

    expect((await leerPago(ctx, paymentId))!.anuladoEn).toBeNull();
  });

  it("el motivo es obligatorio: vacío o de relleno se rechaza sin tocar el pago", async () => {
    const { ctx, paymentId } = await escenario();
    for (const motivo of ["", "   ", "abc"]) {
      const r = await anularPagoAction({ paymentId, motivo });
      expect(r, JSON.stringify(motivo)).toMatchObject({ ok: false, kind: "VALIDATION" });
    }
    expect((await leerPago(ctx, paymentId))!.anuladoEn).toBeNull();
  });

  it("anular dos veces no pisa el motivo original; dos envíos simultáneos anulan una sola vez", async () => {
    const { ctx, paymentId } = await escenario();

    const [a, b] = await Promise.all([
      anularPagoAction({ paymentId, motivo: "Primer motivo" }),
      anularPagoAction({ paymentId, motivo: "Segundo motivo" }),
    ]);
    const exitos = [a, b].filter((r) => r.ok);
    const conflictos = [a, b].filter((r) => !r.ok && r.kind === "CONFLICT");
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(1);

    const despues = await anularPagoAction({ paymentId, motivo: "Tercer motivo" });
    expect(despues).toMatchObject({ ok: false, kind: "CONFLICT", message: "Este pago ya estaba anulado." });

    const pago = await leerPago(ctx, paymentId);
    expect(["Primer motivo", "Segundo motivo"]).toContain(pago!.anuladoMotivo);
    const auditoria = await withTenantTx(ctx, (tx) =>
      tx
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.accion, "payment.annulled"), eq(activityLog.entidadId, paymentId))),
    );
    expect(auditoria).toHaveLength(1);
  });

  it("otro gimnasio no puede anular un pago ajeno aunque mande su id exacto", async () => {
    const { ctx: ctxA, paymentId } = await escenario();
    const { ctx: ctxB } = await seedTestGym();

    sesion.ctx = ctxB;
    const r = await anularPagoAction({ paymentId, motivo: "Intento desde otro gimnasio" });
    expect(r).toMatchObject({ ok: false, kind: "NOT_FOUND" });
    expect((await leerPago(ctxA, paymentId))!.anuladoEn).toBeNull();
  });

  it("un pago anulado deja de contar: cobrado, facturación, cobertura y superposición", async () => {
    const { ctx, studentId, paymentId } = await escenario(50000);
    const rango = { desde: HOY.slice(0, 8) + "01", hasta: HOY };

    const antes = await historialDePagosQuery(rango);
    if (!antes.ok) throw new Error(JSON.stringify(antes));
    expect(antes.data.cobradoEnElRango.total).toBe(50000);
    const metricasAntes = await metricasQuery({ vista: "mes" });
    if (!metricasAntes.ok) throw new Error(JSON.stringify(metricasAntes));
    expect(metricasAntes.data.facturacion.totalDelPeriodo).toBe(50000);

    expect((await anularPagoAction({ paymentId, motivo: "Importe mal cargado" })).ok).toBe(true);

    const despues = await historialDePagosQuery(rango);
    if (!despues.ok) throw new Error(JSON.stringify(despues));
    expect(despues.data.cobradoEnElRango.total).toBe(0);
    // Sigue en el historial, marcado.
    const fila = despues.data.filas.find((f) => f.id === paymentId);
    expect(fila).toMatchObject({ anulado: true, anuladoMotivo: "Importe mal cargado" });

    const metricasDespues = await metricasQuery({ vista: "mes" });
    if (!metricasDespues.ok) throw new Error(JSON.stringify(metricasDespues));
    expect(metricasDespues.data.facturacion.totalDelPeriodo).toBe(0);

    const ficha = await fichaCompletaQuery(studentId);
    if (!ficha.ok) throw new Error(JSON.stringify(ficha));
    expect(ficha.data.totalPagado).toBe(0);
    expect(ficha.data.cubiertoHasta).toBeNull();
    expect(ficha.data.pagos.find((p) => p.id === paymentId)?.anulado).toBe(true);

    // Volver a registrarlo bien no pide confirmación: lo anulado no cubre.
    const corregido = await registrarPagoAction({
      studentId,
      fechaPago: HOY,
      modalidad: "MES_COMPLETO",
      cubreDesde: HOY,
      monto: 45000,
      metodo: "TRANSFERENCIA",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(corregido.ok).toBe(true);
    expect(sesion.ctx).toEqual(ctx);
  });

  it("la ficha y el historial dicen quién puede anular", async () => {
    const { ctx, studentId } = await escenario();
    const comoDueno = await fichaCompletaQuery(studentId);
    expect(comoDueno.ok && comoDueno.data.puedeAnularPagos).toBe(true);

    sesion.ctx = { ...ctx, rol: "STAFF" };
    const comoStaff = await fichaCompletaQuery(studentId);
    expect(comoStaff.ok && comoStaff.data.puedeAnularPagos).toBe(false);
    const historial = await historialDePagosQuery({});
    expect(historial.ok && historial.data.puedeAnularPagos).toBe(false);
  });

  it("un id malformado en la URL de la ficha es NOT_FOUND, no un error de base", async () => {
    await escenario();
    const r = await fichaCompletaQuery("abc' or 1=1");
    expect(r).toMatchObject({ ok: false, kind: "NOT_FOUND" });
  });
});
