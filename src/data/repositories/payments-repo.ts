import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { appUsers, payments, paymentPeriods, plans, students } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";
import type { TramoImputado } from "@/domain/pagos/modalidad";

/**
 * Repositorio de pagos. Mismas reglas que el de alumnos: recibe `ctx`,
 * filtra por `gym_id` explícitamente además de RLS, y nunca abre
 * conexiones propias.
 *
 * Un pago ANULADO no cubre nada. Todas las consultas de cobertura filtran
 * `anulado_en is null` — si eso se olvidara en una sola query, un pago
 * anulado seguiría dejando al alumno "al día", que es el peor error
 * posible en este dominio.
 */

export const PAGOS_POR_PAGINA = 30;

export interface TramoDeAlumno {
  studentId: string;
  desde: string;
  hasta: string;
}

/**
 * Los tramos cubiertos que se solapan con una ventana de fechas.
 *
 * La ventana existe para no traer siete años de historia cada vez que se
 * dibuja el panel: para saber la situación de HOY alcanza con los tramos
 * que terminan de hoy en adelante, y para dibujar el mes, con los que
 * tocan el mes.
 */
export async function listarTramosCubiertos(
  tx: TxClient,
  ctx: AuthContext,
  ventana: { desde: string; hasta: string },
  studentIds?: readonly string[],
): Promise<TramoDeAlumno[]> {
  if (studentIds && studentIds.length === 0) return [];

  const condiciones = [
    eq(paymentPeriods.gymId, ctx.gymId),
    isNull(payments.anuladoEn),
    gte(paymentPeriods.cubreHasta, ventana.desde),
    lte(paymentPeriods.cubreDesde, ventana.hasta),
  ];
  if (studentIds) condiciones.push(inArray(paymentPeriods.studentId, studentIds));

  return tx
    .select({
      studentId: paymentPeriods.studentId,
      desde: paymentPeriods.cubreDesde,
      hasta: paymentPeriods.cubreHasta,
    })
    .from(paymentPeriods)
    .innerJoin(payments, eq(payments.id, paymentPeriods.paymentId))
    .where(and(...condiciones))
    .orderBy(asc(paymentPeriods.cubreDesde));
}

/** Toda la cobertura de un alumno, para su ficha. */
export async function listarTramosDeAlumno(tx: TxClient, ctx: AuthContext, studentId: string) {
  return tx
    .select({
      desde: paymentPeriods.cubreDesde,
      hasta: paymentPeriods.cubreHasta,
      periodo: paymentPeriods.periodo,
    })
    .from(paymentPeriods)
    .innerJoin(payments, eq(payments.id, paymentPeriods.paymentId))
    .where(
      and(
        eq(paymentPeriods.gymId, ctx.gymId),
        eq(paymentPeriods.studentId, studentId),
        isNull(payments.anuladoEn),
      ),
    )
    .orderBy(asc(paymentPeriods.cubreDesde));
}

export interface NuevoPago {
  studentId: string;
  fechaPago: string;
  planId: string;
  planDiasSnapshot: number;
  planNombreSnapshot: string;
  modalidad: string;
  monto: string;
  metodo: string;
  nota: string | null;
  idempotencyKey: string | null;
}

/**
 * Inserta el pago y sus tramos en la MISMA transacción.
 *
 * Que sean dos tablas y una sola transacción no es un detalle: un pago sin
 * sus períodos es un pago que no cubre nada — el alumno aparecería como
 * descubierto habiendo pagado. O entran los dos o no entra ninguno.
 */
export async function registrarPago(
  tx: TxClient,
  ctx: AuthContext,
  pago: NuevoPago,
  tramos: readonly TramoImputado[],
) {
  const [fila] = await tx
    .insert(payments)
    .values({
      gymId: ctx.gymId,
      studentId: pago.studentId,
      fechaPago: pago.fechaPago,
      planId: pago.planId,
      planDiasSnapshot: pago.planDiasSnapshot,
      planNombreSnapshot: pago.planNombreSnapshot,
      modalidad: pago.modalidad,
      monto: pago.monto,
      metodo: pago.metodo,
      nota: pago.nota,
      idempotencyKey: pago.idempotencyKey,
      registradoPor: ctx.userId,
    })
    .returning({ id: payments.id, fechaPago: payments.fechaPago, monto: payments.monto });

  await tx.insert(paymentPeriods).values(
    tramos.map((t) => ({
      gymId: ctx.gymId,
      paymentId: fila.id,
      studentId: pago.studentId,
      periodo: t.periodo,
      cubreDesde: t.cubreDesde,
      cubreHasta: t.cubreHasta,
    })),
  );

  return fila;
}

