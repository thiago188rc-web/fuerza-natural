import { check, date, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";
import { plans } from "./plans";

/**
 * La única fuente de verdad de la persona. El único campo de estado que
 * se PERSISTE es `vinculo` — situación de pago y señal de actividad se
 * calculan siempre, nunca se guardan (SPEC V1 §5, §9). No existen columnas
 * `estado_pago`, `moroso`, `vencimiento`, `ultimo_pago`: guardar un estado
 * calculado es la fuente clásica de datos que se desincronizan.
 *
 * `nombreBusqueda` requiere las extensiones `unaccent` (búsqueda sin
 * acentos) y `pg_trgm` (índice GIN, tolera errores de tipeo) — se habilitan
 * en la migración de roles/extensiones, no en este archivo.
 */
export const students = appSchema.table(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),

    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    // public.immutable_unaccent es un wrapper IMMUTABLE alrededor de
    // unaccent() (que es STABLE) — Postgres exige inmutabilidad acá.
    // Definido en db/migrations/infra/00_extensions_and_roles.sql.
    nombreBusqueda: text("nombre_busqueda").generatedAlwaysAs(
      () => sql`public.immutable_unaccent(lower(nombre || ' ' || apellido))`,
    ),

    // OPCIONAL desde Fase 1 (era NOT NULL en Fase 0). Dos razones concretas:
    // (a) el brief de Fase 1 §7 lo define opcional; (b) los datos reales del
    // Data Discovery tienen alumnos sin teléfono, y un NOT NULL obligaría a
    // inventar un valor durante la migración de Fase 5 — exactamente el tipo
    // de dato falso que este sistema existe para evitar. El formato E.164
    // se sigue exigiendo cuando el valor está presente.
    telefono: text("telefono"),
    email: text("email"),
    documento: text("documento"),
    fechaNacimiento: date("fecha_nacimiento"),
    // Opcional, cargado a mano. Nadie lo pidió como obligatorio (Data
    // Discovery no lo relevó) — un alumno sin dato queda "sin especificar",
    // nunca se infiere. Ver docs/DECISIONES.md.
    genero: text("genero"),

    // El único estado persistido. Ninguna transición ocurre automáticamente
    // — cambia solo por una acción humana explícita (alta/pausa/baja/reactivación).
    vinculo: text("vinculo").notNull().default("ACTIVO"),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),

    fechaAltaOriginal: date("fecha_alta_original").notNull(),
    vinculoDesde: date("vinculo_desde").notNull(),

    pausaHasta: date("pausa_hasta"),
    pausaNota: text("pausa_nota"),

    bajaFecha: date("baja_fecha"),
    bajaMotivoCodigo: text("baja_motivo_codigo"),
    bajaMotivoEtiqueta: text("baja_motivo_etiqueta"),
    bajaObservacion: text("baja_observacion"),

    notas: text("notas"),
    origen: text("origen").notNull().default("MANUAL"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("students_gym_id_vinculo_idx").on(t.gymId, t.vinculo),
    index("students_nombre_busqueda_trgm_idx")
      .using("gin", sql`${t.nombreBusqueda} gin_trgm_ops`),
    uniqueIndex("students_gym_id_documento_key")
      .on(t.gymId, t.documento)
      .where(sql`${t.documento} is not null`),

    check(
      "students_telefono_check",
      sql`${t.telefono} is null or ${t.telefono} ~ '^\\+[1-9]\\d{7,14}$'`,
    ),
    check("students_nombre_len_check", sql`length(${t.nombre}) between 1 and 80`),
    check("students_apellido_len_check", sql`length(${t.apellido}) between 1 and 80`),
    check("students_pausa_nota_len_check", sql`${t.pausaNota} is null or length(${t.pausaNota}) <= 300`),
    check("students_baja_obs_len_check", sql`${t.bajaObservacion} is null or length(${t.bajaObservacion}) <= 500`),
    check("students_notas_len_check", sql`${t.notas} is null or length(${t.notas}) <= 1000`),

    check("students_vinculo_check", sql`${t.vinculo} in ('ACTIVO','PAUSADO','BAJA')`),
    check("students_origen_check", sql`${t.origen} in ('MANUAL','IMPORTACION')`),
    check(
      "students_genero_check",
      sql`${t.genero} is null or ${t.genero} in ('FEMENINO','MASCULINO','OTRO','PREFIERO_NO_DECIR')`,
    ),

    // Reglas de integridad exigidas por SPEC V1 §4.5 — se verifican en la
    // base, no solo en la app.
    check(
      "students_baja_coherencia_check",
      sql`${t.vinculo} <> 'BAJA' or (${t.bajaFecha} is not null and ${t.bajaMotivoCodigo} is not null)`,
    ),
    check(
      "students_pausa_coherencia_check",
      sql`${t.vinculo} <> 'PAUSADO' or (${t.pausaHasta} is not null or ${t.pausaNota} is not null)`,
    ),
    check(
      "students_vinculo_desde_check",
      sql`${t.vinculoDesde} >= ${t.fechaAltaOriginal}`,
    ),
  ],
);
