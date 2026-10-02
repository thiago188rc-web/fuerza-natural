# RUNBOOK — Fuerza Natural / NEXA GYM OS

Procedimientos operativos. Este documento se actualiza cada vez que se
ejecuta un procedimiento real (simulacro de restore, recuperación de
cuenta, etc.) — la fecha y el resultado real quedan anotados abajo, no solo
la receta.

---

## Base de datos local de desarrollo

**No usamos Docker.** El entorno de desarrollo de referencia (Windows, sin
Docker Desktop ni Supabase CLI disponibles) usa un cluster de PostgreSQL 17
real, instalado con `winget`, corriendo bajo el usuario del sistema — no
como servicio de Windows, para no necesitar privilegios de administrador.

### Instalación (una sola vez)

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements
```

Esto instala el servicio de Windows en el puerto 5432 (bajo una cuenta de
servicio que un usuario sin privilegios de administrador no puede
controlar — ver "Por qué un cluster propio" abajo). No lo usamos.

### Crear el cluster propio (una sola vez)

```bash
export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
initdb -D "$HOME/pgdev/data" -U postgres --auth=trust --locale=Spanish_Argentina -E UTF8

# Puerto 5433 (no 5432, para no chocar con el servicio de Windows) y
# solo localhost:
sed -i "s/^#port = 5432/port = 5433/" "$HOME/pgdev/data/postgresql.conf"
sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$HOME/pgdev/data/postgresql.conf"

pg_ctl -D "$HOME/pgdev/data" -l "$HOME/pgdev/logfile.txt" start
```

### Arrancar el cluster (cada vez que se reinicia la máquina)

El cluster propio NO es un servicio de Windows: no arranca solo. Después de
cada reinicio hay que levantarlo a mano, o `npm test` va a fallar:

```bash
export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
pg_ctl -D "$HOME/pgdev/data" -l "$HOME/pgdev/logfile.txt" start
pg_isready -h localhost -p 5433     # debe decir "aceptando conexiones"
```

**Ojo con `npm run verify` y el cluster apagado.** Los tests de integración
se saltan si NO existe `DATABASE_URL`, pero si la variable existe (o sea,
si hay `.env.local`) y la base no responde, fallan con `ECONNREFUSED` — no
se saltan. Es deliberado: saltarse en silencio los tests de aislamiento por
gym_id, que son los más importantes del sistema, sería peor que fallar
ruidosamente. Si `verify` falla con `ECONNREFUSED ::1:5433`, no hay nada
roto en el código: levantá el cluster con el comando de arriba.

### Por qué un cluster propio y no el servicio de Windows

El servicio instalado por winget corre bajo una cuenta de Windows que un
usuario normal (sin permisos de administrador) no puede `Start-Service` /
`Stop-Service` / `pg_ctl reload` — se verificó exactamente esto en la
sesión de Fase 0: `Restart-Service` y `pg_ctl reload` fallaron con
"acceso denegado" / "Operation not permitted", incluso siendo el dueño de
los archivos de datos originales del `initdb`. Un cluster propio, iniciado
con `pg_ctl` bajo el usuario actual, evita el problema por completo — y de
paso es más representativo de cómo correría en CI (sin ningún control de
servicio del sistema operativo).

### Bootstrap de roles y base (una sola vez por cluster)

```bash
export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
export PGHOST=localhost PGPORT=5433 PGUSER=postgres PGPASSWORD=postgres

psql -c "CREATE DATABASE fuerza_natural;"
psql -d fuerza_natural -c "
  CREATE ROLE fn_owner    WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'fn_owner_dev_pw';
  CREATE ROLE fn_app      WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'fn_app_dev_pw';
  CREATE ROLE fn_readonly WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'fn_readonly_dev_pw';
  GRANT CREATE ON DATABASE fuerza_natural TO fn_owner;
  GRANT CONNECT ON DATABASE fuerza_natural TO fn_app, fn_readonly;
  GRANT CREATE ON SCHEMA public TO fn_owner;
