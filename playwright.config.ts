import { defineConfig, devices } from "@playwright/test";

// Desde Fase 1 esto SÍ se ejecuta. Fase 0 lo dejó como configuración sin
// specs porque suponía que hacía falta un Supabase real; no hace falta: la
// sesión simulada de desarrollo (src/lib/auth/config.ts, solo activa fuera
// de producción y sin Supabase configurado) alcanza para recorrer el
// módulo entero en un navegador real.
//
// Requiere Postgres local migrado + `npm run db:seed`. Ver el encabezado de
// tests/e2e/alumnos.spec.ts y docs/RUNBOOK.md.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // El arranque en frío de `next dev` compilando por primera vez pasa
    // holgadamente los 60s por defecto en Windows.
    timeout: 180_000,
  },
});
