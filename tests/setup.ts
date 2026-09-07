import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

// Los tests de integración necesitan DATABASE_URL. `vitest` no carga
// .env.local automáticamente para código de servidor (a diferencia de
// Vite en el cliente) — lo hacemos explícito acá.
const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) config({ path: envLocal, quiet: true });
