# DECISIONES.md — Registro de decisiones técnicas (ADR ligero)

Formato: fecha, decisión, contexto/motivo, alternativas descartadas.
Se agrega una entrada nueva cada vez que se toma una decisión que otro
desarrollador (o el "yo" de dentro de seis meses) necesitaría justificar.

---

## 2026-09-07 — Esquema `app` en vez de `public`

**Decisión:** las 10 tablas de negocio viven en `app.*`, no en `public`.

**Motivo:** el Data API de Supabase (PostgREST) solo expone `public` por
defecto. Aunque la `anon key` se filtre, no da acceso a un solo dato de
negocio. Costo: cero — es una palabra en el schema de Drizzle.

---

## 2026-09-07 — `app_users` es la única tabla sin `FORCE ROW LEVEL SECURITY`

**Decisión:** de las 10 tablas, solo `app_users` tiene `ENABLE ROW LEVEL
SECURITY` sin `FORCE`.

**Motivo:** verificado empíricamente contra Postgres 17 real que `FORCE`
aplica también al dueño de la tabla, no solo a roles no privilegiados.
Sin este ajuste, la función `SECURITY DEFINER` que resuelve el problema
de arranque de la autenticación (leer `app_users` antes de conocer el
`gym_id`) también queda bloqueada. Detalle completo: `docs/SECURITY.md` §3.2.

**Alternativa descartada:** un rol adicional con `BYPASSRLS` dedicado
solo a esta función. Se descartó por agregar un cuarto rol (y su propia
superficie de auditoría) para resolver algo que la semántica estándar de
"owner sin FORCE" ya resuelve sin código adicional.

---

## 2026-09-07 — Wrapper `public.immutable_unaccent()`

**Decisión:** se agrega una función SQL propia,
`public.immutable_unaccent(text)`, marcada `IMMUTABLE`, en vez de llamar a
`unaccent()` directamente en la columna generada `students.nombre_busqueda`.

**Motivo:** `unaccent()` es `STABLE`, no `IMMUTABLE`; Postgres rechaza
columnas generadas con expresiones no inmutables. Descubierto ejecutando
la migración real, no por lectura de documentación. Detalle:
`docs/SECURITY.md` §5.

---

## 2026-09-07 — `citext` descartado a favor de `text` + `lower()`

**Decisión:** `app_users.email` es `text`, no `citext`, con un `CHECK
(email = lower(email))` y la normalización a minúsculas hecha en la
aplicación antes de insertar.

**Motivo:** evita depender de una extensión más (`citext`) para lograr
unicidad case-insensitive, que un `CHECK` + disciplina de normalización
logra igual, con una dependencia menos. Consistente con el principio
anti-sobreingeniería de la SPEC.

---

## 2026-09-07 — `middleware.ts` → `proxy.ts` (Next.js 16)

**Decisión:** el archivo se llama `src/proxy.ts` y exporta `proxy()`, no
`middleware()`.

**Motivo:** Next.js 16.3.4 (la versión instalada) deprecó formalmente la
convención `middleware.ts` a favor de `proxy.ts` — confirmado por el
propio `next build`, que emitía la advertencia de deprecación con
`middleware.ts` y dejó de emitirla tras la migración. Se usó el codemod
oficial (`@next/codemod middleware-to-proxy`) como referencia de la
transformación exacta (rename de archivo + rename de la función
exportada), aplicada a mano por un problema de la CLI del codemod
quedándose esperando input interactivo en este entorno.

---

## 2026-09-07 — Postgres local vía `winget`, sin Docker

**Decisión:** el entorno de desarrollo de Fase 0 usa PostgreSQL 17
instalado con `winget` y un cluster propio del usuario (puerto 5433, sin
servicio de Windows), no Docker.

**Motivo:** Docker Desktop, la CLI de Supabase y `psql` no estaban
disponibles en el entorno de esta sesión. `winget install
PostgreSQL.PostgreSQL.17` sí lo estuvo, y permitió validar el esquema,
las policies de RLS y los triggers contra una base real — que es
justamente lo que se buscaba evitar sacrificar. El servicio de Windows
instalado por winget no se usa (una cuenta de servicio sin privilegios de
administrador no puede controlarlo) — ver `docs/RUNBOOK.md`.

