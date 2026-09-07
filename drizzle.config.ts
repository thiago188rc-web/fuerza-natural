import { defineConfig } from "drizzle-kit";

// drizzle-kit "generate" no necesita una conexión real (diffea contra el
// historial de migraciones en disco). "migrate"/"push"/"studio" sí la usan,
// vía DATABASE_URL_OWNER (rol fn_owner, solo para migraciones — nunca el rol
// de runtime de la app). Ver docs/ARCHITECTURE.md §Seguridad de base de datos.
export default defineConfig({
  schema: "./src/data/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  schemaFilter: ["app"],
  dbCredentials: {
    url: process.env.DATABASE_URL_OWNER ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
  verbose: true,
  strict: true,
});
