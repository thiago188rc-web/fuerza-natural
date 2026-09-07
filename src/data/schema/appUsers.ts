import { boolean, check, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./_appSchema";
import { gyms } from "./gyms";

/**
 * Autorización de la app. La IDENTIDAD (contraseñas, hashes, tokens, MFA)
 * la maneja Supabase Auth — esta tabla nunca guarda credenciales.
 * `authUserId` referencia `auth.users.id` sin FK cross-schema (se valida
 * en la app); es el índice de la ruta caliente: se consulta en cada request
 * para construir el AuthContext. SPEC V1 §4.3 / §3.3.
 *
 * `email` se normaliza a minúsculas en la app (en vez de citext) para
 * evitar una extensión más — unicidad case-insensitive vía índice en lower().
 */
export const appUsers = appSchema.table(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    authUserId: uuid("auth_user_id").notNull(),
    email: text("email").notNull(),
    nombre: text("nombre").notNull(),
    rol: text("rol").notNull(),
    activo: boolean("activo").notNull().default(true),
    ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("app_users_auth_user_id_key").on(t.authUserId),
    uniqueIndex("app_users_gym_id_email_key").on(t.gymId, t.email),
    check("app_users_rol_check", sql`${t.rol} in ('DUENO','STAFF')`),
    check("app_users_email_lower_check", sql`${t.email} = lower(${t.email})`),
  ],
);