"
```

**El último GRANT (`CREATE ON SCHEMA public`) es fácil de olvidar y el
sistema falla de forma poco obvia sin él.** Desde PostgreSQL 15, el
esquema `public` ya NO otorga `CREATE` a todos los roles por defecto — ni
siquiera al dueño de la base. Sin este grant, `fn_owner` no puede crear la
función `public.immutable_unaccent()` (ver `docs/SECURITY.md` §RLS) y la
migración de esquema falla en la tabla `students` con
`no existe la función public.immutable_unaccent(text)`. Esto se descubrió
ejecutando la migración contra Postgres real durante la Fase 0 — no
estaba documentado de antemano.

Esto es exactamente lo que hay que replicar en Supabase (donde el rol
`postgres` del proyecto hace de superusuario) — ver "Bootstrap en
Supabase" más abajo.

### Migrar y sembrar datos de desarrollo

```bash
cp .env.example .env.local   # completar DATABASE_URL / DATABASE_URL_OWNER
npm run db:migrate
npm run db:seed
```

### Recrear la base desde cero (durante desarrollo)

```bash
export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
export PGHOST=localhost PGPORT=5433 PGUSER=postgres PGPASSWORD=postgres
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='fuerza_natural' AND pid <> pg_backend_pid();"
psql -c "DROP DATABASE fuerza_natural;"
psql -c "CREATE DATABASE fuerza_natural;"
psql -d fuerza_natural -c "GRANT CREATE ON DATABASE fuerza_natural TO fn_owner; GRANT CONNECT ON DATABASE fuerza_natural TO fn_app, fn_readonly; GRANT CREATE ON SCHEMA public TO fn_owner;"
npm run db:migrate
```

---

## Bootstrap en Supabase (proyecto de producción nuevo)

**Antes de empezar, anotá acá en qué cuenta y organización de Supabase
queda el proyecto.** El 2026-10-01 producción se cayó porque el primer
proyecto (`xppuhabselycpyuocqnz`, plan Free) se pausó por inactividad y
nadie sabía en qué cuenta estaba: este documento decía "NO ejecutado" y
nunca registró dónde se había creado. Ver la tabla de historial al final.

| Dato | Valor |
|---|---|
| Cuenta / organización Supabase | org `acnbctehunzysripzffk` — _(completar con el nombre de la cuenta y de la organización)_ |
| Ref del proyecto | `laaboaprbjegijnoxqpx` ("fuerza-natural-bootstrap"), creado el 2026-10-01 |
| Región | West US (Oregon), `us-west-2`. Las funciones de Vercel corren en `pdx1` (Portland, `vercel.json`) para quedar al lado de la base |
| Plan | _(a confirmar: Free se pausa a los 7 días sin uso; Pro no)_ |

Credenciales de producción: en `.env.produccion.local` (fuera de git), **no**
en `.env.local`. Los tests de integración escriben gimnasios de prueba en
la base de `.env.local` sin limpiarlos; con producción ahí, un `npm test`
la ensucia. Todos los scripts `npm run db:prod:*` leen ese archivo.

En el panel de Supabase (solo lo puede hacer quien tiene la cuenta):

1. Crear el proyecto, con una contraseña de base fuerte guardada en un
   gestor de contraseñas. La región tiene que coincidir con `regions` de
   `vercel.json`: cada consulta cruza esa distancia.
2. Authentication → Sign In / Providers → **desactivar "Allow new users to
   sign up"** (o, con token, `PATCH /v1/projects/<ref>/config/auth`
   `{"disable_signup": true}`). Los usuarios los da de alta un
   administrador, nunca una pantalla pública.
3. Authentication → Users → Add user → Create new user, con el email y la
   contraseña del dueño y **"Auto Confirm User" activado**. Copiar su UID.
4. Una de dos, en `.env.produccion.local`:
   - `DATABASE_URL_ADMIN`: botón Connect → **Session pooler**, con la
     contraseña de la base en lugar de `[YOUR-PASSWORD]`; o
   - `SUPABASE_ACCESS_TOKEN`: token personal (Account → Access Tokens). El
     SQL de admin va por la Management API y no hace falta la contraseña
     de la base. **Revocarlo al terminar.**

Desde el repo:

```bash
# Roles fn_owner / fn_app / fn_readonly con contraseñas aleatorias (a
# Supabase solo le llega el hash SCRAM), permisos y extensiones. Escribe
# DATABASE_URL, DATABASE_URL_OWNER y DATABASE_URL_READONLY en
# .env.produccion.local. Con token, agregar: -- --ref <ref del proyecto>
npm run db:prod:bootstrap

