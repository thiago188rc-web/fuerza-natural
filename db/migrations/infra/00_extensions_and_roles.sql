-- =============================================================================
-- 00_extensions_and_roles.sql
-- Se aplica ANTES de las migraciones de esquema (drizzle-kit), vía
-- scripts/db/migrate.ts, con una conexión que tenga privilegios para crear
-- extensiones y roles (fn_owner, o el usuario admin del proveedor).
--
-- NOTA SUPABASE: en un proyecto Supabase, CREATE ROLE normalmente requiere
-- ejecutarse desde el SQL Editor del dashboard (como `postgres`/superusuario
-- gestionado), no desde una conexión aplicativa. Este archivo es la fuente
-- de verdad de qué roles/permisos deben existir — se ejecuta ahí la primera
-- vez, y luego queda documentado y versionado acá. Ver docs/RUNBOOK.md.
--
-- BOOTSTRAP MANUAL PREVIO (una sola vez, con el rol `postgres`/superusuario
-- del proveedor — verificado contra Postgres 17 real, no solo documentado):
--   GRANT CREATE ON DATABASE <nombre_db> TO fn_owner;
--   GRANT CREATE ON SCHEMA public TO fn_owner;
-- Desde Postgres 15, el esquema `public` ya NO otorga CREATE a todos los
-- roles por defecto (ni siquiera al dueño de la base) — sin este segundo
-- GRANT, fn_owner no puede crear la función wrapper de unaccent() más abajo.
--
-- SPEC V1 §3.2 — Diseño corregido: tres roles de PostgreSQL y contexto por
-- transacción. Ninguno de los tres es superusuario ni BYPASSRLS.
-- =============================================================================

-- --- Extensiones -------------------------------------------------------------
-- unaccent: búsqueda de alumnos sin acentos (nombre_busqueda generado).
-- pg_trgm: índice GIN con similitud de texto, tolera errores de tipeo.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() es STABLE, no IMMUTABLE (Postgres no puede garantizar que el
-- diccionario no cambie) — y Postgres EXIGE que la expresión de una columna
-- GENERATED ALWAYS AS sea inmutable. Este wrapper fija el diccionario
-- explícitamente y se declara IMMUTABLE a propósito: para nuestro caso de
-- uso (normalizar nombres para buscar) esa garantía es aceptable. Sin este
-- wrapper, `students.nombre_busqueda` no puede crearse — se descubrió
-- ejecutando la migración contra Postgres real, no por revisión de código.
-- Vive en `public` (no en `app`): este archivo corre ANTES de que
-- drizzle-kit cree el esquema `app`.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

-- --- Roles ---------------------------------------------------------------
-- fn_owner: SOLO migraciones (CI y local). Nunca la app. Es quien puede
-- crear/alterar tablas, y quien crea las policies. NOBYPASSRLS explícito
-- por si el proveedor lo marca BYPASSRLS por defecto en algún plan.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fn_owner') THEN
    CREATE ROLE fn_owner WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'CAMBIAR_EN_PRODUCCION';
  END IF;
END $$;

-- fn_app: la aplicación en runtime. Sin DELETE. Sin TRUNCATE. NOBYPASSRLS
-- — es la propiedad que hace que RLS se aplique de verdad (ver nota crítica
-- abajo: el error más común es que la conexión de la app use un rol que,
-- por ser owner de las tablas o por BYPASSRLS, ignora las policies).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fn_app') THEN
    CREATE ROLE fn_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'CAMBIAR_EN_PRODUCCION';
  END IF;
END $$;

-- fn_readonly: exportaciones y diagnóstico manual. Sujeto a RLS igual que fn_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fn_readonly') THEN
    CREATE ROLE fn_readonly WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'CAMBIAR_EN_PRODUCCION';
  END IF;
END $$;

-- El esquema "app" lo crea la migración de drizzle-kit que corre DESPUÉS de
-- este archivo (0000_schema_inicial.sql) — quien la ejecute (fn_owner) queda
-- como su owner automáticamente. Para que eso funcione, fn_owner necesita
-- privilegio CREATE sobre la base de datos:
--   GRANT CREATE ON DATABASE <nombre_db> TO fn_owner;
-- En Supabase esto se otorga una sola vez desde el SQL Editor con el rol
-- `postgres` del proyecto. Documentado en docs/RUNBOOK.md — no se automatiza
-- acá porque el nombre de la base varía por entorno.
