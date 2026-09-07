import { check, date, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { students } from "./students";
import { appUsers } from "./appUsers";

/**
 * Hechos de negocio — alimenta el timeline de la ficha del alumno.
 * Distinto de `activityLog` (auditoría técnica): esto es permanente,
 * tipado y curado para leerse; el log de auditoría es append-only con
 * retención acotada y puede tener ruido. SPEC V1 §4.8.
 */
export const studentEvents = appSchema.table(
  "student_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    ocurridoEl: date("ocurrido_el").notNull(),
    datos: jsonb("datos").notNull().default(sql`'{}'::jsonb`),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("student_events_gym_student_fecha_idx").on(t.gymId, t.studentId, t.ocurridoEl),
    check(
      "student_events_tipo_check",
      sql`${t.tipo} in ('ALTA','BAJA','REACTIVACION','PAUSA','REANUDACION','CAMBIO_PLAN','CONTACTO','NOTA')`,
    ),
  ],
);
