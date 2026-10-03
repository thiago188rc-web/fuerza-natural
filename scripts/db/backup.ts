import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import postgres from "postgres";
import { leerArgumentos } from "./_compartido";
import { binario } from "./postgres-descartable";

/**
 * BACKUP CIFRADO de los datos del gimnasio, fuera de Supabase.
 *
 *   npx tsx --env-file=.env.produccion.local scripts/db/backup.ts \
 *     --salida "D:/Backups/fuerza-natural" [--gym <uuid>] [--variable DATABASE_URL_BACKUP]
 *
 * Qué hace, en orden:
 *   1. Cuenta las filas de cada tabla de `app` (transacción de solo lectura).
 *   2. `pg_dump` en formato custom de los esquemas `app` (los datos) y
 *      `drizzle` (qué migraciones tiene aplicadas). No incluye `auth`: los
 *      usuarios y contraseñas los guarda Supabase Auth (ver RUNBOOK).
 *   3. Cifra el dump con gpg (AES-256, contraseña que pide gpg en la
 *      terminal; nunca pasa por este script ni por el chat) y borra el dump
 *      sin cifrar.
 *   4. Escribe al lado `…conteos.json`: fecha, conteo por tabla y SHA-256
 *      del archivo cifrado. Sin datos personales. Es lo que el simulacro de
 *      restauración compara (scripts/db/simulacro-restauracion.ts).
 *
 * La conexión sale de la variable `--variable` (por defecto
 * DATABASE_URL_BACKUP; si no existe, DATABASE_URL_OWNER). Con el rol
 * `postgres` de Supabase, que saltea RLS, alcanza. Con fn_owner hay que
 * pasar `--gym`: las tablas tienen FORCE RLS y el dump solo ve las filas
 * del gimnasio que se fija en la sesión.
 *
 * La URL nunca se imprime ni se pasa por la línea de comandos de pg_dump:
 * viaja en variables de entorno del proceso hijo.
 */

const RAIZ = resolve(__dirname, "..", "..");

function entornoDeConexion(url: string, gym: string | undefined): NodeJS.ProcessEnv {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, "") || "postgres",
    PGSSLMODE: u.hostname === "127.0.0.1" || u.hostname === "localhost" ? "disable" : "require",
    ...(gym ? { PGOPTIONS: `-c app.gym_id=${gym}` } : {}),
  };
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const salida = args.get("salida");
  const gym = args.get("gym");
  const variable = args.get("variable") ?? "DATABASE_URL_BACKUP";
  const url = process.env[variable] ?? process.env.DATABASE_URL_OWNER;
  if (!salida) throw new Error('Falta --salida "<carpeta fuera del repositorio>".');
  if (!url) throw new Error(`Falta la conexión: definí ${variable} (o DATABASE_URL_OWNER).`);
  if (gym && !/^[0-9a-f-]{36}$/i.test(gym)) throw new Error("--gym tiene que ser un UUID.");

  const carpeta = resolve(salida);
  const rel = relative(RAIZ, carpeta);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("La carpeta de salida no puede estar dentro del repositorio: el backup tiene datos personales.");
  }
  mkdirSync(carpeta, { recursive: true });

  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = join(carpeta, `fuerza-natural-${sello}`);
  const dump = `${base}.dump`;
  const cifrado = `${dump}.gpg`;

  // 1. Conteos, en la misma base y con el mismo contexto que verá pg_dump.
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
  let conteos: Record<string, number>;
  try {
    conteos = await sql.begin("read only", async (tx) => {
      if (gym) await tx`select set_config('app.gym_id', ${gym}, true)`;
      const tablas = await tx<{ tabla: string }[]>`
        select table_name as tabla from information_schema.tables
        where table_schema = 'app' and table_type = 'BASE TABLE' order by 1`;
      const resultado: Record<string, number> = {};
      for (const { tabla } of tablas) {
        const [fila] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from app."${tabla}"`);
        resultado[tabla] = fila.n;
      }
      return resultado;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log(`Conteos: ${Object.entries(conteos).map(([t, n]) => `${t}=${n}`).join(" · ")}`);

  // 2. pg_dump.
  const env = entornoDeConexion(url, gym);
  const volcado = spawnSync(
    binario("pg_dump"),
    ["--format=custom", "--schema=app", "--schema=drizzle", "--file", dump, ...(gym ? ["--enable-row-security"] : [])],
    { env, encoding: "utf8" },
  );
  if (volcado.status !== 0) {
    if (existsSync(dump)) unlinkSync(dump);
    throw new Error(`pg_dump falló:\n${volcado.stderr.replace(/password[^\n]*/gi, "password=<oculto>")}`);
  }

  // 3. Cifrado. Sin GPG_PASSPHRASE_FILE, gpg pide la contraseña en la terminal.
  const archivoClave = process.env.GPG_PASSPHRASE_FILE;
  const cifrar = spawnSync(
    "gpg",
    [
      "--no-symkey-cache",
      "--symmetric",
      "--cipher-algo",
      "AES256",
      ...(archivoClave ? ["--batch", "--pinentry-mode", "loopback", "--passphrase-file", archivoClave] : []),
      "--output",
      cifrado,
      dump,
    ],
    { stdio: archivoClave ? "pipe" : "inherit" },
  );
  unlinkSync(dump);
  if (cifrar.status !== 0 || !existsSync(cifrado)) throw new Error("gpg no pudo cifrar el backup: no quedó ningún archivo sin cifrar.");

  // 4. Conteos + huella del archivo cifrado.
  const sha256 = createHash("sha256").update(readFileSync(cifrado)).digest("hex");
  writeFileSync(
    `${base}.conteos.json`,
    JSON.stringify({ fecha: new Date().toISOString(), esquemas: ["app", "drizzle"], conteos, sha256 }, null, 2),
  );

  console.log(`✓ Backup cifrado: ${cifrado}`);
  console.log(`  Conteos y huella: ${base}.conteos.json`);
  console.log("  Guardá la contraseña de gpg en un gestor de contraseñas: sin ella, el backup no sirve.");
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
