import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import postgres from "postgres";
import { leerArgumentos } from "./_compartido";
import { binario } from "./postgres-descartable";

/**
 * BACKUP CIFRADO de los datos del gimnasio, fuera de Supabase.
 *
 *   npx tsx scripts/db/produccion.ts scripts/db/backup.ts \
 *     --salida "C:/Users/<usuario>/FuerzaNatural-Backups" [--gym <uuid>] [--variable DATABASE_URL_BACKUP]
 *
 * Arma UN archivo SQL restaurable con psql, en tres partes:
 *   1. Esquema (pg_dump --section=pre-data) de `app` y `drizzle`: tablas,
 *      funciones, tipos. No lee filas.
 *   2. Datos: cada tabla como JSON (`json_agg`), restaurable con
 *      `json_populate_recordset`, todas en UNA transacción REPEATABLE READ
 *      de solo lectura (una foto consistente), con el gimnasio fijado con
 *      set_config — igual que la app. Por eso sirve con fn_owner pese a
 *      FORCE RLS. (El primer intento usaba pg_dump con PGOPTIONS, y el
 *      pooler de Supabase ignora ese parámetro: las tablas salían vacías.
 *      El simulacro lo detectó.) Más los valores de las secuencias y una
 *      huella MD5 del contenido de cada tabla.
 *   3. pg_dump --section=post-data: índices, claves foráneas, RLS,
 *      policies, triggers.
 * Lo cifra con gpg (AES-256) y borra lo que quedó sin cifrar. Al lado deja
 * `…conteos.json`: filas por tabla (de la misma foto) y SHA-256 del archivo
 * cifrado, sin datos personales. El simulacro de restauración
 * (scripts/db/simulacro-restauracion.ts) compara contra eso.
 *
 * No incluye `auth`: los usuarios y contraseñas los guarda Supabase Auth.
 * La conexión sale de `--variable` (por defecto DATABASE_URL_BACKUP; si no
 * existe, DATABASE_URL_OWNER). Con fn_owner hace falta `--gym`. La URL
 * nunca se imprime ni va en la línea de comandos de pg_dump. La frase de
 * gpg la pide gpg, o sale del archivo GPG_PASSPHRASE_FILE.
 */

const RAIZ = resolve(__dirname, "..", "..");
const ESQUEMAS = ["app", "drizzle"];

function entornoDeConexion(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, "") || "postgres",
    PGSSLMODE: u.hostname === "127.0.0.1" || u.hostname === "localhost" ? "disable" : "require",
  };
}

