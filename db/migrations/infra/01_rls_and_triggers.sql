-- =============================================================================
-- 01_rls_and_triggers.sql
-- Se aplica DESPUÉS de que existan las 10 tablas (00_extensions_and_roles.sql
-- y luego la migración de esquema de drizzle-kit ya corrieron). Con fn_owner.
--
-- SPEC V1 §3.2, §3.6 — Esto es lo que hace que "aislamiento por gym_id" sea
-- un hecho verificable y no una promesa. Tres propiedades no negociables:
--
--   1. fn_app NO es owner de las tablas → RLS se le aplica siempre.
--      (El owner de una tabla omite RLS salvo FORCE ROW LEVEL SECURITY —
--      por eso el paso 3 de cada tabla es FORCE, no solo ENABLE.)
--   2. Las policies usan current_setting('app.gym_id', true), NUNCA
--      auth.uid() — auth.uid() depende de que PostgREST setee el JWT claim,
--      cosa que una conexión directa de Drizzle no hace. Sin este cambio,
--      toda policy evaluaría NULL (bloquea todo, o alguien la "arregla"
--      abriéndola).
--   3. Si el contexto de tenant no se seteó (bug de programación), la
--      policy falla CERRADO: current_setting(...,true) da NULL, nullif
--      también, la comparación es NULL → cero filas. Nunca "todas las filas".
-- =============================================================================

-- IDEMPOTENCIA (agregado en Fase 1): cada CREATE POLICY / CREATE TRIGGER va
-- precedido de su DROP ... IF EXISTS. Postgres no soporta
-- `CREATE POLICY IF NOT EXISTS`, así que sin esto la tercera capa fallaba con
-- 42710 ("policy already exists") la segunda vez que se corría
-- `npm run db:migrate` — que es justamente lo que pasa al agregar cualquier
-- migración de esquema nueva. Descubierto al agregar la migración de Fase 1.

-- --- Permisos base -----------------------------------------------------------

GRANT USAGE ON SCHEMA app TO fn_app, fn_readonly;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO fn_app;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO fn_readonly;

-- Defensa en profundidad: DELETE/TRUNCATE nunca se otorgan, y lo revocamos
-- explícitamente por si alguna migración futura los concede por error.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA app FROM fn_app, fn_readonly, PUBLIC;

-- activity_log es la excepción: ni siquiera UPDATE. Es append-only por permiso,
-- no solo por trigger (capa 1 de las 4 descriptas en SPEC V1 §3.6).
REVOKE UPDATE ON app.activity_log FROM fn_app;

-- Cualquier tabla que fn_owner cree en el futuro dentro de `app` hereda los
-- mismos permisos por defecto — evita que alguien agregue una tabla nueva
-- y se olvide de otorgarle permisos a fn_app/fn_readonly (u, olvide RLS).
ALTER DEFAULT PRIVILEGES FOR ROLE fn_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE ON TABLES TO fn_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fn_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO fn_readonly;

-- --- RLS: encender + forzar + policy uniforme por tabla ----------------------
-- Mismo patrón en las 10 tablas, sin excepciones — incluida `gyms` (usa su
-- propia `id` como columna de comparación, porque el gimnasio ES el tenant).
-- Una regla idéntica en las 10 tablas es la que evita el "a esta tabla se
-- me olvidó" (SPEC V1 §3.2).

