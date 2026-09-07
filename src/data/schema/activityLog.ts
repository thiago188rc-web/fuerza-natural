import { inet, jsonb, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { appUsers } from "./appUsers";

/**
 * Auditoría append-only. Protegida en CUATRO capas independientes
 * (SPEC V1 §3.6, §4.10): (1) permisos — fn_app tiene GRANT SELECT,INSERT
 * pero NUNCA UPDATE/DELETE; (2) RLS — solo existen policies de SELECT e
 * INSERT, no hay policy de UPDATE/DELETE (denegado por defecto); (3) un
 * trigger BEFORE UPDATE OR DELETE que lanza excepción, por si una
 * migración futura reconcede permisos por error; (4) sin superficie: no
 * hay caso de uso ni pantalla que edite o borre esto. Las capas 2-3 se
 * implementan en la migración de RLS, no en este archivo.
 *
 * `actorEmailSnapshot`/`actorRolSnapshot` existen para que desactivar o
 * modificar un usuario no borre el rastro de lo que hizo.
 */
export const activityLog = appSchema.table(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    actorEmailSnapshot: text("actor_email_snapshot").notNull(),
    actorRolSnapshot: text("actor_rol_snapshot").notNull(),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id"),
    resumen: text("resumen").notNull(),
    cambios: jsonb("cambios"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_log_gym_fecha_idx").on(t.gymId, t.ocurridoEn),
    index("activity_log_gym_entidad_idx").on(t.gymId, t.entidad, t.entidadId, t.ocurridoEn),
  ],
);
