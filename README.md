# Fuerza Natural

Sistema administrativo interno para el gimnasio Fuerza Natural — primera
implementación real de lo que eventualmente será **NEXA GYM OS**.

Estado: **Fase 1 completa** (módulo de Alumnos). Fase 0 fue la fundación
técnica; Fase 1 es el primer módulo de negocio real. Todavía NO hay pagos
(Fase 2), workflow de bajas (Fase 3), dashboard (Fase 4) ni migración de
los datos reales (Fase 5). Ver `docs/` para el estado exacto de cada
decisión.

## Qué hace hoy

Un registro central por persona: listar, buscar (sin acentos, tolerante al
orden de nombre/apellido), filtrar por estado, dar de alta, ver la ficha,
editar los datos y cambiar el estado del vínculo. Cada cambio relevante
queda en el historial del alumno y en la auditoría.

Tres estados de la **relación con el gimnasio** — `ACTIVO`, `PAUSADO`,
`BAJA` — y ninguno más. La **situación de pago** (moroso, vencido) no
existe como estado guardado y no va a existir: se deriva de los pagos en
Fase 2. Una BAJA nunca borra al alumno.

Los planes son cinco (2, 3, 4, 5 días y LIBRE) y sus precios son **datos
del gimnasio**, no constantes del código — un test de arquitectura falla
si algún importe aparece en `src/`. "1/2 MES" NO es un plan: es una
modalidad de cobertura de un pago puntual, y por eso ni siquiera existe
como fila en `plans`. Ver `docs/REGLAS-DE-NEGOCIO.md`.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 + shadcn/ui ·
Drizzle ORM · PostgreSQL (Supabase en producción) · Supabase Auth (MFA) ·
Zod · Vitest · Playwright.

## Requisitos

- Node.js 24+
- Una instancia de PostgreSQL 17 alcanzable (local o Supabase). **No usa
  Docker** — ver `docs/RUNBOOK.md` para levantar una local con `winget`.
- Un proyecto Supabase real (opcional para desarrollar el shell/backend;
  necesario para que el login funcione de verdad — ver
  `docs/RUNBOOK.md` "Bootstrap en Supabase").

## Setup

```bash
npm install
cp .env.example .env.local   # completar DATABASE_URL / DATABASE_URL_OWNER
                              # (y NEXT_PUBLIC_SUPABASE_* si hay proyecto real)
npm run db:migrate            # aplica extensiones/roles + esquema + RLS
npm run db:seed               # datos de desarrollo ficticios (opcional)
npm run dev
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — unit + integración (los de integración se saltan sin `DATABASE_URL`) |
| `npm run test:coverage` | Vitest con cobertura (exigida alta en `src/domain/`) |
| `npm run test:e2e` | Playwright — recorrido completo de Alumnos en Chromium (requiere `db:seed`) |
| `npm run db:generate` | Genera una migración SQL a partir de `src/data/schema/` |
| `npm run db:migrate` | Aplica las 3 capas de la base (ver `docs/ARCHITECTURE.md`) |
| `npm run db:seed` | Datos de desarrollo — nunca datos reales del gimnasio |
| `npm run verify` | typecheck + lint + test + build, en ese orden |

## Documentación

- `docs/REGLAS-DE-NEGOCIO.md` — **las reglas confirmadas por el dueño**. Fuente de
  verdad del negocio: si el código y ese archivo discrepan, el que está mal es el código.
- `docs/ARCHITECTURE.md` — capas, estructura de carpetas, el patrón de un caso de uso.
- `docs/SECURITY.md` — RLS, roles de Postgres, y los ajustes que la implementación real exigió sobre el diseño.
- `docs/DECISIONES.md` — registro de decisiones técnicas (ADR).
- `docs/RUNBOOK.md` — cómo levantar la base local, bootstrap de Supabase, recuperación de cuenta, backups.

## Variables de entorno

Ver `.env.example` — cada variable tiene un comentario explicando para
qué es y por qué existe (o por qué deliberadamente NO existe, como la
service role key de Supabase, que nunca vive en esta aplicación).

## Principios que gobiernan este código

1. **El sistema detecta. El dueño decide.** Ninguna transición de estado
   de un alumno ocurre automáticamente.
2. **`gymId` nunca viene del cliente.** Sale exclusivamente de
   `getAuthContext()`, construido a partir de la sesión validada.
3. **RLS falla cerrado.** Sin contexto de tenant seteado, toda consulta
   devuelve cero filas — nunca todas.
4. **`payments` y `activity_log` son inmutables** salvo el mecanismo
   explícito de anulación. Corregir un dato es anular + volver a
   registrar, nunca `UPDATE`.
5. **El dominio (`src/domain/`) no ve una hora ni toca la base.** Dos
   clases enteras de bug eliminadas por construcción.
6. **Una persona = un registro.** El identificador es el `id`, nunca
   nombre+apellido: el Data Discovery mostró que los nombres no
   identifican a nadie de forma confiable.