**Alternativa descartada:** documentar el esquema/RLS solo por escrito,
sin ejecutarlo. Se descartó explícitamente — encontró y corrigió 3
problemas reales (el de `app_users`/FORCE, el de `immutable_unaccent`, y
el del `GRANT CREATE ON SCHEMA public`) que una revisión de código, por
cuidadosa que fuera, no habría detectado.

---

## 2026-09-07 — `logActivity()` no es un wrapper (`withX`), es una función que se llama explícitamente

**Decisión:** a diferencia de `withAuth`/`withTenantTx` (que envuelven un
handler), `logActivity(tx, ctx, entry)` se llama directamente, en el
punto exacto del caso de uso donde ocurrió el hecho de negocio.

**Motivo:** la auditoría necesita el `resumen` en español, ya armado, con
el contexto específico de qué pasó — envolver un handler genérico no
puede producir ese texto sin reintroducir lógica de negocio en el kernel.
Al recibir el mismo `tx` de `withTenantTx`, la atomicidad (si la
auditoría falla, se revierte todo) es una propiedad de la transacción,
no del wrapper.

---

## 2026-09-07 (Fase 1) — La cookie `dev_mock_auth_id` era un bypass de autenticación

**Decisión:** la sesión simulada de desarrollo se habilita únicamente si
`NODE_ENV !== "production"` **y** no hay un proyecto Supabase configurado.
La condición vive en un solo lugar: `isDevMockAuthEnabled()` en
`src/lib/auth/config.ts`.

**Contexto:** Fase 0 dejó una cookie `dev_mock_auth_id` que
`getAuthContext()` aceptaba como identidad cuando `supabase.auth.getUser()`
no devolvía usuario, **sin condicionarla a nada**. En producción, cualquiera
que enviara esa cookie con un `auth_user_id` válido entraba como ese
usuario — y con `aal2`, salteándose el MFA que el sistema exige para DUENO.
Que la cookie sea `httpOnly` no protege: eso impide que la lea el
JavaScript de la página, no que un atacante la mande a mano con curl.

Contribuyó a que pasara desapercibido que hubiera **tres** criterios
distintos de "¿hay Supabase configurado?" repartidos en tres archivos
(`supabase-server.ts`, `proxy.ts`, `login/actions.ts`), ninguno de los
cuales gobernaba el consumo de la cookie en `context.ts`.

**Alternativa descartada:** borrar el mecanismo entero. Se descartó porque
es justamente lo que permite correr la suite e2e completa sin un proyecto
Supabase real (ver la entrada siguiente) — el problema no era que
existiera, era que no tenía puerta.

Regresión cubierta en `tests/security/dev-mock-auth.test.ts`, que además
falla si el nombre de la cookie se vuelve a escribir a mano fuera de
`config.ts`.

---

## 2026-09-07 (Fase 1) — `students.telefono` pasa a ser opcional

**Decisión:** `telefono` deja de ser `NOT NULL`. El CHECK de formato E.164
se mantiene, pero solo cuando hay valor
(`telefono is null or telefono ~ '...'`). Migración
`db/migrations/0001_telefono_opcional.sql`.

**Motivo:** dos razones independientes. (a) El brief de Fase 1 §7 lo define
opcional. (b) Los datos reales del Data Discovery tienen alumnos sin
teléfono: con `NOT NULL`, la migración de Fase 5 tendría que inventar un
valor — exactamente el tipo de dato falso que este sistema existe para
evitar. Relajar un constraint no rompe ninguna fila existente.

---

## 2026-09-07 (Fase 1) — Los estados siguen en español (ACTIVO/PAUSADO/BAJA)

**Decisión:** el brief de Fase 1 §3 nombra los estados ACTIVE / PAUSED /
BAJA; el sistema mantiene los valores que Fase 0 ya escribió en el CHECK de
`app.students.vinculo`: `ACTIVO`, `PAUSADO`, `BAJA`.

**Motivo:** el conjunto de estados y su semántica son idénticos — la
diferencia es de idioma en dos de las tres etiquetas. Cambiarlos exigiría
una migración de datos y de constraint, y dejaría el enum mezclando inglés
y español (`BAJA` no tiene traducción usada en el negocio). El resto del
dominio, la UI y la auditoría están en español.

---

## 2026-09-07 (Fase 1) — La BAJA de Fase 1 usa el código `SIN_ESPECIFICAR`, no `OTRO`

**Decisión:** al dar de baja desde Fase 1 se escribe
`baja_motivo_codigo = 'SIN_ESPECIFICAR'` y `baja_fecha = hoy`.

