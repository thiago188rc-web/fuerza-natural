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

### Tests: siempre contra una base descartable (desde 2026-10-02)

Los tests de integración escriben gimnasios de prueba en la base de
`DATABASE_URL`. Hasta el 2026-10-02 la leían de `.env.local`, que llegó a
apuntar a una producción. Ahora:

- **`npm run test:aislado`** (y `npm run verify`, que lo usa) levanta un
  Postgres nuevo en una carpeta temporal y en un puerto libre, aplica las
  tres capas de migración, corre toda la suite como `fn_app` y lo borra
  al terminar. No lee ningún `.env`. Es la forma normal de correr los
  tests: no hace falta tener el cluster `pgdev` levantado.
- **`npm test`** ya no lee `.env.local`. Sin base, los tests de
  integración se saltan y corren los unitarios. Para correrlos contra el
  cluster propio, crear `.env.test.local` (ignorado por git) con
  `DATABASE_URL=postgres://fn_app:…@localhost:5433/<una base de tests>`.
- **Cualquier base que no sea de esta máquina se rechaza** antes de
  conectar (`scripts/db/destino.ts`): tests, `db:seed`, `db:seed:demo` y
  `db:migrate` sin `--produccion`. Solo los `db:prod:*` tocan producción.

`.env.local` sigue siendo la configuración del servidor de desarrollo
(`npm run dev`). Apuntalo al cluster propio, nunca a un Supabase.

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