/**
 * ¿Ya hay un pago vigente que cubra algún día de este rango?
 *
 * No bloquea nada: el caso de uso lo usa para pedir CONFIRMACIÓN. Pagar
 * dos veces el mismo mes puede ser legítimo (dos medios meses, un ajuste),
 * así que la decisión es del humano — pero tomarla a ciegas no.
 */
export async function buscarCoberturaSuperpuesta(
  tx: TxClient,
  ctx: AuthContext,
  studentId: string,
  rango: { desde: string; hasta: string },
) {
  return tx
    .select({
      paymentId: payments.id,
      fechaPago: payments.fechaPago,
      monto: payments.monto,
      modalidad: payments.modalidad,
      desde: paymentPeriods.cubreDesde,
      hasta: paymentPeriods.cubreHasta,
    })
    .from(paymentPeriods)
    .innerJoin(payments, eq(payments.id, paymentPeriods.paymentId))
    .where(
      and(
        eq(paymentPeriods.gymId, ctx.gymId),
        eq(paymentPeriods.studentId, studentId),
        isNull(payments.anuladoEn),
        gte(paymentPeriods.cubreHasta, rango.desde),
        lte(paymentPeriods.cubreDesde, rango.hasta),
      ),
    )
    .orderBy(asc(paymentPeriods.cubreDesde))
    .limit(5);
}

export interface FiltrosDePagos {
  desde?: string | null;
  hasta?: string | null;
  pagina: number;
}

/**
 * El historial. Trae los tramos de cada pago agregados como texto para no
 * hacer N+1: un pago tiene uno o dos tramos, y `string_agg` los resuelve
 * dentro de la misma consulta.
 */
export async function listarPagos(tx: TxClient, ctx: AuthContext, filtros: FiltrosDePagos) {
  const condiciones = [eq(payments.gymId, ctx.gymId)];
  if (filtros.desde) condiciones.push(gte(payments.fechaPago, filtros.desde));
  if (filtros.hasta) condiciones.push(lte(payments.fechaPago, filtros.hasta));

  const where = and(...condiciones);
  const offset = (filtros.pagina - 1) * PAGOS_POR_PAGINA;

  const [filas, totales] = await Promise.all([
    tx
      .select({
        id: payments.id,
        fechaPago: payments.fechaPago,
        monto: payments.monto,
        metodo: payments.metodo,
        modalidad: payments.modalidad,
        planNombreSnapshot: payments.planNombreSnapshot,
        nota: payments.nota,
        anuladoEn: payments.anuladoEn,
        anuladoMotivo: payments.anuladoMotivo,
        studentId: students.id,
        nombre: students.nombre,
        apellido: students.apellido,
        telefono: students.telefono,
        registradoPorNombre: appUsers.nombre,
        cubreDesde: sql<string | null>`(
          select min(pp.cubre_desde)
          from app.payment_periods pp
          where pp.payment_id = ${payments.id}
        )`,
        cubreHasta: sql<string | null>`(
          select max(pp.cubre_hasta)
          from app.payment_periods pp
          where pp.payment_id = ${payments.id}
        )`,
      })
      .from(payments)
      .innerJoin(students, eq(students.id, payments.studentId))
      .innerJoin(appUsers, eq(appUsers.id, payments.registradoPor))
      .where(where)
      .orderBy(desc(payments.fechaPago), desc(payments.createdAt))
      .limit(PAGOS_POR_PAGINA)
      .offset(offset),
    tx.select({ total: sql<number>`count(*)::int` }).from(payments).where(where),
  ]);

  return {
    filas,
    total: totales[0]?.total ?? 0,
    pagina: filtros.pagina,
    porPagina: PAGOS_POR_PAGINA,
  };
}

/** Lo cobrado en un rango de FECHAS DE PAGO (no de cobertura). */
export async function totalCobrado(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
) {
  const [fila] = await tx
    .select({
      total: sql<string>`coalesce(sum(${payments.monto}), 0)`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.gymId, ctx.gymId),
        isNull(payments.anuladoEn),
        gte(payments.fechaPago, rango.desde),
        lte(payments.fechaPago, rango.hasta),
      ),
    );
  return { total: Number(fila?.total ?? 0), cantidad: fila?.cantidad ?? 0 };
}

export type GranularidadFacturacion = "dia" | "semana" | "mes";

const TRUNC_SQL: Record<GranularidadFacturacion, string> = {
  dia: "day",
  semana: "week",
  mes: "month",
};

