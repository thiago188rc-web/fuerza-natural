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

## Bootstrap en Supabase (pendiente de credenciales reales)

**Estado: NO ejecutado todavía.** Esta sesión de Fase 0 no tuvo acceso a
un proyecto Supabase real — todo lo de abajo es el procedimiento a seguir
la primera vez que exista uno, escrito con el mismo nivel de precisión que
el bootstrap local (que sí se ejecutó y verificó).

1. Crear el proyecto en supabase.com (plan Pro recomendado desde el día 1
   de producción — el free tier puede pausar proyectos inactivos).
2. **Deshabilitar el Data API** (Settings → Data API) o, como mínimo,
   confirmar que no expone el esquema `app` (por diseño, el Data API de
   Supabase solo expone `public`, y nuestras tablas de negocio viven en
   `app` — pero conviene apagarlo del todo si no se va a usar).
3. Desde el SQL Editor del dashboard (conectado como `postgres`, el
   superusuario gestionado de Supabase):
   ```sql
   CREATE ROLE fn_owner    WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<generar>';
   CREATE ROLE fn_app      WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<generar>';
   CREATE ROLE fn_readonly WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<generar>';
   GRANT CREATE ON DATABASE postgres TO fn_owner;   -- el nombre de la db en Supabase suele ser "postgres"
   GRANT CONNECT ON DATABASE postgres TO fn_app, fn_readonly;
   GRANT CREATE ON SCHEMA public TO fn_owner;
   ```
4. Tomar las cadenas de conexión de Supabase (Settings → Database →
   Connection string) y armar `DATABASE_URL`/`DATABASE_URL_OWNER`
   reemplazando el usuario/contraseña por `fn_app`/`fn_owner`. **Usar el
   modo "Session" (puerto 5432) para migraciones y el modo "Transaction"
   (Supavisor, puerto 6543) para `DATABASE_URL` de runtime** — es
   precisamente el modo transacción el que exige `prepare: false` y
   `set_config(..., true)` en vez de `SET` (ver `src/data/db.ts` y
   `docs/SECURITY.md`).
5. `npm run db:migrate` apunta a `DATABASE_URL_OWNER` — correrlo contra el
   proyecto real aplica las 3 capas (extensiones/roles, esquema, RLS).
6. Auth: Settings → Authentication → habilitar MFA (TOTP), configurar
   Cloudflare Turnstile como CAPTCHA del login (Settings → Auth →
   Bot and Abuse Protection).
7. Crear el primer usuario `DUENO` real — ver "Dar de alta a una persona
   real" más abajo. Ya no se hace con SQL a mano: hay un script
   (`npm run db:provision-owner`).
8. **Segunda cuenta `DUENO` de emergencia** (SPEC V1 §3.11) — crear
   ANTES de darle al dueño real su primer acceso, con su propio TOTP
   enrolado y credenciales impresas guardadas físicamente. Es el mismo
   procedimiento de abajo, con otro email. Sigue siendo un paso manual,
   documentado explícitamente para no olvidarlo.

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

`DATABASE_URL_OWNER` tiene que apuntar al proyecto Supabase mientras se
corre el script. Al terminar, devolvelo a la base local: es la credencial
con DDL y no conviene dejarla apuntando a producción.

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
| — | Simulacro de restauración de backup | Pendiente — no hay backups reales todavía |
| — | Recuperación de cuenta DUENO | Pendiente — no hay usuarios reales todavía |