ALTER TABLE app.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.gyms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.gyms;
CREATE POLICY tenant_isolation ON app.gyms FOR ALL
  USING (id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.gym_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.gym_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.gym_settings;
CREATE POLICY tenant_isolation ON app.gym_settings FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

-- app_users es la ÚNICA de las 10 tablas SIN FORCE. A propósito, y por un
-- motivo verificado empíricamente contra Postgres real (no solo leído en
-- la documentación): con FORCE, hasta el propio owner de la tabla (fn_owner)
-- queda sujeto a RLS — lo cual rompe el problema de arranque de la
-- autenticación: para saber a qué gimnasio pertenece un usuario hay que
-- LEER `app_users` antes de poder setear app.gym_id (no se puede setear el
-- contexto de un tenant que todavía no conocemos). Sin FORCE, fn_owner (y
-- una función SECURITY DEFINER de su propiedad) sigue exenta de RLS como
-- corresponde a un owner — pero fn_app, que nunca es owner, sigue 100%
-- sujeta a la policy en cualquier consulta directa. Ver
-- app.get_app_user_by_auth_id() más abajo, que es el ÚNICO camino permitido
-- para ese lookup — nunca un SELECT directo de fn_app contra esta tabla.
ALTER TABLE app.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.app_users;
CREATE POLICY tenant_isolation ON app.app_users FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

-- El ÚNICO camino permitido para leer app_users sin conocer todavía el
-- gym_id (el problema de arranque de la autenticación: getAuthContext()
-- necesita esto para saber QUÉ gym_id setear a continuación). SECURITY
-- DEFINER + owner fn_owner + app_users SIN FORCE = esta función sí puede
-- ver la fila sin contexto de tenant; fn_app SOLO puede llegar a esa fila
-- a través de esta función exacta, nunca con un SELECT directo (que sigue
-- devolviendo 0 filas sin contexto, como cualquier otra tabla). search_path
-- fijo para blindar contra un ataque de secuestro de search_path.
CREATE OR REPLACE FUNCTION app.get_app_user_by_auth_id(p_auth_user_id uuid)
RETURNS TABLE (id uuid, gym_id uuid, rol text, activo boolean, email text, nombre text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app, pg_temp
AS $$
  SELECT au.id, au.gym_id, au.rol, au.activo, au.email, au.nombre
  FROM app.app_users au
  WHERE au.auth_user_id = p_auth_user_id;
$$;

REVOKE ALL ON FUNCTION app.get_app_user_by_auth_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_app_user_by_auth_id(uuid) TO fn_app;

ALTER TABLE app.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.plans;
CREATE POLICY tenant_isolation ON app.plans FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.students;
CREATE POLICY tenant_isolation ON app.students FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.payments;
CREATE POLICY tenant_isolation ON app.payments FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.payment_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.payment_periods;
CREATE POLICY tenant_isolation ON app.payment_periods FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.student_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.student_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.student_events;
CREATE POLICY tenant_isolation ON app.student_events FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE app.attention_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attention_dismissals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.attention_dismissals;
CREATE POLICY tenant_isolation ON app.attention_dismissals FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

-- activity_log: RLS + FORCE también, pero solo con policies de SELECT e
-- INSERT. NO existe policy de UPDATE ni de DELETE — sin policy, la
-- operación queda denegada por defecto (capa 2 de las 4 de SPEC V1 §3.6).
ALTER TABLE app.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.activity_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON app.activity_log;
CREATE POLICY tenant_isolation_select ON app.activity_log FOR SELECT
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON app.activity_log;
CREATE POLICY tenant_isolation_insert ON app.activity_log FOR INSERT
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);

-- --- Trigger: activity_log es append-only también a nivel trigger -----------
-- Capa 3 de las 4: por si una migración futura reconcede UPDATE/DELETE por
-- error, esto sigue bloqueando. Cero superficie de edición, ni oculta.
CREATE OR REPLACE FUNCTION app.reject_activity_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity_log es append-only: % no esta permitido sobre esta tabla', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS activity_log_no_update_delete ON app.activity_log;
CREATE TRIGGER activity_log_no_update_delete
  BEFORE UPDATE OR DELETE ON app.activity_log
  FOR EACH ROW
  EXECUTE FUNCTION app.reject_activity_log_mutation();

-- --- Trigger: payments es inmutable salvo la anulación -----------------------
-- "Corregir un pago = anular + volver a registrar. Nunca editar." (SPEC V1
-- §4.6). El UPDATE que llega para anular SOLO puede tocar anulado_en /
-- anulado_por / anulado_motivo — cualquier otro cambio se rechaza acá,
-- no solo por convención de la app.
CREATE OR REPLACE FUNCTION app.guard_payment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.gym_id IS DISTINCT FROM OLD.gym_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.plan_dias_snapshot IS DISTINCT FROM OLD.plan_dias_snapshot
    OR NEW.plan_nombre_snapshot IS DISTINCT FROM OLD.plan_nombre_snapshot
    OR NEW.monto IS DISTINCT FROM OLD.monto
    OR NEW.metodo IS DISTINCT FROM OLD.metodo
    OR NEW.nota IS DISTINCT FROM OLD.nota
    OR NEW.registrado_por IS DISTINCT FROM OLD.registrado_por
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'payments es inmutable salvo anulacion (anulado_en/anulado_por/anulado_motivo). Para corregir un pago: anularlo y registrar uno nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_guard_update ON app.payments;
CREATE TRIGGER payments_guard_update
  BEFORE UPDATE ON app.payments
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_payment_update();
