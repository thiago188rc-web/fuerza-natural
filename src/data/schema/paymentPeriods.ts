import { check, date, index, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { payments } from "./payments";
import { students } from "./students";

/**
 * LO QUE UN PAGO CUBRE. Sigue siendo un modelo de "período cubierto" —
 * nunca "último pago + 30 días".
 *
 * `periodo` es SIEMPRE el día 1 del mes al que se imputa la cobertura, así
 * "¿quién tiene cubierto septiembre?" es un WHERE indexado y no una
 * aritmética de rangos. Representa naturalmente meses NO consecutivos
 * (alguien que en noviembre paga septiembre y noviembre, salteando
 * octubre) — SPEC V1 §4.7.
 *
 * `cubreDesde`/`cubreHasta` se agregaron cuando el dueño confirmó la
 * modalidad "1/2 MES" (docs/REGLAS-DE-NEGOCIO.md §3). Solo con `periodo`
 * esa modalidad era IMPOSIBLE de representar sin mentir: 15 días
 * consecutivos que pueden empezar cualquier día del mes no son "septiembre
 * cubierto", y marcarlos como tal habría hecho que Fase 2 calculara la
 * situación de pago sobre un dato falso.
 *
 * Para un mes completo, el rango es el día 1 al último día del mes; para
 * medio mes, los 15 días que el dueño elija. Si un medio mes cruza el fin
 * de mes (empieza el 25), el caso de uso de Fase 2 puede generar una fila
 * por cada mes tocado: `periodo` es siempre el mes en el que ARRANCA el
 * tramo de esa fila, y el CHECK de abajo lo garantiza.
 *
 * Sin UNIQUE(student_id, periodo) a propósito: un segundo pago del mismo
 * mes puede ser legítimo (medio mes + medio mes, o un ajuste por cambio de
 * plan). El duplicado se ADVIERTE en el caso de uso, no se bloquea acá.
 */
export const paymentPeriods = appSchema.table(
  "payment_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    periodo: date("periodo").notNull(),
    cubreDesde: date("cubre_desde").notNull(),
    cubreHasta: date("cubre_hasta").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_periods_gym_periodo_idx").on(t.gymId, t.periodo),
    index("payment_periods_gym_student_periodo_idx").on(t.gymId, t.studentId, t.periodo),
    index("payment_periods_gym_student_cobertura_idx").on(t.gymId, t.studentId, t.cubreDesde),

    check("payment_periods_periodo_dia1_check", sql`extract(day from ${t.periodo}) = 1`),
    check("payment_periods_rango_check", sql`${t.cubreHasta} >= ${t.cubreDesde}`),
    // `periodo` no es un dato suelto: es el mes en el que arranca este
    // tramo de cobertura. Verificado contra Postgres 17 real que
    // date_trunc() es aceptable en un CHECK (es IMMUTABLE sobre date).
    check(
      "payment_periods_periodo_coherente_check",
      sql`${t.periodo} = date_trunc('month', ${t.cubreDesde})::date`,
    ),
  ],
);
