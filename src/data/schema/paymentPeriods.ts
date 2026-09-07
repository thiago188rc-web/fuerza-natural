import { check, date, index, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { payments } from "./payments";
import { students } from "./students";

/**
 * Los meses que cubre un pago. `periodo` es SIEMPRE el día 1 del mes
 * cubierto — así "¿quién tiene cubierto septiembre?" es un WHERE indexado,
 * no una aritmética de rangos. Representa naturalmente meses NO
 * consecutivos (alguien que en noviembre paga septiembre y noviembre,
 * salteando octubre) — SPEC V1 §4.7.
 *
 * Sin UNIQUE(student_id, periodo) a propósito: un segundo pago del mismo
 * mes puede ser legítimo (ajuste por cambio de plan a mitad de mes). El
 * duplicado se ADVIERTE en el caso de uso, no se bloquea en la base.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_periods_gym_periodo_idx").on(t.gymId, t.periodo),
    index("payment_periods_gym_student_periodo_idx").on(t.gymId, t.studentId, t.periodo),
    check("payment_periods_periodo_dia1_check", sql`extract(day from ${t.periodo}) = 1`),
  ],
);
