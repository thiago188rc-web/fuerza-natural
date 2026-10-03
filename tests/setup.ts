import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { exigirBaseLocal } from "../scripts/db/destino";

// Los tests de integración necesitan DATABASE_URL, y escriben en esa base.
// Por eso NO se lee `.env.local` (la configuración de desarrollo, que llegó
// a apuntar a una producción): solo `.env.test.local`, y lo que venga del
// entorno — que es como lo pasa `npm run test:aislado`.
const envTest = resolve(process.cwd(), ".env.test.local");
if (existsSync(envTest)) config({ path: envTest, quiet: true });

// Si la base no es de esta máquina, la corrida entera falla antes de
// escribir nada. Sin DATABASE_URL, los tests de integración se saltan.
exigirBaseLocal(process.env.DATABASE_URL, "tests");
exigirBaseLocal(process.env.DATABASE_URL_OWNER, "tests");
