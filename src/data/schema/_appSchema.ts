import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Todas las tablas de negocio viven en el esquema `app`, no en `public`.
 * Esto es una decisión de seguridad deliberada (SPEC V1 §3.2): el Data API
 * de Supabase (PostgREST) solo expone `public` por defecto, así que aunque
 * la anon key se filtre, no da acceso a un solo dato de negocio.
 */
export const appSchema = pgSchema("app");
