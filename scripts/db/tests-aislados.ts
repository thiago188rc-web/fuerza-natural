import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { levantarPostgresDescartable } from "./postgres-descartable";

/**
 * `npm run test:aislado` — la suite completa contra un Postgres DESCARTABLE.
 *
 * Levanta un cluster nuevo (ver postgres-descartable.ts), aplica las tres
 * capas de migración, corre vitest con `DATABASE_URL` como fn_app
 * (NOBYPASSRLS: RLS se aplica de verdad) y al final apaga el cluster y
 * borra la carpeta, falle lo que falle.
 *
 * No lee `.env.local` ni `~/.fuerza-natural/produccion.env`: la única base que toca es
 * la que crea. Los argumentos extra pasan a vitest:
 * `npm run test:aislado -- tests/integration`.
 */

const RAIZ = resolve(__dirname, "..", "..");

function correr(comando: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((ok) => {
    const hijo = spawn(comando, args, { cwd: RAIZ, env, stdio: "inherit" });
    hijo.on("exit", (codigo) => ok(codigo ?? 1));
    hijo.on("error", () => ok(1));
  });
}

async function main(): Promise<number> {
  const pg = await levantarPostgresDescartable("fz_tests");
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: pg.url("fn_app"),
      DATABASE_URL_OWNER: pg.url("fn_owner"),
    };
    const tsx = join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
    const vitest = join(RAIZ, "node_modules", "vitest", "vitest.mjs");

    console.log(`\n→ Postgres descartable en 127.0.0.1:${pg.puerto}. Migrando…`);
    const migracion = await correr(process.execPath, [tsx, "scripts/db/migrate.ts"], env);
    if (migracion !== 0) throw new Error("La migración de la base descartable falló.");

    console.log("→ Corriendo la suite (rol fn_app, RLS activo)…\n");
    return await correr(process.execPath, [vitest, "run", ...process.argv.slice(2)], env);
  } finally {
    await pg.apagar();
    console.log("\n→ Base descartable apagada y borrada.");
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  },
);