# Las 3 capas: extensiones/roles, esquema (drizzle-kit), RLS y triggers.
npm run db:prod:migrate

# Gimnasio real + configuración + catálogo de planes confirmado + primer
# DUENO, en una sola transacción (se niega a duplicar).
npm run db:prod:provision-gym -- --gimnasio "Fuerza Natural" \
  --auth-id <UID del paso 3> --email <email del dueño> --nombre "<Nombre Apellido>"

# Prueba la conexión de runtime (fn_app) como la usa el login.
npm run db:prod:diagnostico
```

En Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`),
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (la **publishable key** `sb_publishable_…`
de Settings → API Keys; los proyectos nuevos ya no traen la anon key
legacy) y `DATABASE_URL` (la de `.env.produccion.local`, rol `fn_app`,
puerto 6543). Después, redeploy: las `NEXT_PUBLIC_*` se fijan al compilar.

**Segunda cuenta `DUENO` de emergencia** (SPEC V1 §3.11): mismo paso 3
con otro email y `npm run db:prod:provision-owner -- --gym-id … --auth-id …`,
con las credenciales guardadas fuera de línea. Sigue siendo manual,
documentado para no olvidarlo.

## Dar de alta a una persona real (Supabase Auth → app_users)

Un usuario de Supabase Auth por sí solo NO entra al sistema: hace falta la
fila en `app.app_users` que dice a qué gimnasio pertenece y con qué rol.
Sin esa fila, `getAuthContext()` devuelve `null` y la pantalla de login
responde "Tu usuario todavía no está habilitado en este gimnasio".

Vincularlas es un acto administrativo, nunca una pantalla de la aplicación:
si la app pudiera crear usuarios con rol, cualquiera que llegue a esa
pantalla podría asignarse `DUENO`. El script pide `DATABASE_URL_OWNER`, que
la aplicación en runtime no tiene y que nunca se configura en Vercel.

```bash
# 1. En Supabase: Authentication → Users → Add user → Create new user.
#    Email y contraseña reales, y "Auto Confirm User" ACTIVADO (sin
#    confirmar, signInWithPassword rechaza y se ve "Email o contraseña
#    incorrectos"). Copiar el UID de la fila creada.

# 2. Ver a qué gimnasio vincularlo (no escribe nada):
npm run db:provision-owner

# 3. Vincular:
npm run db:provision-owner -- \
  --gym-id <uuid del gimnasio> \
  --auth-id <UID de Supabase> \
  --email persona@gimnasio.com \
  --nombre "Nombre Apellido"
```

`--rol STAFF` crea un usuario de mostrador en vez de un dueño. El script es
idempotente: correrlo dos veces actualiza los datos en vez de duplicar.
Se niega a usar el `auth_user_id` de la sesión simulada, y se niega a mover
un usuario ya vinculado a otro gimnasio.

Contra producción se corre como `npm run db:prod:provision-owner`, que toma
`DATABASE_URL_OWNER` de `.env.produccion.local`: así `.env.local` nunca
tiene que apuntar a producción.

### El segundo factor del dueño

`DUENO` exige `aal2` en cada operación (SPEC V1 §3.10): con la contraseña
sola no lee ni un dato. La primera vez que entra, `/login` lo manda a
`/mfa`, que le muestra un QR para escanear con Google Authenticator, Authy
o 1Password (o la clave en texto, si no puede escanear). Ingresa el código
de 6 dígitos, el factor queda verificado y la sesión pasa a `aal2`.

