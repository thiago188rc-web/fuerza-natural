import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { gymSettings, paymentPeriods, payments } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { hoyISO } from "@/domain/fechas/hoy";
import { primerDiaDelMes, sumarDias, sumarMeses, ultimoDiaDelMes } from "@/domain/fechas/calendario";
import { seedTestGym } from "./helpers";

/**
 * Fecha de cobro ≠ período imputado (docs/REGLAS-DE-NEGOCIO.md §5bis):
 * adelantos, atrasados, varios meses, el pago doble que se advierte y la
 * cuenta "pagos vs. activos". Contra Postgres REAL (RLS, CHECKs y
 * triggers incluidos); lo único simulado es la sesión. Datos inventados.
 *
 * "Hoy" es el día real en que corre el test, así que los meses se arman
 * relativos a hoy: "el mes que viene" hace de noviembre cuando se corre
 * en octubre. El caso con fechas fijas (28/10 → noviembre) está en
 * tests/domain/pagos/periodos.test.ts.
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});

const { crearAlumnoAction } = await import("@/use-cases/alumnos/crear-alumno");
const { cambiarVinculoAction } = await import("@/use-cases/alumnos/cambiar-vinculo");
const { registrarPagoAction } = await import("@/use-cases/pagos/registrar-pago");
const { anularPagoAction } = await import("@/use-cases/pagos/anular-pago");
const { historialDePagosQuery, contextoDeCobroQuery } = await import("@/use-cases/pagos/consultas");

const HOY = hoyISO("America/Argentina/Buenos_Aires");
const ESTE_MES = primerDiaDelMes(HOY);
const MES_QUE_VIENE = sumarMeses(ESTE_MES, 1);
const MES_PASADO = sumarMeses(ESTE_MES, -1);

async function escenario() {
  const { ctx, planId } = await seedTestGym();
  await withTenantTx(ctx, (tx) => tx.insert(gymSettings).values({ gymId: ctx.gymId, precioMedioMes: "45000" }));
  sesion.ctx = ctx;
  // Alta el día 1 de hace dos meses: deja lugar para un atrasado.
  const alta = await crearAlumnoAction({
    nombre: "Lía",
    apellido: "Prueba",
    planId,
    fechaAltaOriginal: sumarMeses(ESTE_MES, -2),
  });
  if (!alta.ok) throw new Error(`alta falló: ${JSON.stringify(alta)}`);
  return { ctx, planId, studentId: alta.data.id };
}

const pago = (studentId: string, extra: Record<string, unknown> = {}) =>
  registrarPagoAction({
    studentId,
    fechaPago: HOY,
    modalidad: "MES_COMPLETO",
    cubreDesde: ESTE_MES,
    monto: 10000,
    idempotencyKey: randomUUID(),
    ...extra,
  });

async function pagosDe(ctx: AuthContext, studentId: string) {
  return withTenantTx(ctx, (tx) =>
    tx.select().from(payments).where(eq(payments.studentId, studentId)).orderBy(asc(payments.createdAt)),
  );
}

async function tramosDe(ctx: AuthContext, paymentIds: string[]) {
  return withTenantTx(ctx, (tx) =>
    tx
      .select()
      .from(paymentPeriods)
      .where(inArray(paymentPeriods.paymentId, paymentIds))
      .orderBy(asc(paymentPeriods.cubreDesde)),
  );
}

describe.skipIf(!process.env.DATABASE_URL)("fecha de cobro ≠ período imputado (Postgres real)", () => {
  beforeEach(() => {
    sesion.ctx = null;
  });

  it("1. cobrado hoy, imputado al mes que viene: la caja es de hoy, la cobertura del mes que viene", async () => {
    const { ctx, studentId } = await escenario();
    const r = await pago(studentId, { cubreDesde: MES_QUE_VIENE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [fila] = await pagosDe(ctx, studentId);
    expect(fila!.fechaPago).toBe(HOY);
    const tramos = await tramosDe(ctx, [fila!.id]);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({
      periodo: MES_QUE_VIENE,
      cubreDesde: MES_QUE_VIENE,
      cubreHasta: ultimoDiaDelMes(MES_QUE_VIENE),
    });

    // Entra en lo cobrado de ESTE mes (fecha de cobro), no del que viene.
    const h = await historialDePagosQuery({});
    if (!h.ok) throw new Error(JSON.stringify(h));
    expect(h.data.cobradoEnElRango).toEqual({ total: 10000, cantidad: 1 });
    const filaDelHistorial = h.data.filas.find((f) => f.id === fila!.id);
    expect(filaDelHistorial?.cubreDesde).toBe(MES_QUE_VIENE);

    // El próximo cobro arranca después de lo adelantado.
    const contexto = await contextoDeCobroQuery(studentId);
    if (!contexto.ok) throw new Error(JSON.stringify(contexto));
    expect(contexto.data.anclaDelCiclo).toBe(sumarMeses(MES_QUE_VIENE, 1));
  });

  it("2. un pago atrasado: el mes pasado, cobrado hace unos días", async () => {
    const { ctx, studentId } = await escenario();
    const cobradoEl = sumarDias(HOY, -3) < MES_PASADO ? MES_PASADO : sumarDias(HOY, -3);
    const r = await pago(studentId, { fechaPago: cobradoEl, cubreDesde: MES_PASADO });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [fila] = await pagosDe(ctx, studentId);
    expect(fila!.fechaPago).toBe(cobradoEl);
    const tramos = await tramosDe(ctx, [fila!.id]);
    expect(tramos[0]).toMatchObject({ periodo: MES_PASADO, cubreHasta: ultimoDiaDelMes(MES_PASADO) });
  });

  it("3. dos meses futuros en un cobro: dos pagos, un período cada uno, anulables por separado", async () => {
    const { ctx, studentId } = await escenario();
    const r = await pago(studentId, { cubreDesde: MES_QUE_VIENE, meses: 2, monto: 65000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ meses: 2, monto: 65000, total: 130000, cubreDesde: MES_QUE_VIENE });
    expect(r.data.cubreHasta).toBe(ultimoDiaDelMes(sumarMeses(MES_QUE_VIENE, 1)));

    const filas = await pagosDe(ctx, studentId);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.fechaPago === HOY && f.monto === "65000.00")).toBe(true);
    // La clave de idempotencia va solo en el primero (es única por gimnasio).
    expect(filas.filter((f) => f.idempotencyKey !== null)).toHaveLength(1);

    const tramos = await tramosDe(ctx, filas.map((f) => f.id));
    expect(tramos.map((t) => t.periodo)).toEqual([MES_QUE_VIENE, sumarMeses(MES_QUE_VIENE, 1)]);

    // Anular el segundo mes deja el primero intacto.
    const anulado = await anularPagoAction({ paymentId: r.data.ids[1]!, motivo: "Solo pagó un mes" });
    expect(anulado.ok).toBe(true);
    const h = await historialDePagosQuery({});
    if (!h.ok) throw new Error(JSON.stringify(h));
    expect(h.data.cobradoEnElRango).toEqual({ total: 65000, cantidad: 1 });
  });

  it("4a. el mismo período dos veces pide confirmación y no escribe nada", async () => {
    const { ctx, studentId } = await escenario();
    expect((await pago(studentId, { cubreDesde: MES_QUE_VIENE })).ok).toBe(true);

    const otraVez = await pago(studentId, { cubreDesde: MES_QUE_VIENE, fechaPago: sumarDias(HOY, -1) });
    expect(otraVez.ok).toBe(false);
    if (otraVez.ok) return;
    expect(otraVez.kind).toBe("CONFIRMACION_REQUERIDA");
    if (otraVez.kind === "CONFIRMACION_REQUERIDA") {
      expect(otraVez.confirmacion.existentes).toHaveLength(1);
    }
    expect(await pagosDe(ctx, studentId)).toHaveLength(1);
  });

  it("4b. el pago doble que NO se superpone (mismo cobro, otro mes) también se advierte", async () => {
    const { ctx, studentId } = await escenario();
    expect((await pago(studentId)).ok).toBe(true);

    // Cargado otra vez el mismo día: el período sería el mes siguiente.
    const doble = await pago(studentId, { cubreDesde: MES_QUE_VIENE });
    expect(doble.ok).toBe(false);
    if (doble.ok || doble.kind !== "CONFIRMACION_REQUERIDA") throw new Error(JSON.stringify(doble));
    expect(doble.confirmacion.existentes).toHaveLength(0);
    expect(doble.confirmacion.mismoDia).toHaveLength(1);
    expect(await pagosDe(ctx, studentId)).toHaveLength(1);

    // Si es legítimo (pagó dos meses), se confirma y entra.
    expect((await pago(studentId, { cubreDesde: MES_QUE_VIENE, confirmarSuperposicion: true })).ok).toBe(true);
    expect(await pagosDe(ctx, studentId)).toHaveLength(2);
  });

  it("4c. el mismo envío dos veces (misma clave) no entra dos veces, ni a medias", async () => {
    const { ctx, studentId } = await escenario();
    const clave = randomUUID();
    expect((await pago(studentId, { idempotencyKey: clave, meses: 3 })).ok).toBe(true);
    const reenvio = await pago(studentId, { idempotencyKey: clave, meses: 3, confirmarSuperposicion: true });
    expect(reenvio.ok).toBe(false);
    if (!reenvio.ok) expect(reenvio.kind).toBe("CONFLICT");
    expect(await pagosDe(ctx, studentId)).toHaveLength(3);
  });

  it("5. la fecha de cobro no puede ser futura; el período no puede arrancar a más de 12 meses", async () => {
    const { ctx, studentId } = await escenario();
    const futura = await pago(studentId, { fechaPago: sumarDias(HOY, 1), cubreDesde: MES_QUE_VIENE });
    expect(futura.ok).toBe(false);
    if (!futura.ok) expect(futura.kind).toBe("VALIDATION");

    const lejos = await pago(studentId, { cubreDesde: sumarMeses(HOY, 13) });
    expect(lejos.ok).toBe(false);
    if (!lejos.ok && lejos.kind === "VALIDATION") expect(lejos.issues[0]!.path).toBe("cubreDesde");

    expect(await pagosDe(ctx, studentId)).toHaveLength(0);
  });

  it("el 1/2 mes se sigue cobrando de a uno", async () => {
    const { studentId } = await escenario();
    const r = await pago(studentId, { modalidad: "MEDIO_MES", meses: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("VALIDATION");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("pagos registrados vs. activos hoy (Postgres real)", () => {
  it("6. la diferencia se explica sola: pagos de más, quienes ya no están y activos sin pago", async () => {
    const { ctx, planId } = await seedTestGym();
    sesion.ctx = ctx;
    const alta = async (apellido: string) => {
      const r = await crearAlumnoAction({ nombre: "Caso", apellido, planId });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.data.id;
    };
    const dosMeses = await alta("Dos Meses");
    const seFue = await alta("Se Fue");
    const sinPago = await alta("Sin Pago");

    expect((await pago(dosMeses, { cubreDesde: HOY, meses: 2 })).ok).toBe(true);
    expect((await pago(seFue, { cubreDesde: HOY })).ok).toBe(true);
    expect((await cambiarVinculoAction({ id: seFue, vinculo: "BAJA" })).ok).toBe(true);
    // Un anulado no cuenta en ningún número: "Sin Pago" sigue sin pago.
    const cargadoMal = await pago(sinPago, { cubreDesde: HOY });
    if (!cargadoMal.ok) throw new Error(JSON.stringify(cargadoMal));
    expect((await anularPagoAction({ paymentId: cargadoMal.data.id, motivo: "Otro alumno" })).ok).toBe(true);

    const h = await historialDePagosQuery({});
    if (!h.ok) throw new Error(JSON.stringify(h));
    const d = h.data;
    expect(d.cobradoEnElRango.cantidad).toBe(3);
    expect(d.alumnosQuePagaron).toBe(2);
    expect(d.alumnosConMasDeUnPago).toBe(1);
    expect(d.pagaronYHoyNoEstanActivos).toBe(1);
    expect(d.activos).toBe(2);
    expect(d.activosSinPagoEnElRango).toBe(1);
    // La cuenta cierra: pagos − activos = de más + no activos − sin pago.
    const deMas = d.cobradoEnElRango.cantidad - d.alumnosQuePagaron;
    expect(d.cobradoEnElRango.cantidad - d.activos).toBe(
      deMas + d.pagaronYHoyNoEstanActivos - d.activosSinPagoEnElRango,
    );
  });
});
