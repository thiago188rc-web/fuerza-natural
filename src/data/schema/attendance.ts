import { boolean, date, index, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { students } from "./students";
import { appUsers } from "./appUsers";

/**
 * EL HECHO, nada más: "este alumno vino este día". No guarda una fórmula
 * de asistencia esperada ni un porcentaje — eso se deriva al consultar
 * (ver `src/domain/metricas/`), igual que la situación de pago nunca se
 * persiste (`students.vinculo` ≠ situación de pago).
 *
 * `activo` en vez de un DELETE para deshacer un toque accidental: el rol
 * `fn_app` no tiene privilegio DELETE en ninguna tabla (defensa en
 * profundidad, mismo criterio que `students`/`payments`), así que
 * "deshacer" es un UPDATE que pone `activo = false` — nunca se borra la
 * fila. Volver a marcar el mismo día reactiva la fila existente en vez de
 * duplicarla (`attendance_gym_student_fecha_key`).
 */
export const attendance = appSchema.table(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),

    fecha: date("fecha").notNull(),
    activo: boolean("activo").notNull().default(true),

    registradoPor: uuid("registrado_por").references(() => appUsers.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_gym_student_fecha_key").on(t.gymId, t.studentId, t.fecha),
    index("attendance_gym_fecha_idx").on(t.gymId, t.fecha),
  ],
);
