# SECURITY.md — Fuerza Natural / NEXA GYM OS

Este documento describe la arquitectura de seguridad TAL COMO ESTÁ
IMPLEMENTADA y VERIFICADA contra PostgreSQL 17 real (no solo diseñada) —
ver `docs/RUNBOOK.md` para cómo reproducir el entorno. Todo lo marcado
"verificado empíricamente" tiene un test automatizado correspondiente en
`tests/integration/tenant-isolation.test.ts`.

Referencia de diseño completa: la especificación de producto (SPEC V1,
§3) — este documento no la repite entera, se enfoca en **cómo quedó
implementado realmente** y en los ajustes que la implementación real exigió
sobre el diseño original.

---

## 1. Los tres roles de PostgreSQL

| Rol | Uso | Privilegios reales |
|---|---|---|
| `fn_owner` | Solo migraciones (`npm run db:migrate`, CI) | Owner del esquema `app`. DDL completo. `NOBYPASSRLS`. |
| `fn_app` | La aplicación en runtime (`DATABASE_URL`) | `USAGE` en `app`. `SELECT, INSERT, UPDATE` en las 10 tablas — **sin `DELETE`, sin `TRUNCATE`** (revocado explícitamente). En `activity_log`: solo `SELECT, INSERT` (`UPDATE` revocado). `EXECUTE` en `app.get_app_user_by_auth_id` únicamente. `NOBYPASSRLS`. |
| `fn_readonly` | Exportaciones / diagnóstico manual | `SELECT` en las 10 tablas. Sujeto a RLS igual que `fn_app`. Sin `EXECUTE` en `get_app_user_by_auth_id`. |

Verificado empíricamente: `fn_app` intentando `DELETE` → `permiso denegado
a la tabla students`. `fn_readonly` intentando llamar a
`get_app_user_by_auth_id` → `permiso denegado a la función`.

## 2. Esquema `app`, no `public`

Las 10 tablas de negocio viven en `app.*`. El Data API de Supabase
(PostgREST) solo expone `public` por defecto — aunque la `anon key` se
filtre, no da acceso a un solo dato de negocio. `public` queda casi vacío
(solo la función `immutable_unaccent`, ver §5).

## 3. RLS: el diseño y el ajuste real que hizo falta

### 3.1 El patrón, en 9 de las 10 tablas

```sql
ALTER TABLE app.<tabla> ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.<tabla> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.<tabla> FOR ALL
  USING (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = nullif(current_setting('app.gym_id', true), '')::uuid);
```

`gyms` usa la misma policy pero comparando su propio `id` (el gimnasio ES
el tenant). `activity_log` tiene policies separadas de `SELECT` e
`INSERT` únicamente — no existe policy de `UPDATE`/`DELETE`, así que esas
operaciones quedan denegadas por RLS incluso si algún día se les
otorgara el permiso a nivel de GRANT (defensa en profundidad, capa 2 de 4
— ver §6).

