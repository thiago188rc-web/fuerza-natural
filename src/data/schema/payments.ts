import { check, date, numeric, smallint, text, timestamp, uniqueIndex, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { students } from "./students";
import { plans } from "./plans";
import { appUsers } from "./appUsers";

/**
 * Append-only salvo anulación. `planDiasSnapshot`/`planNombreSnapshot`/
 * `monto` son una FOTO inmutable del momento del pago — SOBREVIVEN a
 * cambios posteriores en `plans.precioActual`. Confirmado por Data
 * Discovery: los precios de Fuerza Natural subieron 3 veces en 7 meses
 * reales (SPEC V1 §7 del discovery). Corregir un pago = anular + volver a
 * registrar; nunca UPDATE de monto/plan (protegido también por trigger en
 * la migración de RLS, no solo por convención de la app).
 */
export const payments = appSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),

    fechaPago: date("fecha_pago").notNull(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    planDiasSnapshot: smallint("plan_dias_snapshot").notNull(),
    planNombreSnapshot: text("plan_nombre_snapshot").notNull(),

    // QUÉ se cobró, que no es lo mismo que el plan del alumno. Un alumno
    // de 5 días puede pagar un MEDIO_MES sin que su plan cambie (regla
    // confirmada — docs/REGLAS-DE-NEGOCIO.md §3, §4). `planId` +
    // `plan*Snapshot` siguen registrando cuál era su plan habitual en ese
    // momento; `modalidad` registra qué cobertura compró.
    modalidad: text("modalidad").notNull().default("MES_COMPLETO"),

    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    metodo: text("metodo").notNull().default("EFECTIVO"),
    nota: text("nota"),

    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: uuid("anulado_por").references(() => appUsers.id),
    anuladoMotivo: text("anulado_motivo"),

    registradoPor: uuid("registrado_por")
      .notNull()
      .references(() => appUsers.id),
    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_gym_student_fecha_idx").on(t.gymId, t.studentId, t.fechaPago),
    index("payments_gym_fecha_idx").on(t.gymId, t.fechaPago),
    uniqueIndex("payments_gym_idempotency_key")
      .on(t.gymId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),

    check("payments_monto_check", sql`${t.monto} >= 0`),
    check("payments_modalidad_check", sql`${t.modalidad} in ('MES_COMPLETO','MEDIO_MES')`),
    check(
      "payments_metodo_check",
      sql`${t.metodo} in ('EFECTIVO','TRANSFERENCIA','BILLETERA','OTRO')`,
    ),
    check(
      "payments_anulacion_coherencia_check",
      sql`(${t.anuladoEn} is null) = (${t.anuladoMotivo} is null)`,
    ),
    check("payments_fecha_no_futura_check", sql`${t.fechaPago} <= current_date + 1`),
  ],
);