**Contexto:** el CHECK `students_baja_coherencia_check` de Fase 0 exige
fecha **y** código de motivo para que la fila sea coherente, pero el brief
de Fase 1 §9 dice explícitamente que el workflow de bajas (catálogo de
motivos, fecha efectiva, nota, métricas) es Fase 3. Hay que escribir un
código igual.

**Alternativa descartada:** usar `OTRO`, que sí está en el catálogo de
`gym_settings.motivos_baja`. Se descartó porque `OTRO` significa "el dueño
eligió otro motivo", y acá el dueño no eligió nada. Con un código propio,
Fase 3 puede encontrar exactamente estas bajas y pedirle el motivo real —
convirtiendo una limitación en una lista de trabajo pendiente.

---

## 2026-09-07 (Fase 1) — Las lecturas también pasan por `withAuth()`

**Decisión:** las consultas de lectura (`listarAlumnosQuery`,
`obtenerFichaAlumnoQuery`, …) usan el mismo `withAuth()` que las
escrituras, y el test `tests/security/withAuth-wrapping.test.ts` ahora
exige el wrapper tanto en los exports `*Action` como en los `*Query`.

**Motivo:** los datos de los alumnos son el activo sensible del sistema.
Una lectura sin autorización los filtra igual de mal que una escritura sin
autorización los corrompe. El sufijo distinto (`Query` vs `Action`) deja
ver de un vistazo cuál muta y cuál no, sin aflojar la barrera.

---

## 2026-09-07 (Fase 1) — `01_rls_and_triggers.sql` ahora es idempotente

**Decisión:** cada `CREATE POLICY` / `CREATE TRIGGER` de la capa 3 va
precedido de su `DROP ... IF EXISTS`.

**Motivo:** Postgres no soporta `CREATE POLICY IF NOT EXISTS`. El
comentario de `scripts/db/migrate.ts` afirmaba que las capas 1 y 3 eran
seguras de re-ejecutar, pero no lo eran: la segunda corrida de
`npm run db:migrate` fallaba con 42710 ("policy already exists") — que es
justo lo que pasa al agregar cualquier migración de esquema nueva.
Descubierto al aplicar la migración de Fase 1.

---

## 2026-09-07 (Fase 1) — Los tests e2e sí se pueden correr sin Supabase

**Decisión:** `tests/e2e/alumnos.spec.ts` cubre el recorrido completo
(login → listado → buscar → abrir → crear → editar → cambiar estado) y se
ejecuta contra Postgres local + `npm run db:seed`, usando la sesión
simulada de desarrollo.

**Motivo:** Fase 0 postergó los e2e suponiendo que hacían falta
credenciales reales de Supabase. No hacen falta para probar el módulo de
negocio: lo que se está verificando es la app, no el proveedor de
identidad. Cuando exista Supabase real habrá que reemplazar la función
`iniciarSesion()` del spec por el login verdadero con TOTP — el resto del
recorrido no cambia. El primer bug que encontró esta suite fue real: tras
un cambio de estado exitoso el formulario quedaba abierto y sin
confirmación visible.

---

## 2026-09-07 (post-Fase 1) — `plans.acceso` para representar LIBRE

**Decisión:** `app.plans` gana una columna `acceso` (`DIAS_FIJOS` |
`LIBRE`). Para LIBRE, `dias_semana` se interpreta como el PISO de días.

**Motivo:** el dueño confirmó que LIBRE significa "5 días o más por
semana, incluye sábados". Un `dias_semana` solo no puede expresarlo:
guardar 5 afirmaría "exactamente 5" (y la regla dice explícitamente que
LIBRE no es igual a 5 días), y guardar 6 sería inventar un número que
nadie confirmó. Con `acceso`, el dato guardado dice exactamente lo que el
dueño dijo, sin agregarle precisión falsa.

**Alternativa descartada:** dos booleanos (`dias_es_minimo`,
`incluye_sabado`). Se descartó por agregar dos columnas para expresar un
único concepto de negocio que hoy tiene exactamente dos valores.

---

## 2026-09-07 (post-Fase 1) — `plans.precio_actual` pasa a ser nullable

**Decisión:** el precio de un plan puede ser NULL, y significa "todavía no
confirmado". Ídem `gym_settings.precio_medio_mes`.

