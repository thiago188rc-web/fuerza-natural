# HANDOFF: Gimnasio Fuerza Natural (NEXA GYM OS)

Guía completa para colaboradores y traspaso de desarrollo con **Antigravity**.

---

## 1. Resumen Ejecutivo y Arquitectura

**Fuerza Natural** es el sistema administrativo y operativo para la gestión integral del gimnasio Fuerza Natural, construido sobre principios estrictos de seguridad, aislamiento multi-tenant y arquitectura hexagonal.

### Principios Fundamentales del Sistema
1. **El sistema detecta, el dueño decide:** Ninguna transición de estado de alumnos o planes ocurre automáticamente sin confirmación explícita.
2. **Identidad y Tenant Seguros:** `gymId` nunca se recibe del cliente; se infiere estrictamente del contexto de autenticación verificado (`getAuthContext()`).
3. **Seguridad en Capas (RLS Fails Closed):** Las políticas de Row Level Security en PostgreSQL fallan cerrado. Sin contexto de tenant seteado en la sesión de base de datos (`set_config`), cualquier consulta devuelve 0 filas.
4. **Dominio Puro:** `src/domain/` contiene lógica de negocio pura (validación de estados, fechas de vencimiento, cálculos), sin interacción directa con base de datos ni UI.
5. **Separación de Roles de Base de Datos:**
   - `fn_owner`: Rol con permisos DDL para aplicar migraciones y esquemas (`npm run db:migrate`).
   - `fn_app`: Rol de runtime usado por la aplicación para servir tráfico (sin permisos para dropear tablas ni eludir RLS).

### Stack Tecnológico
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript (Strict mode).
- **Estilos:** Tailwind CSS v4 + componentes shadcn/ui.
- **Base de Datos & ORM:** PostgreSQL 17 + Drizzle ORM.
- **Autenticación:** Supabase Auth (con bypass mock seguro exclusivo para entorno local/desarrollo).
- **Testing:** Vitest (unitarios, arquitectura y dominio) + Playwright (pruebas E2E).

---

## 2. Requisitos Previos

- **Node.js:** Versión 24 o superior recomendada.
- **npm:** Gestor de paquetes oficial (el proyecto incluye `package-lock.json`).
- **PostgreSQL 17:** Instancia accesible localmente (por ejemplo, vía `winget install PostgreSQL.PostgreSQL.17` o servicio local en el puerto 5432).
- **Antigravity IDE:** IDE configurado con soporte para TypeScript y Node.js.

---

## 3. Puesta en Marcha Rápida (Paso a Paso)

### 3.1. Clonar el repositorio y abrir en Antigravity
```bash
git clone <URL_DEL_REPOSITORIO_PRIVADO>
cd "gym fz system"
```
Abre la carpeta en Antigravity IDE.

### 3.2. Instalar dependencias reproducibles
Instala exactamente las versiones fijadas en el lockfile:
```bash
npm ci
```

### 3.3. Configurar variables de entorno locales
Copia el archivo de ejemplo para crear tu entorno local:
```bash
cp .env.example .env.local
```
Edita `.env.local`:
- Define `DATABASE_URL` y `DATABASE_URL_OWNER` apuntando a tu PostgreSQL local.
- **Nota sobre Supabase en desarrollo:** No es obligatorio crear un proyecto de Supabase para desarrollar. Si dejas las variables `NEXT_PUBLIC_SUPABASE_*` vacías y `NODE_ENV="development"`, el sistema activará automáticamente el modo de autenticación simulada (`isDevMockAuthEnabled`), permitiéndote navegar todas las pantallas como usuario dueño/demo sin dependencias externas.

### 3.4. Ejecutar migraciones y datos de prueba
Aplica el esquema y carga datos sintéticos de prueba:
```bash
# 1. Aplicar extensiones, roles, esquemas y políticas RLS locales
npm run db:migrate

# 2. Cargar datos de prueba de desarrollo (alumnos ficticios, planes)
npm run db:seed
```

### 3.5. Iniciar la aplicación
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## 4. Verificación y Suite de Pruebas

Para garantizar que el entorno local funciona correctamente:

| Comando | Propósito |
|---|---|
| `npm run typecheck` | Comprobación estricta de tipos de TypeScript (`tsc --noEmit`). |
| `npm run lint` | Análisis estático con ESLint. |
| `npm test` | Ejecuta la suite de Vitest (340+ tests unitarios, arquitectura y dominio). |
| `npm run test:aislado` | Ejecuta tests de integración con base de datos PostgreSQL descartable efímera. |
| `npm run verify` | Flujo de verificación completa: typecheck + lint + test:aislado + build. |

---

## 5. Variables de Entorno (Referencia por Nombre)

Todas las variables requeridas están documentadas en [.env.example](file:///c:/Users/Thiago/OneDrive/Desktop/gym%20fz%20system/.env.example):

- `DATABASE_URL`: Cadena de conexión para el rol de aplicación (`fn_app`).
- `DATABASE_URL_OWNER`: Cadena de conexión administrativa para migraciones (`fn_owner`).
- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto de Supabase (opcional en dev con mock auth).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Llave pública anónima de Supabase (opcional en dev con mock auth).
- `NODE_ENV`: Entorno de ejecución (`development` en local).
- `APP_URL`: URL base de la aplicación para enlaces por email (opcional en local).

> [!CAUTION]
> **Políticas de Seguridad de Credenciales:**
> - Nunca compartas credenciales ni tokens de producción.
> - La service role key de Supabase **no existe** en esta aplicación por diseño (arquitectura de privilegio mínimo).
> - Las credenciales de producción se gestionan fuera del repositorio (`~/.fuerza-natural/produccion.env`), nunca en variables locales ni versionadas.

---

## 6. Estado Actual del Proyecto y Próximas Tareas

### Lo que está listo y probado:
- **Fase 1 (Módulo de Alumnos):**
  - Registro centralizado de personas.
  - Búsqueda tolerante y normalizada (sin acentos, tolerante al orden).
  - Estados de relación con el gimnasio: `ACTIVO`, `PAUSADO`, `BAJA`.
  - Historial de cambios y auditoría inmutable.
  - Gestión de 5 planes de membresía basados en base de datos.
  - Lector y validador de importación de planillas de alumnos y pagos por lotes.
  - Control de accesos y RLS completo.

### Pendientes y Próximos Hitos:
1. **Fase 2 (Pagos y Caja):**
   - Consolidación del flujo de caja diario.
   - Estados de vencimiento derivados de pagos reales.
   - Emisión y registro de comprobantes de pago.
2. **Fase 3 (Workflow de Bajas y Rol Staff):**
   - Proceso guiado de retención y registro formal de bajas.
   - Incorporación operativa del rol `STAFF` con permisos restringidos.
3. **MFA TOTP:**
   - Implementar el enrolamiento TOTP definitivo vía `supabase.auth.mfa.enroll` (actualmente `requiresAal2()` devuelve `false` para permitir acceso directo con contraseña al dueño).
4. **Fase 4 & 5 (Métricas y Migración):**
   - Dashboard analítico consolidado.
   - Migración final de planillas históricas con los scripts de carga por lotes.