/**
 * Total cobrado por bucket de tiempo (día/semana/mes), para el gráfico de
 * tendencia de Métricas. Agrupa por `fecha_pago`, no por período cubierto:
 * es "cuánto entró en caja", la misma lógica que `totalCobrado`.
 *
 * `date_trunc` hace el bucketing en la base — para "semana" usa semana ISO
 * (arranca lunes), que es exactamente lo que necesita el selector de vista
 * sin tener que reimplementar esa aritmética en JS.
 */
export async function totalesPorPeriodo(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
  granularidad: GranularidadFacturacion,
) {
  const trunc = TRUNC_SQL[granularidad];
  const filas = await tx
    .select({
      periodo: sql<string>`to_char(date_trunc(${trunc}, ${payments.fechaPago}), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${payments.monto}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.gymId, ctx.gymId),
        isNull(payments.anuladoEn),
        gte(payments.fechaPago, rango.desde),
        lte(payments.fechaPago, rango.hasta),
      ),
    )
    .groupBy(sql`date_trunc(${trunc}, ${payments.fechaPago})`);

  return filas.map((f) => ({ periodo: f.periodo, total: Number(f.total) }));
}

/** Lo cobrado en un rango, agrupado por método de pago. */
export async function totalesPorMetodo(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
) {
  const filas = await tx
    .select({
      clave: payments.metodo,
      total: sql<string>`coalesce(sum(${payments.monto}), 0)`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.gymId, ctx.gymId),
        isNull(payments.anuladoEn),
        gte(payments.fechaPago, rango.desde),
        lte(payments.fechaPago, rango.hasta),
      ),
    )
    .groupBy(payments.metodo);

  return filas.map((f) => ({ clave: f.clave, total: Number(f.total), cantidad: f.cantidad }));
}

/** Lo cobrado en un rango, agrupado por modalidad (mes completo / 1-2 mes). */
export async function totalesPorModalidad(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
) {
  const filas = await tx
    .select({
      clave: payments.modalidad,
      total: sql<string>`coalesce(sum(${payments.monto}), 0)`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.gymId, ctx.gymId),
        isNull(payments.anuladoEn),
        gte(payments.fechaPago, rango.desde),
        lte(payments.fechaPago, rango.hasta),
      ),
    )
    .groupBy(payments.modalidad);

  return filas.map((f) => ({ clave: f.clave, total: Number(f.total), cantidad: f.cantidad }));
}

/** El plan habitual y el estado de un alumno, para el flujo de cobro. */
export async function obtenerAlumnoParaCobro(tx: TxClient, ctx: AuthContext, studentId: string) {
  const [row] = await tx
    .select({
      id: students.id,
      nombre: students.nombre,
      apellido: students.apellido,
      telefono: students.telefono,
      vinculo: students.vinculo,
      fechaAltaOriginal: students.fechaAltaOriginal,
      planId: plans.id,
      planNombre: plans.nombre,
      planDiasSemana: plans.diasSemana,
      planAcceso: plans.acceso,
      planPrecio: plans.precioActual,
    })
    .from(students)
    .innerJoin(plans, eq(plans.id, students.planId))
    .where(and(eq(students.id, studentId), eq(students.gymId, ctx.gymId)));
  return row ?? null;
}

/** Los pagos de UN alumno, para su ficha. Más recientes primero. */
export async function listarPagosDeAlumno(
  tx: TxClient,
  ctx: AuthContext,
  studentId: string,
  limite = 24,
) {
  return tx
    .select({
      id: payments.id,
      fechaPago: payments.fechaPago,
      monto: payments.monto,
      metodo: payments.metodo,
      modalidad: payments.modalidad,
      planNombreSnapshot: payments.planNombreSnapshot,
      nota: payments.nota,
      anuladoEn: payments.anuladoEn,
      anuladoMotivo: payments.anuladoMotivo,
      registradoPorNombre: appUsers.nombre,
      cubreDesde: sql<string | null>`(
        select min(pp.cubre_desde)
        from app.payment_periods pp
        where pp.payment_id = ${payments.id}
      )`,
      cubreHasta: sql<string | null>`(
        select max(pp.cubre_hasta)
        from app.payment_periods pp
        where pp.payment_id = ${payments.id}
      )`,
    })
    .from(payments)
    .innerJoin(appUsers, eq(appUsers.id, payments.registradoPor))
    .where(and(eq(payments.gymId, ctx.gymId), eq(payments.studentId, studentId)))
    .orderBy(desc(payments.fechaPago), desc(payments.createdAt))
    .limit(limite);
}
