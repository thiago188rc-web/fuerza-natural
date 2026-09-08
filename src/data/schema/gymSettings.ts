import { check, date, jsonb, numeric, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";

/**
 * Reglas configurables por gimnasio (SPEC V1 §4.2). Tabla aparte de `gyms`
 * a propósito: ciclo de escritura distinto (política vs. identidad), y
 * permisos distintos (STAFF puede leer `gyms`, no necesariamente esto).
 *
 * Máximo ~12 parámetros por diseño (regla anti-sobreingeniería): cada
 * parámetro nuevo es una rama de código y un caso de test más.
 */
export const gymSettings = appSchema.table(
  "gym_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),

    cicloModo: text("ciclo_modo").notNull().default("MES_CALENDARIO"),
    primerPeriodoModo: text("primer_periodo_modo").notNull().default("MES_DE_INGRESO"),

    ventanaPagoDesde: smallint("ventana_pago_desde").notNull().default(1),
    ventanaPagoHasta: smallint("ventana_pago_hasta").notNull().default(10),
    diasGracia: smallint("dias_gracia").notNull().default(5),
    diasNuevoSinPago: smallint("dias_nuevo_sin_pago").notNull().default(7),

    // [{codigo, etiqueta, orden, activo}] — ver SPEC V1 §8.2 (sin categorías
    // de salud; observación siempre opcional).
    motivosBaja: jsonb("motivos_baja")
      .notNull()
      .default(sql`'[
        {"codigo":"ECONOMICO","etiqueta":"Económico","orden":1,"activo":true},
        {"codigo":"FALTA_TIEMPO","etiqueta":"Falta de tiempo","orden":2,"activo":true},
        {"codigo":"HORARIOS","etiqueta":"Horarios","orden":3,"activo":true},
        {"codigo":"MUDANZA","etiqueta":"Mudanza / distancia","orden":4,"activo":true},
        {"codigo":"CAMBIO_GIMNASIO","etiqueta":"Cambió de gimnasio","orden":5,"activo":true},
        {"codigo":"DEJO_DE_ASISTIR","etiqueta":"Dejó de asistir","orden":6,"activo":true},
        {"codigo":"AVISO_RETIRO","etiqueta":"Avisó que se retira","orden":7,"activo":true},
        {"codigo":"OTRO","etiqueta":"Otro","orden":8,"activo":true}
      ]'::jsonb`),

    /**
     * Precio de la modalidad "1/2 MES" (15 días consecutivos), confirmado
     * por el dueño en $45.000 — ver docs/REGLAS-DE-NEGOCIO.md §3.
     *
     * Vive acá y NO como una fila de `plans` a propósito: `students.planId`
     * referencia `plans`, así que un "1/2 MES" ahí dentro podría asignarse
     * como plan HABITUAL de un alumno — exactamente lo que la regla
     * confirmada prohíbe. Es una modalidad de cobertura del pago, no un
     * plan de la persona.
     *
     * Nullable por la misma razón que `plans.precioActual`: "todavía no
     * confirmado" es un estado real, y un 0 mentiría.
     */
    precioMedioMes: numeric("precio_medio_mes", { precision: 12, scale: 2 }),

    // Gracia post-migración: sin alertas para altas anteriores a esta fecha.
    // Default a "hoy" en la migración inicial; el dueño/importador la ajusta.
    alertasDesde: date("alertas_desde").notNull().defaultNow(),

    // Fase 3 (no usado todavía) — la columna existe para no migrar en el futuro.
    inactividadDias: smallint("inactividad_dias").notNull().default(10),
    inactividadCoberturaMin: numeric("inactividad_cobertura_min", { precision: 3, scale: 2 })
      .notNull()
      .default("0.50"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gym_settings_gym_id_key").on(t.gymId),
    check(
      "gym_settings_ciclo_modo_check",
      sql`${t.cicloModo} in ('MES_CALENDARIO','DESDE_ALTA')`,
    ),
    check(
      "gym_settings_primer_periodo_modo_check",
      sql`${t.primerPeriodoModo} in ('MES_DE_INGRESO','MES_SIGUIENTE')`,
    ),
    check("gym_settings_ventana_desde_check", sql`${t.ventanaPagoDesde} between 1 and 28`),
    check("gym_settings_ventana_hasta_check", sql`${t.ventanaPagoHasta} between 1 and 28`),
    check("gym_settings_gracia_check", sql`${t.diasGracia} between 0 and 20`),
    check("gym_settings_nuevo_sin_pago_check", sql`${t.diasNuevoSinPago} between 1 and 60`),
    check(
      "gym_settings_precio_medio_mes_check",
      sql`${t.precioMedioMes} is null or ${t.precioMedioMes} >= 0`,
    ),
  ],
);