De ahí en adelante, cada ingreso pide contraseña y después el código. No
hay que hacer nada en el SQL Editor: el enrolamiento es parte del producto
(`src/app/(auth)/mfa/`). `STAFF` no tiene esta exigencia todavía, pero si
enrola un factor, se le pide igual.

## Correr los tests end-to-end

Desde Fase 1 los e2e SÍ se ejecutan, y no hacen falta credenciales de
Supabase: usan la sesión simulada de desarrollo. Requisitos, en orden:

```bash
# 1. Cluster levantado y migrado
pg_ctl -D "$HOME/pgdev/data" -l "$HOME/pgdev/logfile.txt" start
npm run db:migrate

# 2. Gimnasio DEMO, sus planes y el usuario de desarrollo
npm run db:seed

# 3. Navegador (una sola vez)
npx playwright install chromium

# 4. A correr (levanta `next dev` solo)
npm run test:e2e
```

Condición no negociable: `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` vacías y
`NODE_ENV` distinto de production. Es la única combinación en la que existe
la sesión simulada (ver `src/lib/auth/config.ts`). Cuando haya un proyecto
Supabase real, hay que reemplazar la función `iniciarSesion()` de
`tests/e2e/alumnos.spec.ts` por el login verdadero con TOTP — el resto del
recorrido no cambia.

La base de desarrollo no se limpia entre corridas: los specs generan un
sufijo único por alumno para no pisarse. Si querés empezar de cero,
recreá la base con el bootstrap de más arriba.

## Carga inicial desde las planillas del gimnasio

Una sola vez por gimnasio, sobre una base migrada y sin datos cargados a
mano (el script se niega si encuentra pagos, alumnos manuales o historia
propia). Las reglas están en `docs/DECISIONES.md` (2026-10-02).

```bash
# 1. Modo informe: no escribe nada. El informe tiene datos personales:
#    va FUERA del repositorio.
npx tsx --env-file=.env.produccion.local scripts/migracion/migrar-planillas.ts \
  --base "…/BASE DE DATOS GYM.xlsx" --cuotas "…/CONTROL CUOTA GYM - 2026.xlsx" \
  --reporte "$TEMP/informe.md"

# 2. Revisar el informe: totales por mes contra los del dueño, bajas por
#    mes contra su hoja BAJAS, emparejados por parecido, avisos.

# 3. Aplicar (una transacción: entra todo o nada).
npx tsx --env-file=.env.produccion.local scripts/migracion/migrar-planillas.ts \
  --base … --cuotas … --reporte "$TEMP/informe.md" --aplicar
```

Usar `./node_modules/.bin/tsx` si `npx` se cuelga en Windows. Si un nombre
de la planilla de cuotas no se empareja solo, `--alias alias.json`
(`{"COMO EN CUOTAS": "COMO EN LA BASE"}`), guardado fuera del repo.

## Scripts de instalación de dependencias (`allowScripts`)

npm 11 avisa ("install scripts not yet covered by allowScripts") por cada
dependencia con `postinstall` que el proyecto no revisó, y **igual lo
ejecuta**; solo se saltea lo negado explícitamente. npm 12 da vuelta la
regla: corre únicamente lo aprobado. Por eso la decisión está escrita en
`package.json`, revisada paquete por paquete:

| Paquete | Lo trae | Qué hace su script | Decisión |
|---|---|---|---|
| `esbuild` (0.18 / 0.25 / 0.28) | `drizzle-kit`, `tsx` (dev) | Verifica el binario nativo, que npm ya instaló como `optionalDependency`; si falta, lo **descarga por su cuenta**. En Linux, además, una micro-optimización del ejecutable | `false` |
| `unrs-resolver` | `eslint-config-next` (dev) | Igual: verifica el binding nativo y, si falta, lo descarga | `false` |