function pgDump(env: NodeJS.ProcessEnv, seccion: "pre-data" | "post-data", archivo: string): void {
  const r = spawnSync(
    binario("pg_dump"),
    ["--format=plain", `--section=${seccion}`, ...ESQUEMAS.map((e) => `--schema=${e}`), "--file", archivo],
    { env, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`pg_dump (${seccion}) falló:\n${r.stderr.replace(/password[^\n]*/gi, "password=<oculto>")}`);
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

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
  const pre = `${base}.pre.sql`;
  const datos = `${base}.datos.sql`;
  const post = `${base}.post.sql`;
  const sqlPlano = `${base}.sql`;
  const cifrado = `${sqlPlano}.gpg`;
  const temporales = [pre, datos, post, sqlPlano];

  try {
    // 1. Esquema, antes de los datos.
    const env = entornoDeConexion(url);
    pgDump(env, "pre-data", pre);

    // 2. Datos y conteos, en una sola foto consistente.
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
    let conteos: Record<string, number> = {};
    const huellas: Record<string, string> = {};
    try {
      conteos = await sql.begin("isolation level repeatable read read only", async (tx) => {
        if (gym) await tx`select set_config('app.gym_id', ${gym}, true)`;
        // Fechas en UTC: la huella del contenido tiene que salir igual al restaurar.
        await tx`select set_config('TimeZone', 'UTC', true)`;
        const tablas = await tx<{ esquema: string; tabla: string; columnas: string[] }[]>`
          select n.nspname as esquema, c.relname as tabla,
                 array_agg(a.attname::text order by a.attnum) as columnas
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
          where n.nspname = any(${ESQUEMAS}) and c.relkind in ('r', 'p')
          group by 1, 2 order by 1, 2`;
        // Cada tabla sale como un JSON (json_agg) y se restaura con
        // json_populate_recordset, que convierte cada tipo (fechas, arrays,
        // numéricos, jsonb) sin código propio. Primero se probó con COPY TO
        // STDOUT de postgres.js, y la consulta que seguía a un COPY grande
        // no volvía nunca.
        const marca = `$fz_${randomBytes(8).toString("hex")}$`;
        writeFileSync(datos, "");
        const resultado: Record<string, number> = {};
        for (const { esquema, tabla, columnas } of tablas) {
          const nombre = `${ident(esquema)}.${ident(tabla)}`;
          const cols = columnas.map(ident).join(", ");
          const [fila] = await tx.unsafe<{ n: number; json: string }[]>(
            `select count(*)::int as n, coalesce(json_agg(t), '[]'::json)::text as json from (select ${cols} from ${nombre}) t`,
          );
          if (esquema === "app") {
            resultado[tabla] = fila.n;
            const [h] = await tx.unsafe<{ h: string }[]>(
              `select md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"), '')) as h from (select * from ${nombre}) t`,
            );
            huellas[tabla] = h.h;
          }
          if (fila.json.includes(marca)) throw new Error("La marca de delimitación apareció en los datos; volver a correr.");
          if (fila.n > 0) {
            appendFileSync(
              datos,
              `\nINSERT INTO ${nombre} (${cols})\nSELECT ${cols} FROM json_populate_recordset(null::${nombre}, ${marca}${fila.json}${marca});\n`,
            );
          }
          process.stderr.write(`  · ${esquema}.${tabla}: ${fila.n} filas\n`);
        }
        const secuencias = await tx<{ nombre: string; valor: string | null }[]>`
          select quote_ident(schemaname) || '.' || quote_ident(sequencename) as nombre, last_value::text as valor
          from pg_sequences where schemaname = any(${ESQUEMAS})`;
        for (const s of secuencias) {
          if (s.valor !== null) appendFileSync(datos, `\nSELECT pg_catalog.setval('${s.nombre}', ${s.valor}, true);\n`);
        }
        return resultado;
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
    console.log(`Conteos: ${Object.entries(conteos).map(([t, n]) => `${t}=${n}`).join(" · ")}`);

    // 3. Índices, claves, RLS, policies, triggers, después de los datos.
    pgDump(env, "post-data", post);

    writeFileSync(
      sqlPlano,
      [
        `-- Backup de Fuerza Natural (${new Date().toISOString()}). Esquemas: ${ESQUEMAS.join(", ")}.`,
        "-- Restaurar con: psql -v ON_ERROR_STOP=1 -f <archivo> (ver scripts/db/simulacro-restauracion.ts)",
        readFileSync(pre, "utf8"),
        "-- ===== DATOS =====",
        readFileSync(datos, "utf8"),
        "-- ===== POST-DATA =====",
        readFileSync(post, "utf8"),
      ].join("\n"),
    );

    // 4. Cifrado. Sin GPG_PASSPHRASE_FILE, gpg pide la frase en la terminal.
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
        sqlPlano,
      ],
      { stdio: archivoClave ? "pipe" : "inherit" },
    );
    if (cifrar.status !== 0 || !existsSync(cifrado)) throw new Error("gpg no pudo cifrar el backup.");

    const sha256 = createHash("sha256").update(readFileSync(cifrado)).digest("hex");
    writeFileSync(
      `${base}.conteos.json`,
      JSON.stringify({ fecha: new Date().toISOString(), formato: "sql", esquemas: ESQUEMAS, conteos, huellas, sha256 }, null, 2),
    );
    console.log(`✓ Backup cifrado: ${cifrado}`);
    console.log(`  Conteos y huella: ${base}.conteos.json`);
  } finally {
    // Nada sin cifrar queda en disco, salga bien o mal.
    for (const t of temporales) if (existsSync(t)) unlinkSync(t);
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message.replace(/:\/\/[^@\s]*@/g, "://***@")}`);
  process.exit(1);
});
