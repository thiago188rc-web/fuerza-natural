import { check, date, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { students } from "./students";
import { appUsers } from "./appUsers";

/**
 * El mecanismo anti-fatiga de alertas. Sin esto, una señal que el dueño ya
 * atendió reaparece cada día hasta que aprende a ignorar la bandeja — el
 * modo de falla que mata al producto (SPEC V1 §4.9, §17.2 autorevisión).
 * `contexto` (ej. "2026-09") hace que la señal se reabra sola en un
 * período nuevo, en vez de quedar silenciada para siempre.
 */
export const attentionDismissals = appSchema.table(
  "attention_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    tipoSenal: text("tipo_senal").notNull(),
    contexto: text("contexto").notNull(),
    silenciarHasta: date("silenciar_hasta"),
    nota: text("nota"),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attention_dismissals_unq").on(t.gymId, t.studentId, t.tipoSenal, t.contexto),
    check(
      "attention_dismissals_tipo_check",
      sql`${t.tipoSenal} in ('PAGO_PENDIENTE','NUEVO_SIN_PAGO','PAUSA_VENCIDA','POSIBLE_DUPLICADO','INACTIVIDAD')`,
    ),
    check("attention_dismissals_nota_len_check", sql`${t.nota} is null or length(${t.nota}) <= 200`),
  ],
);
