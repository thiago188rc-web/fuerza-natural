import { check, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";

/**
 * Contador de intentos fallidos de acceso (login, recuperación de
 * contraseña, verificación de la contraseña actual), compartido entre
 * todas las instancias del servidor: un contador en memoria no sirve en
 * Vercel, donde cada invocación puede caer en una instancia nueva.
 *
 * NO es por gimnasio —el intento ocurre antes de saber quién es— y no
 * guarda nada legible: `clave` es el SHA-256 de "tipo:ip:email", así que
 * la tabla no tiene emails ni IPs. La app nunca la lee ni la escribe
 * directo: pasa por tres funciones SECURITY DEFINER (ver
 * db/migrations/infra/01_rls_and_triggers.sql), y la tabla tiene RLS sin
 * policies para cualquier otro rol.
 */
export const accessAttempts = appSchema.table(
  "access_attempts",
  {
    clave: text("clave").primaryKey(),
    ventanaDesde: timestamp("ventana_desde", { withTimezone: true }).notNull().defaultNow(),
    fallos: integer("fallos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("access_attempts_clave_check", sql`${t.clave} ~ '^[0-9a-f]{64}$'`),
    check("access_attempts_fallos_check", sql`${t.fallos} >= 0`),
  ],
);