**Propiedad verificada empíricamente: falla cerrado.** Una transacción sin
`set_config('app.gym_id', ...)` devuelve **0 filas**, nunca todas. Se
probó explícitamente (test "sin contexto de tenant seteado, cualquier
lectura falla cerrado").

### 3.2 El hallazgo que obligó a corregir el diseño original: `app_users` NO tiene `FORCE`

La SPEC original decía "las 10 tablas, sin excepciones, con FORCE". Al
implementar el flujo de login real, apareció un problema de arranque que
el diseño no había resuelto en detalle:

> Para saber a qué gimnasio pertenece un usuario hay que **leer**
> `app_users` — pero para leer `app_users` con RLS hace falta **ya saber**
> `gym_id`. No se puede setear el contexto de un tenant que todavía no
> se conoce.

La solución (verificada, no solo diseñada): una función
`SECURITY DEFINER`, `app.get_app_user_by_auth_id(auth_user_id)`, que
busca la fila por su clave única `auth_user_id` sin necesitar contexto de
tenant. El intento inicial de implementarla falló: **`FORCE ROW LEVEL
SECURITY` aplica también al dueño de la tabla** (no solo a roles no
privilegiados) — se comprobó directamente contra Postgres real:

```
fn_owner (dueño de app_users, con FORCE activo), consultando sin
set_config → count = 0
```

Sin ese `FORCE`, en cambio, `fn_owner` (y una función `SECURITY DEFINER`
de su propiedad) queda exenta de RLS, como corresponde a un owner — y
`fn_app`, que **nunca** es owner, sigue 100% restringida en cualquier
consulta directa contra `app_users` (verificado: `SELECT` directo sin
contexto → 0 filas, igual que cualquier otra tabla). `app_users` es,
entonces, la única de las 10 tablas sin `FORCE` — a propósito, documentado
en el propio archivo de migración (`db/migrations/infra/01_rls_and_triggers.sql`).

**Regla resultante:** ningún código de la aplicación hace jamás un
`SELECT` directo contra `app.app_users`. El único camino permitido es
`app.get_app_user_by_auth_id()`, llamado exclusivamente desde
`getAuthContext()` (`src/lib/auth/context.ts`).

## 4. De dónde sale `gymId` — nunca del cliente

`AuthContext` (`src/lib/auth/context.ts`) es el único tipo que transporta
`gymId` dentro de la aplicación, y `getAuthContext()` es su único
constructor. Ninguna función de repositorio ni caso de uso recibe `gymId`
como parámetro suelto — todas reciben `ctx: AuthContext` como primer
argumento. El compilador rechaza cualquier intento de inventar uno.

## 5. `unaccent()` no es IMMUTABLE — el segundo ajuste real

`students.nombre_busqueda` es una columna generada
(`GENERATED ALWAYS AS ... STORED`) para la búsqueda sin acentos. Postgres
exige que esa expresión sea `IMMUTABLE`. `unaccent()` (de la extensión del
mismo nombre) es `STABLE`, no `IMMUTABLE` — Postgres lo rechaza con
`la expresión de generación no es inmutable`. Se descubrió ejecutando la
migración contra Postgres real, no por revisión de código.

Solución: `public.immutable_unaccent(text)`, un wrapper `IMMUTABLE` que
fija el diccionario (`unaccent('public.unaccent', $1)`), definido en
`db/migrations/infra/00_extensions_and_roles.sql`. Vive en `public` (no en
`app`) porque ese archivo corre antes de que exista el esquema `app`.

Crearlo requirió, además, `GRANT CREATE ON SCHEMA public TO fn_owner` —
desde PostgreSQL 15, ni siquiera el dueño de la base tiene ese privilegio
por defecto. Ver `docs/RUNBOOK.md` para el procedimiento completo de
bootstrap (incluye este grant, fácil de olvidar).

## 6. `payments` y `activity_log`: inmutabilidad verificada, no solo declarada

**`payments`:** un trigger (`app.guard_payment_update`) rechaza cualquier
`UPDATE` que toque una columna que no sea `anulado_en`/`anulado_por`/
`anulado_motivo`. Verificado: `UPDATE ... SET monto = 999999` → rechazado
con el mensaje explícito "payments es inmutable salvo anulación...".
`UPDATE` que solo toca las columnas de anulación → permitido.

**`activity_log`:** cuatro capas, las cuatro verificadas por separado:
1. Permisos: `fn_app` sin `UPDATE`/`DELETE` (revocado explícito).
2. RLS: solo hay policies de `SELECT`/`INSERT`.
3. Trigger (`app.reject_activity_log_mutation`) que lanza excepción ante
   `UPDATE`/`DELETE`, por si una migración futura reconcede permisos.
4. Sin superficie: ningún caso de uso ni pantalla escribe fuera de
   `logActivity()` (`src/use-cases/_kernel/with-audit.ts`), que corre
   dentro de la misma transacción que el cambio de negocio (atomicidad
   real, no por convención — si `logActivity` falla, todo se revierte).

En la práctica, el `UPDATE` de prueba sobre `activity_log` fue rechazado
en la **capa de permisos** (`permiso denegado a la tabla activity_log`) —
ni siquiera llegó a evaluarse el trigger. Eso es exactamente el
comportamiento esperado de una defensa en profundidad bien construida: el
ataque se frena en la primera capa que corresponde, sin depender de que
todas fallen a la vez.

## 7. Conexión de runtime: `postgres.js` con `prepare: false`, `max: 1`

`src/data/db.ts`. No es una optimización — es un requisito de
correctitud con un connection pooler en modo transacción (Supavisor,
:6543 en Supabase): una misma conexión física sirve peticiones de
distintos gimnasios. Con prepared statements habilitados, un statement
preparado en una petición podría ejecutarse contra otra sesión lógica. El
contexto de tenant se fija con `set_config('app.gym_id', $1, true)` —
nunca `SET`, que persistiría más allá de la transacción y podría filtrar
un `gym_id` a la siguiente petición servida por la misma conexión física.

## 8. Autenticación

`getAuthContext()` usa `supabase.auth.getUser()`, nunca `getSession()` —
`getSession()` solo decodifica la cookie sin validar la firma.

Sin verificación en dos pasos: alcanza con email + contraseña, para
ambos roles (`DUENO` y `STAFF`) — decisión explícita del dueño del
gimnasio, ver `docs/DECISIONES.md` (entrada "MFA sacado del todo").
Consecuencia directa: una contraseña de `DUENO` filtrada alcanza, sola,
para operar la cuenta completa (alta/edición/pagos/bajas). No hay una
capa de "aal2" ni un flag de una línea para reactivarlo — reintroducir
MFA implica reconstruir el enrolamiento TOTP desde cero.

## 9. Headers de seguridad y CSP

`src/proxy.ts` (Next 16 renombró `middleware.ts` a `proxy.ts` — ver
`docs/DECISIONES.md`) genera un nonce nuevo por request y arma la CSP en
`src/lib/security/headers.ts`. `script-src` es `'self' 'nonce-<x>'
'strict-dynamic'` — sin `unsafe-inline` ni `unsafe-eval`. `style-src`
mantiene `'unsafe-inline'` como concesión acotada (Next inyecta estilos
inline para optimización de fuentes; el riesgo real de XSS vive en
`script-src`, que queda cerrado).

**El proxy nunca autoriza.** Solo refresca la sesión de Supabase
(los Server Components no pueden escribir cookies) y setea headers. La
autorización real vive exclusivamente en `getAuthContext()` +
`withAuth()`, evaluados en cada layout de servidor y cada Server Action —
precisamente por la vulnerabilidad real de bypass de middleware de
Next.js (CVE-2025-29927), que demostró que confiar la autorización al
middleware es frágil incluso en el propio framework.

## 9.bis Sesión simulada de desarrollo (agregado en Fase 1)

Existe una cookie `dev_mock_auth_id` que permite entrar sin Supabase, para
poder desarrollar y correr los tests e2e sin un proyecto real detrás.

En Fase 0 **no estaba condicionada a nada**: en producción, cualquiera que
la enviara con un `auth_user_id` válido entraba como ese usuario, y además
con `aal2` (salteándose el MFA obligatorio de DUENO). `httpOnly` no
protege contra esto — impide que la lea el JavaScript de la página, no que
un atacante la mande a mano.

Desde Fase 1 se habilita solo si se cumplen **las dos** condiciones, en un
único lugar (`isDevMockAuthEnabled()`, `src/lib/auth/config.ts`):

1. `NODE_ENV !== "production"`.
2. No hay proyecto Supabase configurado (URL y anon key reales, no los
   placeholders).

Regresión cubierta en `tests/security/dev-mock-auth.test.ts`, que también
falla si el nombre de la cookie vuelve a aparecer hardcodeado fuera de
`config.ts` — la duplicación de criterios fue parte de la causa original.

## 9.ter Autorización de las LECTURAS (Fase 1)

Las consultas de lectura del módulo de alumnos pasan por el mismo
`withAuth()` que las escrituras. El test estático de
`tests/security/withAuth-wrapping.test.ts` exige el wrapper en los exports
`*Action` **y** `*Query`. Además, ningún repositorio recibe `gymId` suelto:
siempre el `AuthContext` completo, y toda consulta filtra por `gym_id`
explícitamente además de RLS.

Los tests de `tests/integration/alumnos-casos-de-uso.test.ts` verifican
contra Postgres real que un gimnasio no puede leer, editar, dar de baja ni
listar alumnos de otro, ni usar un plan ajeno, aunque mande el id exacto.

## 10. Qué falta para producción (pendiente, no bloqueante para Fase 0)

- Proyecto Supabase real (URL, anon key, Turnstile) — ver `docs/RUNBOOK.md`.
  MFA fue evaluado y descartado a propósito (ver `docs/DECISIONES.md`),
  no es un pendiente.
- Backups Nivel 2 (pg_dump cifrado a un proveedor distinto).
- Primer simulacro de restauración registrado.
- Segunda cuenta `DUENO` de emergencia creada.
- Rate limiting de login (nativo de Supabase Auth una vez configurado).
