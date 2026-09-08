# ARCHITECTURE.md — Fuerza Natural / NEXA GYM OS

Monolito modular. Un solo despliegue (Vercel), sin microservicios, sin
colas — a esta escala (un gimnasio, un usuario concurrente) cualquier otra
cosa es complejidad sin retorno. La modularidad vive **adentro**, con una
regla de dependencias verificada automáticamente (`tests/architecture/`).

## Capas y quién puede importar a quién

```
app/ (UI, Next.js)
   ↓ puede importar
use-cases/  (Server Actions delgadas — orquestación)
   ↓ puede importar
domain/ (funciones puras)     data/ (repositorios, Drizzle)     lib/auth, lib/security
   ↑                               ↑
   └── CERO dependencias entre sí, y CERO hacia next/app/lib/auth ──┘
```

**Regla dura, verificada en `tests/architecture/dependency-boundaries.test.ts`:**
nada bajo `src/domain/` puede importar de `next`, `@/data`, `@/app`,
`@/lib/auth`, ni mencionar `postgres` en un import. El dominio es 100%
funciones puras — sin esa propiedad, no se puede testear exhaustivamente
sin base de datos, que es todo el punto de tenerlo separado.

## Estructura de carpetas

```
src/
  app/                      ← Next.js. Rutas y páginas. Nada de lógica de negocio.
    (auth)/login/, mfa/     ← sin sesión
    (app)/                  ← protegido, layout llama getAuthContext()
    proxy.ts                ← (no es "middleware.ts" — ver DECISIONES.md)

  domain/                   ⭐ NÚCLEO PURO — sin I/O, sin Date, sin imports externos
    fechas/hoy.ts           ← la ÚNICA función que puede tocar Date/Intl
    alumnos/                ← Fase 1
      vinculo.ts            ← los 3 estados y las transiciones permitidas
      cambio-de-vinculo.ts  ← qué columnas quedan escritas en cada cambio
      fecha-de-alta.ts      ← la regla que respeta vinculo_desde >= fecha_alta
      identidad.ts          ← normalización (NO fusión de personas: Fase 5)
      busqueda.ts           ← normalización del término (espeja nombre_busqueda)
    pagos/, atencion/, importacion/, config/   ← Fase 2+

  use-cases/
    _kernel/
      result.ts             ← Result<TData, TConfirmacion>
      with-auth.ts           ← sesión → rol → AAL → AuthContext
      with-validation.ts     ← Zod en el borde
      with-tenant-tx.ts      ← BEGIN + set_config + COMMIT
      with-audit.ts          ← logActivity(), llamado explícito, no wrapper
    alumnos/                ← Fase 1, completo
      crear-alumno.ts, editar-alumno.ts, cambiar-vinculo.ts
      consultas.ts          ← lecturas (*Query), también con withAuth
    gimnasio/consultas.ts   ← "hoy" en la TZ del gimnasio, para la UI
    pagos/, bajas/, atencion/, config/   ← Fase 2+

  data/
    schema/                 ← las 10 tablas (Drizzle) — ÚNICA fuente de verdad del modelo
    repositories/           ← reciben (tx, ctx, ...) — nunca gymId suelto
    db.ts                   ← conexión lazy, rol fn_app

  lib/
    auth/                   ← Supabase Auth aislado acá. Único módulo que
                               construye un AuthContext (context.ts).
    security/               ← headers.ts (CSP + headers de seguridad)
    format/, errors/        ← Fase 1+

  schemas/                  ← Zod, compartido cliente/servidor (forma, no invariantes de negocio)
  components/
    ui/                     ← shadcn (no tocar a mano — `npx shadcn add`)
    features/alumnos/       ← Fase 1: badge de estado, filtros, formulario,
                               cambio de estado

db/
  migrations/               ← SQL generado por drizzle-kit (esquema)
  migrations/infra/         ← SQL escrito a mano (roles, extensiones, RLS, triggers)
                               00_ corre antes del esquema, 01_ después
scripts/db/
  migrate.ts                ← aplica las 3 capas en orden, contra DATABASE_URL_OWNER
  seed.ts                   ← datos de desarrollo CLARAMENTE ficticios

tests/
  domain/                   ← unit, sin DB
  validation/               ← los schemas de Zod, sin DB
  integration/              ← contra Postgres real (se salta sin DATABASE_URL)
  security/                 ← headers, secrets, withAuth-wrapping, dev-mock-auth
  architecture/             ← límites de dependencias
  e2e/                      ← Playwright, ejecutable desde Fase 1 (ver el
                               encabezado de alumnos.spec.ts)
```

## El patrón de un caso de uso (referencia: `src/use-cases/alumnos/crear-alumno.ts`)

```
Zod (parseInput)
   ↓ si falla → Result VALIDATION, nada se escribe
withAuth(roles, handler)
   ↓ sesión + AAL + rol — si falla → Result FORBIDDEN
withTenantTx(ctx, fn)
   ↓ abre transacción, fija app.gym_id/app.user_id/app.role
repositorio (tx, ctx, ...)
   ↓ INSERT/UPDATE con gym_id explícito (defensa en profundidad sobre RLS)
logActivity(tx, ctx, entry)
   ↓ misma transacción — atomicidad real, no por convención
ok(data)  ← o CONFLICT/NOT_FOUND/CONFIRMACION_REQUERIDA
```