**Motivo:** el dueño confirmó cuatro precios y dejó el de LIBRE
explícitamente pendiente. Con `NOT NULL` había que poner algo: 0 diría
"este plan es gratis" y Fase 2 lo autocompletaría como monto del pago, o
inventar un valor plausible ($65.000 por analogía con 5 días) — que es
exactamente lo que la consigna prohíbe. NULL es la única representación
honesta de un dato que no existe.

**Consecuencia para Fase 2:** el formulario de pago no puede autocompletar
un monto cuando el precio es NULL; tiene que pedirlo.

---

## 2026-09-07 (post-Fase 1) — "1/2 MES" vive en `gym_settings`, no en `plans`

**Decisión:** el precio de la modalidad "1/2 MES" ($45.000) se guarda en
`gym_settings.precio_medio_mes`, y la modalidad se registra en
`payments.modalidad`. NO existe una fila "1/2 MES" en `plans`.

**Motivo:** el dueño fue explícito en que "1/2 MES" no es un plan
permanente del alumno sino una modalidad temporal de cobertura.
`students.plan_id` referencia `plans`, así que una fila "1/2 MES" ahí
dentro sería asignable como plan HABITUAL de una persona — y además
aparecería en el desplegable del alta de alumnos. Mantenerla fuera de
`plans` convierte la regla en una imposibilidad estructural, no en una
convención que alguien puede olvidar.

**Alternativa descartada:** una tabla `modalidades` propia. Se descartó
por sobreingeniería: hoy hay exactamente una modalidad especial, con
exactamente un parámetro (su precio).

---

## 2026-09-07 (post-Fase 1) — `payment_periods` gana `cubre_desde` / `cubre_hasta`

**Decisión:** además de `periodo` (día 1 del mes imputado), cada fila
guarda el rango real cubierto. Un CHECK garantiza
`periodo = date_trunc('month', cubre_desde)`.

**Motivo — este era el conflicto real de esta tanda.** El modelo de Fase 0
solo podía decir "este pago cubre el mes M": `periodo date` con un CHECK
de que fuera día 1. La modalidad "1/2 MES" confirmada (15 días
consecutivos, que pueden empezar CUALQUIER día) era literalmente
imposible de representar sin mentir — habría que haber marcado
"septiembre cubierto" para un pago que cubre medio septiembre, y Fase 2
habría calculado la situación de pago sobre un dato falso.

Se conserva `periodo` en vez de reemplazarlo por el rango: es lo que hace
que "¿quién tiene cubierto septiembre?" siga siendo un WHERE indexado en
vez de aritmética de rangos sobre toda la tabla. El modelo sigue siendo
"período cubierto", nunca "último pago + 30 días".

Que `date_trunc('month', date)` sea aceptable dentro de un CHECK (exige
inmutabilidad) se verificó ejecutándolo contra Postgres 17 real antes de
escribir la migración, no por lectura de documentación — misma disciplina
que en Fase 0.

---

## 2026-09-07 (post-Fase 1) — El seed pasa a ser re-ejecutable

**Decisión:** `npm run db:seed` reutiliza el gimnasio DEMO si ya existe y
actualiza planes y precios con `onConflictDoUpdate`, en vez de intentar
crear todo de cero.

**Motivo:** la versión anterior fallaba la segunda vez
(`app_users_auth_user_id_key` duplicada) **después** de haber creado un
gimnasio nuevo — dejando la base a medias: un gimnasio huérfano sin
usuario, y el usuario demo apuntando al gimnasio viejo con la
configuración vieja. Se descubrió al aplicar estas reglas, que es
justamente el caso en que hay que volver a correr el seed: cada vez que
cambian los planes o los precios.

---

## 2026-09-08 (Fase 2, revisión de dirección artística) — Negro + verde: la identidad es la de Fuerza Natural

**Decisión:** el sistema visual pasa de "cobre como acento" a NEGRO + VERDE.
El verde de marca (`--verde`, hue 156) es a la vez la identidad del cliente
y la señal semántica de "cubierto"; el negro es el chasis (rail, títulos,
botones primarios). El cobre desaparece del código. Fuente de verdad de la
dirección: el encabezado de `src/app/globals.css`.

