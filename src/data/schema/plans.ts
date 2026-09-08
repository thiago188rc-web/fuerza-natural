import { boolean, check, numeric, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";

/**
 * El PLAN HABITUAL del alumno. Es una referencia estable: registrar un pago
 * con otra modalidad NO cambia el plan del alumno (regla confirmada por el
 * dueño — ver docs/REGLAS-DE-NEGOCIO.md §4).
 *
 * `precioActual` es SOLO para autocompletar el formulario de pago.
 * El histórico real vive en el snapshot de cada `payments` row — nunca acá.
 * Nunca borrar un plan referenciado: soft-delete vía `activo`. SPEC V1 §4.4.
 *
 * `acceso` distingue los planes de días fijos (2/3/4/5 días) de LIBRE, que
 * el dueño definió como "5 días o más por semana, incluye sábados". Un
 * `dias_semana` solo no puede expresar eso: 5 sería una mentira (dice
 * "exactamente 5") y 6 sería inventar un número que nadie confirmó. Con
 * `acceso = 'LIBRE'`, `dias_semana` se lee como el PISO de días, no como
 * el total.
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
    // NULLABLE a propósito: "precio todavía no confirmado" es un estado
    // real del negocio (hoy, el de LIBRE). Un 0 sería peor que un NULL —
    // diría "este plan es gratis" y Fase 2 lo autocompletaría como monto.
    precioActual: numeric("precio_actual", { precision: 12, scale: 2 }),
    acceso: text("acceso").notNull().default("DIAS_FIJOS"),
    activo: boolean("activo").notNull().default(true),
    orden: smallint("orden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plans_gym_id_nombre_key").on(t.gymId, t.nombre),
    check("plans_dias_semana_check", sql`${t.diasSemana} between 1 and 7`),
    check("plans_precio_check", sql`${t.precioActual} is null or ${t.precioActual} >= 0`),
    check("plans_acceso_check", sql`${t.acceso} in ('DIAS_FIJOS','LIBRE')`),
  ],
);