`CONFIRMACION_REQUERIDA` es el mecanismo que resuelve, con un solo
patrón, tres casos de la SPEC: cambio de plan durante un pago, pago
duplicado del mismo período, y alumno posiblemente duplicado en el alta.
El caso de uso devuelve la propuesta de confirmación **sin escribir
nada**; una segunda llamada, con la decisión explícita del usuario,
completa la operación.

## Camino a NEXA GYM OS

Ya está preparado, sin construir todavía la parte multi-gimnasio operativa:

- `gym_id` en las 10 tablas desde la primera migración.
- `AuthContext` con `gymId` obligatorio, construible solo por
  `getAuthContext()` — no hay forma de que un caso de uso "olvide"
  filtrar por tenant, porque no puede inventar un `gymId`.
- Reglas parametrizadas en `gym_settings`, no hardcodeadas.
- RLS con `FORCE` como defensa en profundidad — sostiene el aislamiento
  aunque un bug de programación olvide filtrar explícitamente.

Lo que falta cuando exista un segundo gimnasio real (no antes): onboarding,
selector de tenant para operadores de NEXA, facturación. Ver SPEC V1 §18.4.

## Cómo se agrega una operación de negocio (el patrón de Fase 1)

Los tres casos de uso de alumnos siguen exactamente la misma forma, y
cualquiera nuevo debería seguirla:

1. **Dominio** (`src/domain/`): una función pura decide *qué* debe pasar.
   Recibe el estado actual y `hoy` como parámetro; devuelve el conjunto
   COMPLETO de campos resultantes o un motivo de rechazo tipado. No toca
   la base, no lee el reloj, no conoce Next.
2. **Schema** (`src/schemas/`): Zod valida la *forma* del input. Nada de
   invariantes de negocio acá.
3. **Caso de uso** (`src/use-cases/`): `withAuth` → `parseInput` →
   `withTenantTx` → llama al dominio → repositorio → `student_events` +
   `logActivity` → `Result`. Todo en una transacción.
4. **Repositorio** (`src/data/repositories/`): recibe `(tx, ctx, …)`,
   filtra por `gym_id` explícito además de RLS. Nunca borra.
5. **Server Action** (`src/app/.../actions.ts`): traduce `FormData` a
   input y `Result` a algo que el formulario pueda mostrar. Sin lógica.
6. **UI**: Server Component para leer, Client Component solo donde hace
   falta interacción.

La razón de que el paso 1 esté separado es concreta: la matriz completa de
transiciones de estado se testea en milisegundos y sin Postgres
(`tests/domain/alumnos/cambio-de-vinculo.test.ts`), y los tests de
integración quedan libres para verificar lo que solo la base puede
verificar (RLS, CHECKs, triggers).

## Dos registros distintos, a propósito

- `activity_log` — **auditoría técnica**. Append-only en cuatro capas, con
  snapshot del actor. Se escribe siempre. Se audita, no se lee a diario.
- `student_events` — **historial de negocio**. Tipado y curado, es lo que
  se muestra en la ficha del alumno.

No es duplicación: tienen distinto público, distinta retención y distinto
formato. Un cambio de estado escribe en los dos, dentro de la misma
transacción.

## El modelo de pagos, y por qué está armado así

Escrito antes de implementar Fase 2, a partir de las reglas confirmadas
por el dueño (`docs/REGLAS-DE-NEGOCIO.md`). El esquema ya lo soporta;
falta el caso de uso.

```
plans                      ← el PLAN HABITUAL del alumno
  acceso                     DIAS_FIJOS | LIBRE
  precio_actual              nullable = "todavía no confirmado"

gym_settings
  precio_medio_mes           el precio de "1/2 MES", nullable

payments                   ← QUÉ se cobró
  modalidad                  MES_COMPLETO | MEDIO_MES
  plan_id + plan_*_snapshot  el plan habitual EN ESE MOMENTO
  monto                      snapshot inmutable

payment_periods            ← QUÉ cubre
  periodo                    día 1 del mes imputado (WHERE indexado)
  cubre_desde / cubre_hasta  el rango real
```

Tres separaciones que no son casuales:

1. **El plan del alumno ≠ lo que pagó.** Un alumno de 5 días puede pagar
   un medio mes sin que su plan cambie. Por eso `modalidad` vive en
   `payments` y no toca `students.plan_id`.
2. **"1/2 MES" no es un plan.** Su precio está en `gym_settings`, no en
   `plans`, porque `students.plan_id` referencia `plans` — una fila ahí
   sería asignable como plan habitual de una persona. La regla es
   estructural, no una convención.
3. **El período cubierto tiene fechas reales.** `periodo` solo (día 1 del
   mes) no podía representar 15 días que empiezan cualquier día; se
   conserva porque hace que "¿quién tiene cubierto septiembre?" siga
   siendo un WHERE indexado.

Nada de esto es "último pago + 30 días", y ningún cálculo histórico usa
`plans.precio_actual`.
