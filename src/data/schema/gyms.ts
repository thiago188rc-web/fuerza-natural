import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./_appSchema";

/**
 * El tenant. Hoy una sola fila (Fuerza Natural). Existe desde la primera
 * migración porque agregar el aislamiento multi-gimnasio después, con datos
 * reales en producción, es una migración de alto riesgo — hacerlo ahora
 * cuesta una tabla y una columna. Ver SPEC V1 §4.1 y §18.4 (preparación
 * NEXA GYM OS).
 */
export const gyms = appSchema.table("gyms", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  moneda: text("moneda").notNull().default("ARS"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