Ninguno participa de `next build` (Turbopack + SWC). Verificado el
2026-10-01 con npm 11.21 y `npm ci` desde cero con la negación puesta:
las 3 versiones de esbuild transforman, `tsx`, `drizzle-kit`, `lint`,
`typecheck`, tests unitarios y `build` en verde.

Cuando aparezca un paquete nuevo en el aviso: leer su script antes de
decidir, y registrar la decisión con `npm install-scripts approve <pkg>`
(queda fijada a esa versión) o `npm install-scripts deny <pkg>`. Nunca
`approve --all`.

## Recuperación de cuenta (DUENO pierde el segundo factor)

Ver SPEC V1 §3.11 — sin cambios respecto a lo diseñado ahí: segundo factor
en otro dispositivo (instantáneo) → cuenta de emergencia (paso 8 arriba) →
procedimiento manual con verificación fuera de banda, nunca por email/chat.
No hay nada de esto automatizado en Fase 0, ni debe estarlo.

## Backups (pendiente — sin proyecto Supabase real todavía)

El diseño (Nivel 1: backups automáticos del proveedor; Nivel 2: `pg_dump`
cifrado a un proveedor distinto, vía un job programado) está en SPEC V1
§3.12 y no cambia. **No ejecutado ni configurado en Fase 0** — no hay
todavía un proyecto real sobre el cual configurarlo. Cuando exista:

1. Confirmar backups automáticos activados en el plan de Supabase.
2. Configurar el job de `pg_dump` + cifrado + subida a un segundo
   proveedor (Backblaze B2 / Cloudflare R2), fuera de este repo.
3. Registrar acá, con fecha real, el primer simulacro de restauración
   (§3.13 de la SPEC) — duración, resultado, incidencias. **Sin un
   simulacro registrado, no hay backup: solo una hipótesis.**

---

## Historial de simulacros y procedimientos ejecutados

| Fecha | Procedimiento | Resultado |
|---|---|---|
| 2026-09-07 | Migración completa (00 → esquema → 01) contra Postgres 17 local, desde cero | ✓ Exitoso, ver docs/DECISIONES.md para los 2 ajustes que hicieron falta |
| 2026-09-07 | Test de aislamiento cross-gym (lectura, UPDATE, sin contexto, payments inmutable, activity_log append-only) | ✓ 5/5 casos verificados contra datos reales |
| 2026-10-01 | Incidente: producción caída. El proyecto Supabase `xppuhabselycpyuocqnz` (Free) se pausó por inactividad; DNS `ENOTFOUND` y pooler "tenant/user not found". No se encontró en qué cuenta estaba | Se decidió un proyecto nuevo, recargado desde los Excel. El viejo queda pausado: si aparece la cuenta, se puede reanudar |
| 2026-10-01 | `db:prod:bootstrap` (mismos roles/GRANT/extensiones) + `db:prod:migrate` + `db:prod:provision-gym` contra un Postgres 17 temporal con locale UTF-8 | ✓ Migración completa, alta atómica y sus 3 negativas (nombre repetido, UID ya vinculado, nombre DEMO), y 41/41 tests de integración con `fn_app` |
| 2026-10-01 | Bootstrap de producción en `laaboaprbjegijnoxqpx` vía Management API: roles, migración, registro público desactivado, Data API solo `public`/`graphql_public` (anon/authenticated sin acceso a `app`), RLS en 11/11 tablas | ✓ `db:prod:diagnostico` OK con `fn_app` por el pooler |
| 2026-10-01 | `allowScripts`: negar los `postinstall` de `esbuild` y `unrs-resolver` (ver sección arriba), probado con npm 11.21 y `npm ci` desde cero | ✓ Sin el aviso; lint, typecheck, 237 tests unitarios y build OK |
| — | Simulacro de restauración de backup | Pendiente — no hay backups reales todavía |
| — | Recuperación de cuenta DUENO | Pendiente — no hay usuarios reales todavía |