**Motivo:** el producto se veía como "un dashboard SaaS bien hecho", con
una paleta que no era la del gimnasio. Fuerza Natural es negro y verde, y
NEXA tiene una sola pregunta —"¿quién tiene el mes cubierto?"— cuya
respuesta es verde. Hacer coincidir la marca con la señal de salud no es
una capa de pintura: cuando el gimnasio está bien, la pantalla está verde.

**Lo que cambia con esto:**
- El rail muestra al GIMNASIO arriba (sello con sus iniciales, derivadas
  del nombre configurado) y a NEXA abajo, chico. Otro gimnasio tendrá su
  sello sin tocar código.
- Escalera de planos (`hundido` → lienzo → superficie → overlay) en vez
  de sombras: la profundidad sale de luminancia y hairline.
- Disciplina numérica: importes con el símbolo más liviano que la cifra
  (`<Importe>`), tabular siempre, a la derecha en tablas.
- La pieza firma del panel deja de ser una barra de progreso: es LA BANDA
  DEL MES, una marca por alumno activo, pintada por estado.
- La ficha es un espacio de trabajo con banda de datos y pestañas
  (Resumen / Pagos / Historial), no un formulario de lectura.

**Lo que NO cambia:** reglas de negocio, casos de uso, esquema, RLS,
auditoría. Ninguna consulta nueva: todo sale de los datos que el panel y
la ficha ya traían.

---

## 2026-09-08 — Campo `genero` en `students`: opcional, editable, sin inferencia

**Decisión:** se agrega `students.genero` (nullable, `FEMENINO` |
`MASCULINO` | `OTRO` | `PREFIERO_NO_DECIR`), a pedido para poder mostrar
distribución por género en Métricas. Sigue el mismo patrón que
`telefono`: opcional en alta y edición, sin valor por defecto.

**Motivo:** no estaba en el brief original de Fase 1 ni en el Data
Discovery — es un dato nuevo, no uno que faltaba cargar. "Sin dato" es un
estado real y se muestra como tal en Métricas, nunca se reparte entre los
demás segmentos ni se infiere del nombre.

**Alternativa descartada:** inferir género del nombre de pila. Se
descartó por la misma razón que el sistema no usa nombre+apellido como
identificador (`docs/ARCHITECTURE.md` — Data Discovery): un nombre no es
un dato confiable de la persona.

---

## 2026-09-08 — Asistencia: tabla `attendance`, sin DELETE, sin fórmula de "esperada"

**Decisión:** nueva tabla `app.attendance` (un check-in por alumno por
día), con RLS `tenant_isolation` idéntica a las demás tablas. Deshacer una
marca es un `UPDATE activo = false`, nunca un `DELETE` — `fn_app` no tiene
privilegio DELETE en ninguna tabla del esquema, y esto no es la excepción.

**Motivo:** no existía ningún registro de asistencia en el sistema. Se
construyó el mínimo verificable (el hecho de que alguien vino) en vez de
una fórmula de "% de asistencia esperada según el plan", que nadie
confirmó como regla de negocio (`docs/REGLAS-DE-NEGOCIO.md`). La métrica
de Métricas ("asistió al menos una vez en 30 días") es deliberadamente
simple por la misma razón.

---

## 2026-09-09 — Enrolamiento TOTP real: `requiresAal2()` se mantiene

**Contexto:** la cuenta `DUENO` recién creada en el proyecto Supabase de
producción quedaba bloqueada en toda pantalla, porque `mfa/actions.ts`
era un no-op y `aal` nunca podía llegar a `aal2`. Se evaluó (y por un
rato se aplicó en un commit local) desactivar `requiresAal2()` del todo.

**Decisión final: no.** Se implementó el enrolamiento TOTP real
(`supabase.auth.mfa.enroll()` + `challengeAndVerify()`,
`app/(auth)/mfa/{enrolar-mfa,desafio-mfa,actions}.tsx`) y el flujo de
login ahora manda a un `DUENO` sin factor a `/mfa` a configurarlo
(`resolverDestinoLogin()` en `src/lib/auth/flujo-login.ts`), en vez de
dejarlo golpeando contra `FORBIDDEN` sin explicación. `requiresAal2()`
sigue exigiendo `aal2` para `DUENO`, como decía SPEC V1 §3.10.

**Motivo:** sacar la exigencia bajaba la seguridad de la cuenta con más
privilegios del sistema a "una sola contraseña", de forma permanente.
El problema real era que faltaba la pantalla de enrolamiento, no que la
exigencia estuviera de más — y esa pantalla ya existe.
