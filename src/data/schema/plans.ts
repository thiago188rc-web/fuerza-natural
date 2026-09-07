import { boolean, check, numeric, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";

/**
 * `precioActual` es SOLO para autocompletar el formulario de pago.
 * El histórico real vive en el snapshot de cada `payments` row — nunca acá.
 * Nunca borrar un plan referenciado: soft-delete vía `activo`. SPEC V1 §4.4.
 */
export const plans = appSchema.table(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    diasSemana: smallint("dias_semana").notNull(),
    precioActual: numeric("precio_actual", { precision: 12, scale: 2 }).notNull(),
    activo: boolean("activo").notNull().default(true),
    orden: smallint("orden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plans_gym_id_nombre_key").on(t.gymId, t.nombre),
    check("plans_dias_semana_check", sql`${t.diasSemana} between 1 and 7`),
    check("plans_precio_check", sql`${t.precioActual} >= 0`),
  ],
);