Credenciales de producción: en `~/.fuerza-natural/produccion.env` (fuera de git), **no**
en `.env.local`. Todos los scripts `npm run db:prod:*` leen ese archivo.
**Ese archivo no puede vivir en una carpeta sincronizada** (OneDrive,
Dropbox, Google Drive): tiene las contraseñas de los tres roles de la
base. Ver "Puesta en producción" más abajo.

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
4. Una de dos, en `~/.fuerza-natural/produccion.env`:
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
# ~/.fuerza-natural/produccion.env. Con token, agregar: -- --ref <ref del proyecto>
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
legacy) y `DATABASE_URL` (la de `~/.fuerza-natural/produccion.env`, rol `fn_app`,
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
`DATABASE_URL_OWNER` de `~/.fuerza-natural/produccion.env`: así `.env.local` nunca
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

Durante los e2e, `next dev` imprime `The destination stream errored while
writing data` después de casi cada login. No es un error de la app: los
tests navegan apenas la URL cambia a `/dashboard`, y el servidor anota que
el navegador dejó de leer el panel a medio enviar. Comprobado el
2026-11-03: con el mismo login, esperando la carga completa no aparece
nunca; cortando, apareció 4 veces en 3 logins.

## Carga inicial desde las planillas del gimnasio

Una sola vez por gimnasio, sobre una base migrada y sin datos cargados a
mano (el script se niega si encuentra pagos, alumnos manuales o historia
propia). Las reglas están en `docs/DECISIONES.md` (2026-10-02).

```bash
# 1. Modo informe: no escribe nada. El informe tiene datos personales:
#    va FUERA del repositorio. Al final dice si --aplicar va a pasar la
#    guarda ("✓ --aplicar va a pasar la guarda: reemplazaría N alumnos
#    importados antes"), evaluada en una transacción de solo lectura.
npx tsx scripts/db/produccion.ts scripts/migracion/migrar-planillas.ts \
  --base "…/BASE DE DATOS GYM.xlsx" --cuotas "…/CONTROL CUOTA GYM - 2026.xlsx" \
  --reporte "$TEMP/informe.md"

# 2. Revisar el informe: totales por mes contra los del dueño, bajas por
#    mes contra su hoja BAJAS, emparejados por parecido, avisos. Con las
#    planillas del 2026-10-02 tiene que dar: 466 alumnos, 203 activos,
#    1315 pagos, 1 aviso (conciliación en docs/DECISIONES.md).

# 3. Aplicar (una transacción: entra todo o nada).
npx tsx scripts/db/produccion.ts scripts/migracion/migrar-planillas.ts \
  --base … --cuotas … --reporte "$TEMP/informe.md" --aplicar
```

Usar `./node_modules/.bin/tsx` si `npx` se cuelga en Windows. Si un nombre
de la planilla de cuotas no se empareja solo, `--alias alias.json`
(`{"COMO EN CUOTAS": "COMO EN LA BASE"}`), guardado fuera del repo. Es
también la forma de aplicar lo que confirme el dueño sobre los casos
dudosos (por ejemplo, si un nombre de las cuotas es la misma persona que
otro parecido de la base). El repositorio es público: los nombres reales
de alumnos no van en el código ni en estos documentos.

Es idempotente en el sentido que importa: todo corre en UNA transacción
(si algo falla no queda nada escrito y se puede volver a correr), y una
segunda aplicación se niega porque ya hay pagos. Probado el 2026-10-02 en
una base local descartable: con 3 alumnos "importados antes" la guarda
pasa, los reemplaza y quedan 466/203/1315; una segunda corrida se niega.

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

## Contraseñas: cambio y recuperación (desde 2026-10-02)

Sin verificación en dos pasos (ver docs/DECISIONES.md). Lo que hay:

- **Cambiar la contraseña** (`/cuenta/contrasena`, ícono de llave al pie
  del menú): pide la actual, la nueva de 10 a 72 caracteres, y al
  guardarla cierra las sesiones abiertas en otros dispositivos. Queda en
  Actividad que se cambió (nunca la contraseña).
- **Recuperarla** ("¿La olvidaste?" en el login → `/recuperar`): manda un
  enlace por email. El enlace vuelve por `/auth/confirm` y deja elegir una
  nueva sin la actual, durante 15 minutos. La pantalla dice lo mismo
  exista o no la cuenta. Límite: 5 pedidos por hora desde la misma IP.

**Configuración que hace falta en Supabase** (Authentication), una vez,
desde el panel — sin esto el código funciona pero el email no llega o el
enlace no vuelve:

1. **URL Configuration**: *Site URL* = `https://fuerza-natural.vercel.app`;
   en *Redirect URLs* agregar `https://fuerza-natural.vercel.app/auth/confirm`.
2. **SMTP propio** (Authentication → Emails → SMTP Settings). El servicio de
   email que trae Supabase solo manda a las direcciones del equipo de la
   organización y con un límite bajo por hora: a Diego no le llegaría.
   Hace falta una cuenta en un proveedor (Resend, Brevo, Amazon SES…) con
   el dominio o remitente verificado. Es un servicio externo: decisión y
   costo a confirmar.
3. **Plantilla "Reset Password"** (Authentication → Emails → Templates):
   reemplazar el enlace por
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/cuenta/contrasena`.
   Con la plantilla por defecto el enlace solo funciona en el mismo
   navegador donde se pidió (flujo PKCE); con esta, también si Diego lo
   abre en el celular. `/auth/confirm` acepta las dos formas.
4. Verificar en Authentication → Rate Limits que los límites de envío de
   emails y de inicio de sesión estén en valores razonables, y en
   Providers → Email el largo mínimo de contraseña (la app ya pide 10).

**Si Diego pierde el acceso al email**, no hay recuperación automática: un
administrador de NEXA, verificando su identidad por otra vía (en persona o
por teléfono, nunca solo por chat), le pone una contraseña temporal desde
Authentication → Users y Diego la cambia al entrar.

## Backups y simulacro de restauración (desde 2026-10-02)

**Nivel 1 — el del proveedor.** Depende del plan de Supabase: confirmarlo
en el panel (Database → Backups). No es un reemplazo del nivel 2: si se
pierde el acceso a la cuenta (lo que pasó el 2026-10-01), se pierden con
ella.

**Nivel 2 — backup propio, cifrado, fuera de Supabase:**

```bash
# La contraseña de gpg la pide gpg en la terminal: guardarla en un gestor
# de contraseñas. La carpeta de salida no puede estar dentro del repo.
# Opción A (preferida): rol postgres de Supabase, que saltea RLS. En la
# terminal (nunca en el chat): export DATABASE_URL_BACKUP="<Session
# pooler, puerto 5432, del botón Connect>"
npx tsx scripts/db/produccion.ts scripts/db/backup.ts --salida "<carpeta>"
# Opción B: con fn_owner (ya está en ~/.fuerza-natural/produccion.env), fijando el
# gimnasio — las tablas tienen FORCE RLS:
npx tsx scripts/db/produccion.ts scripts/db/backup.ts --salida "<carpeta>" \
  --gym de62a012-…   # el gym_id completo de Fuerza Natural
```

Deja `fuerza-natural-<fecha>.sql.gpg` (esquemas `app` y `drizzle`,
cifrado AES-256) y `…conteos.json` (filas por tabla, huella del contenido
de cada tabla y SHA-256 del cifrado, sin datos personales). No incluye
`auth`: el usuario y la contraseña de Diego los guarda Supabase Auth; si
hubiera que rearmar todo en otro proyecto, se lo vuelve a crear y se
vincula con `db:prod:provision-owner`. La opción B es la que se usa desde
el 2026-10-03: lee los datos con `set_config` dentro de una transacción
de solo lectura, y los cuatro backups de producción hechos así pasaron el
simulacro con conteo y contenido. Si alguna vez un dump sale sin filas o
falla con "row-level security", el simulacro lo detecta: usar la opción A.

**Simulacro** (obligatorio después de cada backup que se quiera dar por
bueno):

```bash
npx tsx scripts/db/simulacro-restauracion.ts \
  --backup "<carpeta>/fuerza-natural-<fecha>.sql.gpg" \
  --conteos "<carpeta>/fuerza-natural-<fecha>.conteos.json"
```

Verifica la huella, descifra en una carpeta temporal, restaura en un
Postgres descartable local, compara el conteo de cada tabla y que RLS siga
encendido, y borra todo. Anotar resultado y duración en el historial de
abajo. **Sin un simulacro registrado, no hay backup: solo una hipótesis.**

### Copia fuera de la PC y verificación

**Al 2026-11-03 los backups están solo en esta PC**
(`C:\Users\Thiago\FuerzaNatural-Backups`): si se pierde la PC, se pierden
con ella, y un dato que se pierda en la base solo vuelve desde acá.
Destino y responsable del archivo cifrado: _(a definir — por ejemplo, una
carpeta privada de Google Drive o Backblaze B2, con acceso de dos personas
de NEXA)_. Frecuencia sugerida: semanal y antes de cualquier operación
masiva (importación, migración).

- **Se copian juntos** `fuerza-natural-<fecha>.sql.gpg` y
  `fuerza-natural-<fecha>.conteos.json` (conteos, huellas y el SHA-256 del
  cifrado; sin datos personales).
- **No se copia** la frase de gpg ni nada de `~/.fuerza-natural/`. La frase
  va a un gestor de contraseñas y nunca junto a los backups: quien tenga
  las dos cosas tiene la base entera. Tampoco un `.sql` sin cifrar:
  `backup.ts` borra sus temporales, y si alguna vez quedara uno, no se sube.
- **Al subir cada uno**, comparar la huella de la copia con la del JSON
  (tienen que ser iguales):
  ```bash
  sha256sum "<destino>/fuerza-natural-<fecha>.sql.gpg"
  node -p "require('<destino>/fuerza-natural-<fecha>.conteos.json').sha256"
  ```
- **Una vez por mes, y antes de depender de una copia**, bajarla del
  destino a una carpeta temporal fuera del repo y de OneDrive y correr el
  simulacro de arriba **sobre lo bajado**, no sobre el original de la PC.
  El simulacro verifica la huella antes de descifrar y tiene que decir
  `SIMULACRO OK`. Anotarlo en el historial y borrar la carpeta temporal.

## Estado de producción (2026-10-03)

**Publicado el 2026-10-03:** `fuerza-natural.vercel.app` →
`dpl_9wtWtPx7gu3ADAcaHkztaFDz4aK9` (`fuerza-natural-4ul81e1sy`, commit
`1a72c0d`, pdx1). Los pushes posteriores a `main` se publican solos: el
commit vigente lo dice `/api/salud` (`version`). `/api/salud` →
`{"estado":"ok","base":"ok","auth":"ok","version":"1a72c0d"}`.
`autoAssignCustomDomains` volvió a `true` con el promote: **cada push a
`main` se publica solo**. Login real del dueño probado (entrar, Panel,
Alumnos, Pagos, Métricas, una ficha, pantalla de contraseña, salir), sin
registrar nada.

**Base:** 466 alumnos (203 activos, 263 de baja), 1315 pagos ($64.045.000,
cada mes igual a la planilla), 1317 tramos, 746 eventos. Migraciones
aplicadas: 0000–0009.

**Credenciales:** `~/.fuerza-natural/produccion.env` (fuera del repo y de
OneDrive, permisos solo del usuario). Contraseñas de `fn_readonly`,
`fn_owner` y `fn_app` rotadas el 2026-10-03; `DATABASE_URL` actualizada en
Vercel (Production). Variables de Production: `DATABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_URL`.
Las credenciales del proyecto viejo quedaron en
`~/.fuerza-natural/proyecto-viejo.env` (rotarlas si ese proyecto reaparece).

**Backups** (en `C:\Users\Thiago\FuerzaNatural-Backups`, fuera de OneDrive,
cifrados con la frase de `~/.fuerza-natural/backup-gpg.pass`):

| Archivo | Estado de la base | Simulacro |
|---|---|---|
| `fuerza-natural-2026-10-03T04-42-53.sql.gpg` | Antes de migrar y cargar (119 alumnos, 0 pagos) | ✓ 11/11 tablas, conteo y contenido |
| `fuerza-natural-2026-10-03T05-00-42.sql.gpg` | Con la carga aplicada | ✓ 12/12 tablas, conteo y contenido |
| `fuerza-natural-2026-10-22T15-41-24.sql.gpg` | Antes de los cambios del 2026-10-22 | ✓ 12/12 tablas, conteo y contenido |
| `fuerza-natural-2026-11-02T02-34-56.sql.gpg` | Migraciones hasta la 0009; 482 alumnos, 1521 pagos (5 anulados), 1708 tramos | ✓ 12/12 tablas, conteo y contenido; base de los ensayos de la 0010/0011 |

Pendiente: guardar la frase en un gestor de contraseñas, y una segunda
copia de los backups fuera de esta computadora (destino y responsable a
definir).

**Volver atrás:**
- *La app:* Vercel → Deployments → `dpl_9DsJyo9NjdfbtTRj6cndxmBNRWvB`
  (commit `dca378c`, reconstruido el 2026-10-03 con las variables
  actuales) → ⋯ → Promote. Es compatible con la base migrada y cargada
  (no usa `access_attempts`); pierde anulación de pagos y contraseñas.
  **No** volver a `dpl_9c3J7` ni a ningún deploy anterior al 2026-10-03:
  tienen grabadas credenciales que ya no sirven.
- *Los datos:* restaurar el backup que corresponda en un Postgres limpio
  (el simulacro muestra cómo) y, recién comprobado, reemplazar. Nunca
  encima de la base actual sin antes hacer otro backup.

**Pendiente (cuentas externas, lo hace Thiago en el panel):**
1. Revocar el token `sbp_…` (supabase.com/dashboard/account/tokens, en la
   cuenta con acceso a la organización `acnbct…`). Nada lo usa: ni el
   archivo de credenciales, ni Vercel, ni ningún script.
2. Supabase Auth: Site URL, Redirect URLs, SMTP propio y plantilla de
   recuperación (sección "Contraseñas" de arriba). Hasta entonces, el
   cambio de contraseña funciona; la recuperación por email, no.
3. Confirmar organización, administradores y plan; segunda cuenta DUENO
   de emergencia; monitor externo sobre `/api/salud`.
4. Prueba de Diego: revisa sus datos sin cargar operaciones. La
   contraseña inicial ya no vale: se cambió desde el panel el 2026-10-09
   y se borró `DUENO_PASSWORD_INICIAL` del archivo de credenciales.

**Acceso de emergencia hoy:** si Diego no puede entrar, un administrador
del proyecto Supabase le asigna una contraseña temporal desde
Authentication → Users (verificando su identidad por otra vía) y él la
cambia al entrar. Mientras no exista la segunda cuenta DUENO, el único
camino de emergencia es ese panel.

**Soporte:** _(contacto a definir por NEXA)_.

## Puesta en producción (octubre 2026)

Estado verificado el 2026-10-02 (solo lectura): el dominio
`fuerza-natural.vercel.app` sirve `dpl_9c3J7` (commit `984e3b4`, 17/09),
que apunta al proyecto Supabase viejo (DNS `ENOTFOUND`): **el login no
puede funcionar**. `autoAssignCustomDomains=false` (quedó así por un
Instant Rollback): los deploys nuevos no toman el dominio solos. La base
nueva tiene 119 alumnos importados por error y 0 pagos.

Orden, cada paso con su verificación antes del siguiente:

1. **Revocar el token `sbp_…`** que quedó en una conversación
   (supabase.com/dashboard/account/tokens, en la cuenta con acceso a la
   organización del proyecto). Se considera comprometido.
2. **Credenciales fuera de OneDrive y rotadas** (hecho el 2026-10-02).
   El archivo pasó de `.env.produccion.local` (dentro del repo, que
   OneDrive sincroniza) a `~/.fuerza-natural/produccion.env`, en una
   carpeta con permisos solo para el usuario; `scripts/db/produccion.ts`
   se niega a usar uno dentro del repo o de OneDrive. Las contraseñas de
   `fn_readonly`, `fn_owner` y `fn_app` se rotaron con `npm run
   db:prod:rotar` (cada rol cambia la suya con la credencial vigente; no
   hace falta el rol `postgres`), y `DATABASE_URL` se actualizó en Vercel.
   Para volver a rotar: el mismo comando, después actualizar
   `DATABASE_URL` en Vercel (por stdin: `… | vercel env update
   DATABASE_URL production --sensitive --yes`) y volver a publicar —
   cada deployment guarda las variables del momento en que se construyó.
3. **Confirmar la organización de Supabase** (nombre, cuenta dueña, al
   menos dos administradores de NEXA) y el plan. Completar la tabla de
   "Bootstrap en Supabase".
4. **Backup + simulacro** del estado actual (nivel 2). Es chico, pero
   prueba la cadena completa antes de cargar lo importante.
5. **Migración de esquema** (`npm run db:prod:migrate`): agrega
   `app.access_attempts` y sus tres funciones (límite de intentos de
   login). Sin ella el sistema funciona igual —el límite falla abierto y
   lo registra en el log— pero sin protección propia contra intentos.
6. **Carga de las planillas**: informe (verificar 466/203/1315 y la línea
   "✓ --aplicar va a pasar la guarda: reemplazaría 119…"), resolver con
   Diego los casos dudosos (alias), y `--aplicar`.
7. **Backup + simulacro** de nuevo, ya con los datos reales.
8. **Publicar en Vercel**: el deployment del commit que tenga todo lo de
   arriba (no `dca378c`, que no trae anulación ni contraseñas). Deployments
   → ⋯ → **Promote to Production** (o "Undo Rollback"; nunca "Redeploy").
   Después: `vercel inspect fuerza-natural.vercel.app` tiene que mostrar
   ese deployment, y `GET https://fuerza-natural.vercel.app/api/salud` →
   `{"estado":"ok","base":"ok","auth":"ok","version":"<commit>"}`.
9. **Supabase Auth** (sección "Contraseñas" arriba): URLs, SMTP, plantilla.
10. **Prueba real con Diego**: que entre con su usuario, cambie la
    contraseña que le dio NEXA, recorra Panel, Alumnos, una ficha, Pagos y
    Métricas, y registre su primer pago real. (La contraseña inicial se
    cambió el 2026-10-09 y `DUENO_PASSWORD_INICIAL` ya se borró de
    `~/.fuerza-natural/produccion.env`.)

**Volver atrás si la versión nueva falla:** Deployments → el deployment
anterior que funcionaba → ⋯ → Promote to Production (Instant Rollback).
Ojo: el anterior a este es `dpl_9c3J7`, que apunta a un Supabase que ya
no existe — volver a él no sirve. Entre los deploys hechos con las
variables nuevas, el de `dca378c` (`go7hb9cja`) es el respaldo razonable:
funciona con la misma base, sin anulación ni contraseñas. Un rollback de
Vercel no toca la base: si el problema son los datos, se restaura el
backup del paso 7 en un proyecto nuevo, nunca encima del actual sin
antes otro backup.

**Monitoreo:** `GET /api/salud` (público, sin datos) en un monitor externo
gratuito (UptimeRobot, Better Stack) que avise por email o WhatsApp si
deja de dar 200. Es un servicio externo: a crear por quien vaya a recibir
las alertas.

---

## Panel vs. Pagos: qué cuenta cada número (desde 2026-10-22)

El dueño notó una diferencia de uno: el Panel decía 191 y Pagos, 192. No
era un error de cálculo. Son dos números que cuentan cosas distintas:

| Pantalla | Número | Qué cuenta |
|---|---|---|
| Panel | "**X** de Y activos con el mes cubierto" | **Personas** activas que **hoy** caen dentro de un tramo pagado (`situacionDeLosActivos`, la misma cuenta que usa Métricas). No importa en qué mes pagaron. |
| Panel y Pagos | "Pagos registrados" | **Pagos** vigentes con fecha de pago en el mes (`totalCobrado`). |
| Pagos | "Alumnos que pagaron" | **Personas** distintas con al menos un pago vigente en el mes. |
| Pagos | "Activos hoy" | El padrón de hoy, haya pagado alguien o no. |

**La causa del +1, verificada en la base el 2026-10-22 (solo lectura):**
en octubre había 193 pagos vigentes de **192 personas**. Una persona
activa pagó dos veces el 10/10, con una hora de diferencia: septiembre
atrasado (cubre 10/09–09/10) y octubre (cubre 10/10–09/11). Son 2 pagos
y 1 persona. Las 192 personas que pagaron en octubre son exactamente las
192 activas que hoy tienen cobertura (Panel: 192 de 200).

- **Los anulados no cuentan en ninguno de los dos números** (3 en
  octubre).
- **Los que volvieron después de una baja** (12 reactivaciones en
  octubre) cuentan en los dos como cualquier activo. Ninguno de los pagos
  de octubre era de alguien que hoy esté de baja.

**Cuándo NO coinciden, y está bien:**
- Alguien paga dos meses juntos: suma más pagos que personas.
- Alguien está cubierto hoy por un pago del mes anterior (un ciclo que
  arranca el 25): cuenta en el Panel y no en "pagaron este mes".
- Alguien pagó este mes y hoy está de baja: cuenta en Pagos, no en el
  Panel.

Lo que se cambió fue que Pagos muestre, además de los pagos, las personas
("Alumnos que pagaron", con "N pagó más de una vez" cuando pasa) y los
activos de hoy. No se tocó ningún dato ni se forzó que coincidan.

### 2026-11-01: "197 activos / 198 pagos"

El gimnasio volvió a ver una diferencia de uno. Diagnóstico de solo
lectura en producción, reconstruyendo cada número momento a momento
(`created_at` de los pagos y eventos de vínculo; el control dio 0
diferencias con el estado actual):

- Entre el **27/10 20:19 y el 28/10 13:49 (UTC)** el sistema mostraba
  **198 pagos registrados** de octubre y **197** en dos lugares: "Alumnos
  que pagaron" (Pagos) y "197 de N activos con el mes cubierto" (Panel).
  En ningún momento hubo 198 pagos con 197 *activos* (los activos eran
  199–203).
- **El +1 es el mismo caso del 22/10:** un alumno activo con dos pagos
  vigentes el 10/10, por períodos distintos y sin superposición
  (septiembre atrasado y octubre). 198 pagos = 197 personas + 1.
- **Integridad, sin hallazgos:** 0 pagos sin tramos, 0 tramos cuyo alumno
  no es el del pago, 0 coberturas superpuestas entre pagos vigentes. Los
  anulados (5 en octubre) no cuentan en ningún número.
- Al 01/11 los números de octubre ya eran otros (201 pagos, 196 activos):
  ese día se dieron de baja 5 alumnos que habían pagado en octubre.

Lo que se cambió (sin tocar datos): Pagos ahora cierra la cuenta debajo de
cada número — "N hoy no están activos" bajo "Alumnos que pagaron" y "N sin
pago cobrado en el mes" bajo "Activos hoy" — y el listado tiene N.º, cuyo
último valor es exactamente "Pagos registrados". La cuenta siempre cierra:

```
pagos − activos = (pagos − personas) + (pagaron y hoy no activos) − (activos sin pago en el mes)
```

**Para repetir el diagnóstico** (solo lectura, rol `fn_readonly`,
transacción READ ONLY; imprime nombres en la terminal, no pegarlos en el
repo):

```bash
npm run db:prod:conciliar -- --mes 2026-10
```

Muestra los números de cada pantalla, cómo se cruzan, quién explica cada
diferencia y los chequeos de integridad de arriba.

---

## Migración 0010 + 0011 (opción B decidida el 2026-11-03, SIN ejecutar)

**Estado verificado (solo lectura, 2026-11-02):** producción tiene
aplicadas 0000–0009, con el mismo hash que los archivos del repositorio;
la 0010 (borra `disciplina`) y la 0011 (situación laboral) están
pendientes. drizzle aplica **todas** las migraciones cuyo `when` es
posterior a la última aplicada, en una sola transacción: no hay forma de
correr la 0011 sola sin tocar el journal o la 0010. La capa `infra/` no
cambió desde la última migración de producción (`a6b3522`) y el esquema y
la seguridad de producción son iguales a los del repositorio migrado desde
cero (columnas, constraints, índices, RLS, policies, triggers, funciones y
permisos).

**Decisión (2026-11-03):** Diego autorizó la opción B: conservar
`students.disciplina` en la base, sin uso funcional y sin perder los 10
valores (docs/REGLAS-DE-NEGOCIO.md, pendiente 8; docs/DECISIONES.md). La
0010 ya es el `COMMENT ON COLUMN` ensayado, en el árbol de la entrega 2,
sin commitear. Esa autorización **no** incluye migrar ni publicar: eso lo
decide Thiago después de validar.

### Ensayo sobre una copia de producción

```bash
export GPG_PASSPHRASE_FILE="$HOME/.fuerza-natural/backup-gpg.pass"
npx tsx scripts/db/ensayo-de-migracion.ts \
  --backup  "C:/Users/<usuario>/FuerzaNatural-Backups/fuerza-natural-<fecha>.sql.gpg" \
  --conteos "C:/Users/<usuario>/FuerzaNatural-Backups/fuerza-natural-<fecha>.conteos.json"
#  [--migraciones <otra carpeta db/migrations>]   para ensayar una variante
#  [--aceptar-perdida students.disciplina]        solo con la pérdida autorizada
#  [--despues "<comando>"]                        con la copia viva (p. ej. recorrer la app)
```

Restaura el backup en un Postgres descartable, compara su esquema contra el
repositorio migrado desde cero, corre `scripts/db/migrate.ts` (las 3
capas, con `fn_owner`, igual que `db:prod:migrate`) y compara fila por fila
y columna por columna: una columna que se va con datos hace fallar el
ensayo salvo `--aceptar-perdida`. Prueba los CHECK nuevos y el aislamiento
con `fn_app`, y borra todo al terminar. No imprime datos personales.

Resultado con el backup del 2026-11-02 (18–25 s cada uno): en las tres
variantes, todas las tablas quedan con las mismas filas y los mismos
valores, 12/12 tablas con RLS, misma huella de seguridad, columnas nuevas
con permisos para `fn_app`/`fn_readonly`, CHECK nuevos rechazando valores
inválidos y la migración idempotente. Lo que cambia es solo `disciplina`:

| Variante | 0010 | Resultado |
|---|---|---|
| A | copia a `notas`, con FORCE RLS apagado en la transacción y un control que aborta si falta alguno | 10 notas con "Disciplina al darse de alta: Musculación."; columna borrada |
| A "obvia" | `UPDATE` sin tener en cuenta FORCE RLS | **0 filas actualizadas, 10 valores perdidos, sin ningún error.** No usar |
| B | `COMMENT ON COLUMN` (no borra) | `disciplina` intacta (10 valores), también después de editar alumnos desde la app |
| C | la del repo | 10 valores perdidos (solo quedan en backups) |

Con la variante B se recorrió además la app entera sobre la copia migrada
(`next dev` con sesión de desarrollo, datos reales, sin capturas): 21
rutas sin errores de consola ni de red y sin scroll horizontal de 375 a
1440; N.º 1→201 en octubre (5 anulados sin número) y 1→12 en noviembre;
un cobro de 2 meses a un alumno real; el aviso del mismo día; alta con
situación laboral y edición de 5 alumnos reales sin que cambie ninguna otra
columna. La variante elegida, B, es la que quedó en el repositorio.

### Antes de correr `db:prod:migrate`

**El comando aplica la carpeta local, sin preguntar.** `db:prod:migrate`
corre `migrate.ts` sobre `db/migrations` tal como está en el disco
(commiteado o no), y no muestra qué va a aplicar ni pide confirmación. La
0010 original (`DROP COLUMN "disciplina"`) sigue en `8426c35` y en
cualquier copia que no tenga el cambio a B: un `git checkout -- db/`, un
`git stash`, un clon nuevo o la máquina del otro autor la traen de vuelta,
y correr el comando ahí borra los 10 valores en menos de un segundo, sin
ningún error. Inmediatamente antes de migrar:

```bash
git status --short -- db/migrations        # vacío: se migra lo commiteado
git log -1 --format='%h %s' -- db/migrations/0010_deep_husk.sql   # el commit de la B
grep -c -i "drop" db/migrations/0010_deep_husk.sql                 # tiene que dar 0
npx drizzle-kit check                      # "Everything's fine" (no se conecta a ninguna base)
```

y leer enteras las migraciones pendientes (hoy, la 0010 y la 0011).

**Procedencia de lo pendiente:**

| Migración | De dónde sale | Qué hace |
|---|---|---|
| `0010_deep_husk` | drizzle-kit, en `17ba310` (otro autor, 2026-10-21), al sacar `disciplina` del alta. Reemplazada el 2026-11-03 por la variante B ensayada, con la autorización de Diego | `COMMENT ON COLUMN` sobre `disciplina`: no cambia datos ni estructura |
| `0011_situacion_laboral` | drizzle-kit, 2026-11-01 (entrega 2) | 2 columnas que aceptan vacío y 2 CHECK |

**Revisión de cualquier migración nueva** (propia o del otro autor) antes
de llevarla a producción:

- Leer el SQL entero. `DROP`, `UPDATE`, `DELETE`, `TRUNCATE` o
  `ALTER … TYPE` piden backup, simulacro y ensayo; si algo se va con
  datos, autorización escrita y `--aceptar-perdida` en el ensayo.
- Un `UPDATE` o `DELETE` sobre una tabla con FORCE RLS, hecho desde una
  migración (sin `app.gym_id`), no toca ninguna fila y no da error: es la
  variante A "obvia" del ensayo.
- drizzle compara solo contra la **última** migración aplicada: aplica, en
  una transacción, todas las del journal con `when` posterior, y una con
  `when` anterior no corre nunca. Por eso **no se saca una migración del
  journal para postergarla**: una vez aplicada la siguiente, no vuelve a
  correr. Postergar es reemplazar su contenido (como la B), y lo que se
  decida después va en una migración nueva.
- Después de cada `git pull`: `git diff --stat HEAD@{1} -- db/migrations`.
  Si el otro autor trajo una migración, pasa por esta misma revisión; si
  su cadena no sigue a la 0011 (`npx drizzle-kit check` marca dos
  migraciones que salen de la misma), frenar y rearmarla antes de migrar.

### La diferencia de esquema que deja la opción B

- **En producción** (y en toda base migrada desde cero con esta 0010, como
  la de `test:aislado`), `students.disciplina` sigue: `text` que acepta
  vacío, con `students_disciplina_check` y el comentario; en producción,
  con los 10 valores.
- **En el esquema de Drizzle** (`src/data/schema/students.ts`) y en los
  snapshots `0010` y `0011` no existe. Es a propósito: el código no la lee
  ni la escribe (drizzle pide columnas explícitas) y los alumnos nuevos
  quedan con NULL. **No volver a agregarla al esquema:** `drizzle-kit
  generate` produciría un `ADD COLUMN` que en producción falla porque la
  columna ya está, y la transacción se lleva la migración entera.
- **En las bases donde ya corrió la 0010 original** (la de desarrollo en
  5433, desde el 2026-10-21, y quizás la del otro autor) no está: drizzle
  no vuelve a correr una migración ya registrada. Para el código da
  igual; para igualarla con producción, recrear la base ("Recrear la base
  desde cero", arriba).
- **Borrarla o volver a usarla más adelante** es otra decisión y una
  migración nueva escrita a mano (`npx drizzle-kit generate --custom
  --name <nombre>`), con backup, simulacro y ensayo. `generate` desde el
  esquema nunca la va a proponer: para drizzle ya no existe.
- El ensayo compara contra el repositorio migrado desde cero, y con B los
  dos tienen la columna: no marca diferencia.

### `drizzle-kit push`, `migrate` y `studio`: nunca contra producción

`drizzle.config.ts` toma `DATABASE_URL_OWNER` del entorno, sin la barrera
de `migrate.ts`. Contra producción, `drizzle-kit push` compara el esquema
con la base viva y propone borrar lo que el esquema no tiene: hoy,
`disciplina` con sus 10 valores. Con `strict: true` pide confirmación,
pero un "sí" lo borra sin backup. `drizzle-kit migrate` aplicaría la
carpeta sin las capas `infra/`, y `studio` edita datos por fuera de la
app. La única forma de migrar producción es `npm run db:prod:migrate`, y
las credenciales de producción no se exportan en la terminal:
`produccion.ts` las carga solo para el script que corre.

### Procedimiento (opción B)

Los pasos marcados **(autorización)** los decide Thiago, cada uno en su
momento: la decisión de Diego habilita la B, no la ejecución.

1. **Código.** `git fetch` y `git pull --ff-only`, con la revisión de
   migraciones ajenas de arriba. La 0010 ya es la variante B; el journal y
   los snapshots no cambian (drizzle no vuelve a leer el hash de una
   migración ya aplicada, así que en las bases de desarrollo donde la 0010
   original ya corrió no pasa nada). `npx next typegen`, `npm run verify` y
   `npm run test:e2e`. **(autorización)** Commit local, **sin push**: lo
   que se migra tiene que ser lo commiteado.
2. **(autorización) Backup** (solo lectura sobre producción):
   ```bash
   GPG_PASSPHRASE_FILE="$HOME/.fuerza-natural/backup-gpg.pass" \
     npx tsx scripts/db/produccion.ts scripts/db/backup.ts \
     --salida "C:/Users/Thiago/FuerzaNatural-Backups" --gym <gym_id completo>
   ```
   Tiene que dejar `….sql.gpg` (más de 300 KB con la base actual) y
   `….conteos.json`, y los conteos impresos tienen que coincidir con lo
   esperado (482 alumnos y 1521 pagos al 2026-11-02, más lo cargado
   después).
3. **Simulacro de restauración** de ese backup
   (`scripts/db/simulacro-restauracion.ts`): tiene que decir `SIMULACRO OK`.
4. **Ensayo de migración** con ese mismo backup y la carpeta
   `db/migrations` del paso 1: tiene que decir `ENSAYO OK` **sin**
   `--aceptar-perdida` (con B no se va ningún dato) y con `disciplina`
   intacta. Conviene sumar `--despues` para recorrer la app sobre la copia:
   el recorrido del 2026-11-02 fue con Next.js 16.3.8.
5. **(autorización) Migrar:** los controles de "Antes de correr
   `db:prod:migrate`" y `npm run db:prod:migrate`. Tarda menos de un
   segundo (en el ensayo, ~0,5 s); las dos migraciones entran o fallan
   juntas.
6. **Verificar** (solo lectura): 12 migraciones aplicadas;
   `situacion_laboral` y `situacion_laboral_detalle` presentes;
   `disciplina` con sus 10 valores y el comentario; `npm run
   db:prod:conciliar -- --mes <mes actual>` sin hallazgos de integridad;
   `/api/salud` en ok. El
   código publicado (`8426c35`) sigue funcionando con la base migrada: no
   usa `disciplina` desde `17ba310` y nunca lee columnas que no conoce
   (drizzle pide columnas explícitas). Es lo mismo que pasa hoy con
   `disciplina`, que existe en la base y el código ignora.
7. **(autorización) Publicar** el código nuevo (push a `main`), nunca
   antes del paso 5: el código nuevo lee `situacion_laboral`, y cada push
   se publica solo. Comprobar que `/api/salud` muestre el commit nuevo.
8. **Anotar** backup, simulacro, ensayo y migración en el historial.

**Volver atrás:** la app, promoviendo `dpl_4wQ9Q9bk7qKCzEYQuMQQM3M81zP7`
(`8426c35`, el deploy actual desde la actualización de seguridad), que
funciona con la base migrada. **No** volver a `dpl_3TeaZ…` (`b49b712`):
es anterior al arreglo de seguridad. La base
no hace falta revertirla (la 0011 solo agrega columnas que aceptan vacío,
y con B no se borra ni se modifica ningún dato).

### Actualización de seguridad (publicada el 2026-11-02)

**Publicada:** commit `8426c35` → `dpl_4wQ9Q9bk7qKCzEYQuMQQM3M81zP7`, sin
migraciones (producción sigue en la 0009). Ver el historial.

`npm audit` (2026-11-02) marcaba en `next` 16.3.8, la versión publicada entonces, un
DoS sin autenticación en Server Actions (GHSA-p3m5-59mp-jv5r, la app las
usa en todas las pantallas, sin workaround) y dos RCE (GHSA-2464-fhr4-w9xw,
optimización de imágenes con SVG vía `sharp` < 0.35.5; GHSA-673q-mjm6-r5xr,
`use cache`, que la app no usa). Corregido en 16.4.1. También `zod` <
4.6.6 (GHSA-mrhx-c7xc-m3w5). Lo demás que marca entra por el CLI `shadcn`
(herramienta de desarrollo, no llega al bundle).

```bash
npm install --save-exact next@16.4.3
npm install zod@^4.6.6
npm install -D --save-exact eslint-config-next@16.4.3
npx next typegen   # en un clon nuevo, `verify` lo necesita antes de tsc
npm run verify
```

Probado el 2026-11-02 en un worktree de `b49b712` (lo publicado entonces): verify
completo (445/445) y build OK; los e2e que fallan son los mismos que
fallan sin la actualización (tests viejos). Y con los cambios del
2026-11-01 encima: 491/491, build y e2e de pagos 10/10. No toca la base:
se publicó antes que la migración. Volver atrás de esa entrega (solo si
fallara): promover `dpl_3TeaZLyGuh75fTYiZ8DsBDPiYLQK`, que vuelve a dejar
expuesto el DoS.

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
| 2026-10-02 | Auditoría de solo lectura de producción: RLS 11/11 tablas (10 con FORCE), una sola función SECURITY DEFINER con `search_path` fijo y EXECUTE solo para `fn_app`, ningún rol con BYPASSRLS, `app` no expuesto a la Data API (PGRST106), 0 buckets, signup desactivado | ✓ Sin hallazgos en la base. El dominio seguía en `dpl_9c3J7` (Supabase viejo) y la base con 119 alumnos / 0 pagos |
| 2026-10-02 | Simulacro de backup y restauración con DATOS SINTÉTICOS (`backup.ts` con `fn_owner --gym` → gpg → `simulacro-restauracion.ts`), todo en Postgres descartables locales | ✓ 12/12 tablas iguales (48 alumnos, 379 pagos, 683 asistencias, 438 de auditoría), 6 s. Sin `--gym`, el dump falla por FORCE RLS, como se esperaba |
| 2026-10-02 | Carga de las planillas reales en una base local descartable (informe → `--aplicar` → segundo `--aplicar`), y con 3 "importados antes" simulados | ✓ 466 alumnos, 203 activos, 1315 pagos, $64.045.000; reemplazó los 3; la segunda corrida se negó. Base e informe borrados |
| 2026-10-03 | Rotación de `fn_readonly`, `fn_owner` y `fn_app` (`db:prod:rotar`) y `DATABASE_URL` en Vercel | ✓ Las nuevas conectan, las anteriores ya no; el deploy nuevo dio `base: ok` |
| 2026-10-03 | Primer backup de producción con `pg_dump` + PGOPTIONS | ✗ El pooler ignora PGOPTIONS: tablas con FORCE RLS vacías. El simulacro lo detectó y se descartó. Se cambió el método (JSON por tabla con set_config) |
| 2026-10-03 | Backup + simulacro, estado previo (`…04-42-53`) | ✓ 11/11 tablas, conteo y huella del contenido, 6 s |
| 2026-10-03 | `db:prod:migrate` (0009 + funciones de límite de intentos) | ✓ 10 migraciones; `access_attempts` sin acceso directo; 4 funciones DEFINER con search_path fijo |
| 2026-10-03 | Carga de planillas: 1er `--aplicar` | ✗ Cortado a los 10 min (un pago por viaje contra us-west-2); revertido entero, verificado. Se pasó a lotes |
| 2026-10-03 | Carga de planillas: 2º `--aplicar` | ✓ 466/203/1315, reemplazó 119; cada mes = planilla; $64.045.000 |
| 2026-10-03 | Backup + simulacro, estado cargado (`…05-00-42`) | ✓ 12/12 tablas, conteo y contenido, 6 s |
| 2026-10-03 | Push `1a72c0d`, redeploy de `dca378c` como respaldo, promote de `dpl_9wtWtPx7gu3ADAcaHkztaFDz4aK9` | ✓ Dominio en `1a72c0d`; `/api/salud` ok; login real del dueño ok; rutas privadas 307 sin sesión |
| 2026-10-09 | Contraseña del dueño cambiada desde `/cuenta/contrasena` (queda en Actividad como `user.password_changed`) | ✓ La inicial ya no entra ("Email o contraseña incorrectos"); `DUENO_PASSWORD_INICIAL` borrada del archivo de credenciales |
| 2026-10-09 | Contraseña del dueño cambiada de nuevo desde `/cuenta/contrasena`, a pedido de Thiago (la elige el dueño; no se anota) | ✓ Confirmación del formulario, otras sesiones cerradas; entra con la nueva |
| 2026-10-09 | Revisión del repositorio, ahora público: secretos en todo el historial y datos personales | ✓ Sin credenciales (la única URL con contraseña es de un test, con un valor falso). Se sacó del RUNBOOK el nombre real de una alumna |
| 2026-10-22 | Diagnóstico Panel 191 vs. Pagos 192, de solo lectura (ver "Panel vs. Pagos") | ✓ Pagos cuenta pagos y el Panel cuenta personas: 193 pagos de 192 personas, una pagó dos meses el 10/10. Ningún dato tocado |
| 2026-10-22 | Backup + simulacro antes de cambiar datos (`…2026-10-22T15-41-24`) | ✓ 12/12 tablas, conteo y contenido, 6 s |
| 2026-10-22 | Push `4c565d9` + `08c2720` → `dpl_GgPC93DFtqYcS74rEmpqtpKHpexu`. Volver atrás: `dpl_54aQTL9K3bxQENcTno7JV1RihYHK` (`ce61b2a`), compatible con la base porque no hubo migración | ✓ `/api/salud` ok con `08c2720` |
| 2026-10-22 | Desde Configuración, con la cuenta del dueño y a su pedido (lo hizo NEXA): plan LIBRE desactivado; motivos "Viaje" y "Enfermedad" agregados antes de "Otro" | ✓ 3 entradas en Actividad; alta y cobro ofrecen solo 2/3/4/5 días; los 8 motivos anteriores siguen. La verificación no registró ningún pago ni ninguna baja |
| 2026-11-01 | Diagnóstico "197 activos / 198 pagos", de solo lectura (`conciliar-pagos.ts` + reconstrucción temporal) | ✓ 198 pagos de 197 personas entre el 27 y el 28/10: el alumno con dos pagos legítimos del 10/10. Integridad sin hallazgos. Ningún dato tocado |
| 2026-11-01 | Estado de migraciones en producción, de solo lectura | Aplicadas 0000–0009. La 0010 (borra `disciplina`, 10 alumnos con dato) y la nueva 0011 (situación laboral) NO aplicadas: van juntas, decidir la 0010 antes |
| 2026-11-02 | Auditoría de solo lectura para la 0010/0011 (transacciones READ ONLY; un intento de escritura de control fue rechazado) | 0000–0009 aplicadas con el hash del repo; `disciplina`: 10 alumnos, todos `MUSCULACION`, activos, altas manuales del 10 al 20/10, sin rastro en Actividad y sin dependencias en la base. Ningún dato tocado |
| 2026-11-02 | Backup + simulacro (`…2026-11-02T02-34-56`) | ✓ 12/12 tablas, conteo y contenido, 7 s |
| 2026-11-02 | Ensayo de la 0010 + 0011 sobre la copia (`ensayo-de-migracion.ts`), variantes A, A "obvia", B y C, y recorrido de la app con B | ✓ Ver "Migración 0010 + 0011". La A "obvia" pierde los 10 valores en silencio por FORCE RLS. Producción no se tocó |
| 2026-11-02 | `next` 16.4.3 + `zod` 4.6.7 en un worktree de `b49b712`, y con los cambios del 2026-11-01 encima | ✓ verify (445/445 y 491/491) y build; e2e de pagos 10/10 con los cambios. Sin publicar |
| 2026-11-02 | Entrega 1 (seguridad), con autorización de Thiago: worktree desde `origin/main` (`b49b712`, sin cambios de terceros), los mismos e2e antes y después, app recorrida contra una copia de producción SIN migrar (esquema y journal idénticos después) → commit `8426c35` (solo `package.json`, `package-lock.json`, `AGENTS.md`) → push → `dpl_4wQ9Q9bk7qKCzEYQuMQQM3M81zP7` | ✓ Build en Vercel con Next.js 16.4.3, sin errores. `/api/salud` ok con `8426c35`; `/login` y `/recuperar` sin errores de consola (escritorio y celular); 9 rutas privadas 307 a `/login`; headers de seguridad completos; 40 registros de runtime sin 4xx/5xx; producción sigue en la 0009 (lectura). Volver atrás: `dpl_3TeaZLyGuh75fTYiZ8DsBDPiYLQK` |
| 2026-11-02 | `8426c35` traído al árbol local de la entrega 2 (respaldo, stash, `pull --ff-only`, pop, `npm ci`) | ✓ Sin conflictos; los 41 cambios intactos; verify 491/491 y build con Next.js 16.4.3; e2e de pagos 5/5 (alumnos: los 3 tests viejos de siempre) |
| 2026-11-03 | Opción B de la 0010, con la autorización de Diego: `0010_deep_husk.sql` pasa a ser el `COMMENT ON COLUMN` ensayado (journal y snapshots sin tocar); 3 e2e de alumnos actualizados a la interfaz actual y 1 nuevo (teléfono sin prefijo → +549). Todo local: sin migrar (ni siquiera bases descartables), sin commit ni push | ✓ typecheck, lint y build (Next.js 16.4.3); vitest 408/408 sin base (los 83 de integración no corrieron: necesitan migrar una base); e2e 9/9 (5 de pagos, 4 de alumnos); los 41 cambios anteriores intactos |
| — | Recuperación de contraseña de punta a punta en producción | Pendiente — requiere configurar URLs y SMTP en Supabase Auth |
| — | Prueba del dueño (revisión de datos) | Pendiente — presencial con Diego |
