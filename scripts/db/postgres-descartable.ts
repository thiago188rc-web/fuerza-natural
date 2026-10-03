import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import postgres from "postgres";

/**
 * Un Postgres DESCARTABLE: cluster nuevo en una carpeta temporal, en un
 * puerto libre, solo en 127.0.0.1, con los tres roles del sistema
 * (fn_owner, fn_app, fn_readonly) y una base vacía con el locale de
 * producción. Lo usan `npm run test:aislado` y el simulacro de
 * restauración: ninguno de los dos toca otra base que la que crea.
 *
 * Necesita los binarios de PostgreSQL 15 o más nuevo (initdb, postgres,
 * pg_ctl, pg_restore…): los busca en PG_BIN, en el PATH y en la ruta de
 * instalación por defecto de Windows.
 */

const EXE = process.platform === "win32" ? ".exe" : "";

export function binariosDePostgres(): string {
  const candidatos = [
    process.env.PG_BIN,
    ...(process.env.PATH ?? "").split(delimiter),
    "C:/Program Files/PostgreSQL/17/bin",
    "C:/Program Files/PostgreSQL/16/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
  ].filter((c): c is string => Boolean(c));
  for (const dir of candidatos) {
    if (existsSync(join(dir, `initdb${EXE}`)) && existsSync(join(dir, `postgres${EXE}`))) return dir;
  }
  throw new Error("No encontré initdb/postgres. Instalá PostgreSQL o definí PG_BIN con la carpeta bin.");
}

export function binario(nombre: string): string {
  return join(binariosDePostgres(), `${nombre}${EXE}`);
}

function puertoLibre(): Promise<number> {
  return new Promise((ok, falla) => {
    const srv = createServer();
    srv.once("error", falla);
    srv.listen(0, "127.0.0.1", () => {
      const direccion = srv.address();
      const puerto = typeof direccion === "object" && direccion ? direccion.port : 0;
      srv.close(() => ok(puerto));
    });
  });
}

async function esperarConexion(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end();
      return;
    } catch {
      await sql.end({ timeout: 1 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("El Postgres temporal no aceptó conexiones en 30 segundos.");
}

export interface PostgresDescartable {
  puerto: number;
  /** URL sin contraseña (el cluster usa trust y solo escucha en 127.0.0.1). */
  url(usuario: string, base?: string): string;
  apagar(): Promise<void>;
}

/** Levanta el cluster con la base `nombreBase` lista para migrar. */
export async function levantarPostgresDescartable(nombreBase: string): Promise<PostgresDescartable> {
  const dir = mkdtempSync(join(tmpdir(), "fz-pg-"));
  const datos = join(dir, "datos");
  const puerto = await puertoLibre();
  let servidor: ReturnType<typeof spawn> | null = null;

  const apagar = async () => {
    if (servidor) {
      spawnSync(binario("pg_ctl"), ["stop", "-D", datos, "-m", "immediate", "-w"], { stdio: "ignore" });
      if (servidor.exitCode === null) servidor.kill();
    }
    // Windows puede tardar en soltar los archivos del cluster recién apagado.
    for (let i = 0; i < 10 && existsSync(dir); i++) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (existsSync(dir)) console.warn(`No pude borrar ${dir}; borralo a mano.`);
  };

  try {
    const init = spawnSync(binario("initdb"), ["-D", datos, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], {
      encoding: "utf8",
    });
    if (init.status !== 0) throw new Error(`initdb falló:\n${init.stderr}`);

    const log = openSync(join(dir, "postgres.log"), "a");
    servidor = spawn(
      binario("postgres"),
      ["-D", datos, "-p", String(puerto), "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off"],
      { stdio: ["ignore", log, log] },
    );

    const url = (usuario: string, base = nombreBase) => `postgres://${usuario}@127.0.0.1:${puerto}/${base}`;
    await esperarConexion(url("postgres", "postgres"));

    const su = postgres(url("postgres", "postgres"), { max: 1, onnotice: () => {} });
    await su.unsafe(`
      CREATE ROLE fn_owner WITH LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE fn_app WITH LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE fn_readonly WITH LOGIN NOSUPERUSER NOBYPASSRLS;
    `);
    // El locale ICU es-AR es el de producción: la búsqueda sin acentos y el
    // orden alfabético dependen de él.
    await su.unsafe(
      `CREATE DATABASE ${nombreBase} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'es-AR' LOCALE 'C'`,
    );
    await su.unsafe(
      `GRANT CREATE ON DATABASE ${nombreBase} TO fn_owner; GRANT CONNECT ON DATABASE ${nombreBase} TO fn_app, fn_readonly;`,
    );
    await su.end();
    const suDb = postgres(url("postgres"), { max: 1, onnotice: () => {} });
    await suDb.unsafe(`GRANT CREATE ON SCHEMA public TO fn_owner;`);
    await suDb.end();

    return { puerto, url, apagar };
  } catch (err) {
    await apagar();
    throw err;
  }
}
