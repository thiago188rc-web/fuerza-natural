import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { leerArgumentos } from "./_compartido";
import { binario, levantarPostgresDescartable, type PostgresDescartable } from "./postgres-descartable";

/**
 * ENSAYO DE MIGRACIÓN sobre una copia de producción. Responde "¿qué le
 * pasa a los datos reales si corro `db:prod:migrate` ahora?" sin tocar
 * producción: se ensaya sobre la restauración de un backup.
 *
 *   npx tsx scripts/db/ensayo-de-migracion.ts \
 *     --backup "<carpeta>/fuerza-natural-<fecha>.sql.gpg" \
 *     --conteos "<carpeta>/fuerza-natural-<fecha>.conteos.json" \
 *     [--migraciones <otra carpeta db/migrations>]   # ensayar una variante
 *     [--aceptar-perdida students.disciplina]        # pérdida autorizada
 *     [--despues "<comando>"]                        # p. ej. recorrer la app
 *
 * 1. Verifica la huella del backup y lo restaura en un Postgres
 *    descartable (como el simulacro de restauración).
 * 2. Arma una base de referencia: otra descartable migrada desde cero con
 *    el repositorio hasta la última migración que tiene el backup, y
 *    compara esquema y capa de seguridad (RLS, policies, triggers,
 *    funciones, permisos). Si difieren, producción tiene algo que el
 *    repositorio no explica.
 * 3. Copia cada tabla de `app` a un esquema aparte y corre
 *    scripts/db/migrate.ts contra la copia, con fn_owner y las tres capas,
 *    igual que `db:prod:migrate`.
 * 4. Compara antes y después fila por fila y columna por columna: filas
 *    que aparecen o faltan, valores que cambian, columnas que se van con
 *    datos (pérdida) y columnas nuevas. Una columna que se va con datos
 *    falla el ensayo salvo que se la nombre en --aceptar-perdida.
 * 5. Pruebas funcionales con fn_app y el contexto del gimnasio, en una
 *    transacción que se revierte: los CHECK nuevos, que editar un alumno
 *    no toque otras columnas y que RLS siga aislando.
 * 6. --despues corre un comando con FZ_ENSAYO_URL_{APP,OWNER,RO,SU} en el
 *    entorno (URLs locales, sin contraseña) mientras la copia está viva.
 * 7. Apaga y borra todo, incluido el dump descifrado, salga bien o mal.
 *
 * No imprime datos personales: conteos, huellas y nombres de columnas.
 */

const RAIZ = resolve(__dirname, "..", "..");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

let fallas = 0;
function ok(condicion: boolean, texto: string) {
  console.log(`${condicion ? "  ✓" : "  ✗"} ${texto}`);
  if (!condicion) fallas++;
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

function restaurar(pg: PostgresDescartable, rutaBackup: string, tmp: string) {
  const dump = join(tmp, "backup.sql");
  const archivoClave = process.env.GPG_PASSPHRASE_FILE;
  const descifrar = spawnSync(
    "gpg",
    [
      "--no-symkey-cache",
      "--decrypt",
      ...(archivoClave ? ["--batch", "--pinentry-mode", "loopback", "--passphrase-file", archivoClave] : []),
      "--output",
      dump,
      rutaBackup,
    ],
    { stdio: archivoClave ? "pipe" : "inherit" },
  );
  if (descifrar.status !== 0 || !existsSync(dump)) throw new Error("gpg no pudo descifrar el backup (¿contraseña?).");
  const r = spawnSync(binario("psql"), ["-q", "-v", "ON_ERROR_STOP=1", "-d", pg.url("postgres"), "-f", dump], {
    encoding: "utf8",
  });
  rmSync(dump, { force: true });
  if (r.status !== 0) throw new Error(`La restauración falló:\n${r.stderr.slice(0, 2000)}`);
}

async function capa00(pg: PostgresDescartable) {
  const owner = postgres(pg.url("fn_owner"), { max: 1, onnotice: () => {} });
  await owner.unsafe(readFileSync(join(RAIZ, "db/migrations/infra/00_extensions_and_roles.sql"), "utf8"));
  await owner.end();
}

/** Copia `db/migrations` (o la variante) a una carpeta propia, con el journal cortado si hace falta. */
function carpetaDeMigraciones(origen: string, hastaWhen?: number): string {
  const destino = mkdtempSync(join(tmpdir(), "fz-mig-"));
  cpSync(origen, join(destino, "db", "migrations"), { recursive: true });
  if (hastaWhen !== undefined) {
    const ruta = join(destino, "db", "migrations", "meta", "_journal.json");
    const j = JSON.parse(readFileSync(ruta, "utf8")) as Journal;
    j.entries = j.entries.filter((e) => e.when <= hastaWhen);
    writeFileSync(ruta, JSON.stringify(j, null, 2));
  }
  return destino;
}

/** scripts/db/migrate.ts tal cual, con fn_owner de la base descartable y la carpeta elegida. */
function migrar(pg: PostgresDescartable, cwd: string): string {
  const tsx = join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
  const r = spawnSync(process.execPath, [tsx, join(RAIZ, "scripts", "db", "migrate.ts")], {
    cwd,
    env: { ...process.env, DATABASE_URL_OWNER: pg.url("fn_owner"), DATABASE_URL: pg.url("fn_app") },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`migrate.ts falló:\n${(r.stderr || r.stdout).slice(0, 3000)}`);
  return r.stdout;
}

const huella = (x: unknown) => createHash("md5").update(JSON.stringify(x)).digest("hex").slice(0, 12);

/** Esquema y capa de seguridad, sin datos: lo que tiene que ser igual entre producción y repositorio. */
async function estructura(sql: postgres.Sql) {
  const columnas = await sql<{ t: string; c: string; tipo: string; nulo: string; def: string | null }[]>`
    select table_name as t, column_name as c, data_type as tipo, is_nullable as nulo, column_default as def
    from information_schema.columns where table_schema = 'app' order by 1, 2`;
  const constraints = await sql<{ t: string; n: string; d: string }[]>`
    select c.relname as t, k.conname as n, pg_get_constraintdef(k.oid) as d from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'app' order by 1, 2`;
  const indices = await sql<{ i: string; d: string }[]>`
    select indexname as i, indexdef as d from pg_indexes where schemaname = 'app' order by 1`;
  const rls = await sql<{ tabla: string; rls: boolean; force: boolean }[]>`
    select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as force
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relkind = 'r' order by 1`;
  const policies = await sql<{ t: string; p: string; cmd: string; q: string | null; w: string | null }[]>`
    select tablename as t, policyname as p, cmd, qual as q, with_check as w from pg_policies where schemaname = 'app' order by 1,2`;
  const triggers = await sql<{ t: string; g: string; d: string }[]>`
    select c.relname as t, tg.tgname as g, pg_get_triggerdef(tg.oid) as d from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and not tg.tgisinternal order by 1,2`;
  const funciones = await sql<{ f: string; src: string; def: boolean; sp: string | null }[]>`
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f,
           p.prosrc as src, p.prosecdef as def, array_to_string(p.proconfig, ',') as sp
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app') or (n.nspname = 'public' and p.proname = 'immutable_unaccent') order by 1`;
  const permisos = await sql<{ g: string }[]>`
    select grantee || ':' || table_name || ':' || string_agg(privilege_type, ',' order by privilege_type) as g
    from information_schema.role_table_grants where table_schema = 'app' and grantee in ('fn_app','fn_readonly')
    group by grantee, table_name order by 1`;
  return {
    columnas,
    constraints,
    indices,
    seguridad: {
      rls,
      policies,
      triggers,
      funciones: funciones.map((f) => ({ f: f.f, h: huella(f.src), def: f.def, sp: f.sp })),
      permisos,
    },
  };
}

type Estructura = Awaited<ReturnType<typeof estructura>>;

function diferencias<T>(a: T[], b: T[]): { soloA: T[]; soloB: T[] } {
  const ka = new Set(a.map((x) => JSON.stringify(x)));
  const kb = new Set(b.map((x) => JSON.stringify(x)));
  return { soloA: a.filter((x) => !kb.has(JSON.stringify(x))), soloB: b.filter((x) => !ka.has(JSON.stringify(x))) };
}

function compararEstructura(nombreA: string, a: Estructura, nombreB: string, b: Estructura) {
  const partes: [string, unknown[], unknown[]][] = [
    ["columnas", a.columnas, b.columnas],
    ["constraints", a.constraints, b.constraints],
    ["índices", a.indices, b.indices],
    ["RLS", a.seguridad.rls, b.seguridad.rls],
    ["policies", a.seguridad.policies, b.seguridad.policies],
    ["triggers", a.seguridad.triggers, b.seguridad.triggers],
    ["funciones", a.seguridad.funciones, b.seguridad.funciones],
    ["permisos", a.seguridad.permisos, b.seguridad.permisos],
  ];
  for (const [nombre, xa, xb] of partes) {
    const d = diferencias(xa, xb);
    // pg_dump escribe cada CHECK como texto y la restauración lo vuelve a
    // parsear: "(a AND b) AND c" vuelve como "a AND b AND c". Es la misma
    // condición; producción la tiene igual que el repositorio (verificado
    // el 2026-11-01). Solo se avisa si difieren ÚNICAMENTE en paréntesis.
    if (nombre === "constraints" && d.soloA.length && d.soloA.length === d.soloB.length) {
      const sinParentesis = (x: unknown) => {
        const c = x as { t: string; n: string; d: string };
        return `${c.t}.${c.n}:${c.d.replace(/[()]/g, "")}`;
      };
      const a2 = d.soloA.map(sinParentesis).sort();
      const b2 = d.soloB.map(sinParentesis).sort();
      if (a2.every((x, i) => x === b2[i])) {
        const nombres = d.soloA.map((x) => (x as { n: string }).n).join(", ");
        console.log(`  ✓ constraints: iguales (${xa.length}); ${nombres} difiere solo en paréntesis, por la restauración del backup`);
        continue;
      }
    }
    const igual = d.soloA.length === 0 && d.soloB.length === 0;
    ok(igual, `${nombre}: ${igual ? `iguales (${xa.length})` : `distintos — solo en ${nombreA}: ${JSON.stringify(d.soloA)} · solo en ${nombreB}: ${JSON.stringify(d.soloB)}`}`);
  }
}

async function tablasYClaves(sql: postgres.Sql, esquema: string) {
  return sql<{ tabla: string; pk: string[]; columnas: string[] }[]>`
    select c.relname as tabla,
           coalesce((select array_agg(a.attname::text order by a.attnum) from pg_index i
                     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                     where i.indrelid = c.oid and i.indisprimary), '{}') as pk,
           (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columnas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${esquema} and c.relkind = 'r' order by 1`;
}

async function main(): Promise<number> {
  const args = leerArgumentos(process.argv.slice(2));
  const rutaBackup = args.get("backup");
  const rutaConteos = args.get("conteos");
  if (!rutaBackup || !rutaConteos) throw new Error("Uso: --backup <archivo .sql.gpg> --conteos <archivo .conteos.json>");
  const carpetaMigraciones = resolve(args.get("migraciones") ?? join(RAIZ, "db", "migrations"));
  const aceptadas = new Set((args.get("aceptar-perdida") ?? "").split(",").filter(Boolean));
  const despues = args.get("despues");

  const esperado = JSON.parse(readFileSync(rutaConteos, "utf8")) as { conteos: Record<string, number>; sha256: string };
  const sha = createHash("sha256").update(readFileSync(rutaBackup)).digest("hex");
  if (sha !== esperado.sha256) throw new Error("La huella del backup no coincide con la del JSON.");
  const journal = JSON.parse(readFileSync(join(carpetaMigraciones, "meta", "_journal.json"), "utf8")) as Journal;
  console.log(`Backup: huella verificada. Migraciones: ${carpetaMigraciones}`);

  const inicio = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "fz-ensayo-"));
  const carpetas: string[] = [];
  let copia: PostgresDescartable | null = null;
  let referencia: PostgresDescartable | null = null;
  try {
    // ── 1. Copia de producción ───────────────────────────────────────────
    copia = await levantarPostgresDescartable("fz_copia");
    await capa00(copia);
    restaurar(copia, rutaBackup, tmp);
    const su = postgres(copia.url("postgres"), { max: 1, onnotice: () => {} });
    try {
      console.log("\n1. Copia restaurada");
      for (const [tabla, n] of Object.entries(esperado.conteos)) {
        const [f] = await su.unsafe<{ n: number }[]>(`select count(*)::int as n from app.${ident(tabla)}`);
        if (f.n !== n) ok(false, `${tabla}: ${f.n} filas, el backup dice ${n}`);
      }
      ok(true, `conteos iguales al backup (${Object.keys(esperado.conteos).length} tablas)`);
      const aplicadas = await su<{ created_at: string }[]>`select created_at::text from drizzle.__drizzle_migrations order by created_at`;
      const ultima = Number(aplicadas.at(-1)?.created_at ?? 0);
      const pendientes = journal.entries.filter((e) => e.when > ultima).map((e) => e.tag);
      const ultimaTag = journal.entries.filter((e) => e.when <= ultima).at(-1)?.tag ?? "(ninguna)";
      console.log(`  · aplicadas en el backup: ${aplicadas.length}, la última es ${ultimaTag}`);
      console.log(`  · pendientes (las corre migrate.ts, en una transacción): ${pendientes.join(", ") || "ninguna"}`);

      // ── 2. Referencia: el repositorio desde cero hasta la misma migración ─
      console.log(`\n2. Producción (backup) vs. repositorio migrado desde cero hasta ${ultimaTag}`);
      referencia = await levantarPostgresDescartable("fz_referencia");
      const cRef = carpetaDeMigraciones(carpetaMigraciones, ultima);
      carpetas.push(cRef);
      migrar(referencia, cRef);
      const sRef = postgres(referencia.url("postgres"), { max: 1, onnotice: () => {} });
      const eRef = await estructura(sRef);
      await sRef.end();
      await referencia.apagar();
      referencia = null;
      const eAntes = await estructura(su);
      compararEstructura("producción", eAntes, "repositorio", eRef);

      // ── 3. Foto de los datos y migración ──────────────────────────────
      const tablas = await tablasYClaves(su, "app");
      await su.unsafe(`create schema ensayo_antes`);
      for (const t of tablas) {
        await su.unsafe(`create table ensayo_antes.${ident(t.tabla)} as select * from app.${ident(t.tabla)}`);
      }
      console.log(`\n3. migrate.ts contra la copia (fn_owner, 3 capas)`);
      const cMig = carpetaDeMigraciones(carpetaMigraciones);
      carpetas.push(cMig);
      const t0 = Date.now();
      const salida = migrar(copia, cMig);
      // Sin los NOTICE de "already exists, skipping" que imprime postgres.js.
      for (const linea of salida.split("\n").filter((l) => /^\s*(→|·|✓)/.test(l))) console.log(`  │ ${linea}`);
      console.log(`  · duró ${Date.now() - t0} ms`);
      const despuesMig = await su<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`;
      ok(despuesMig[0].n === aplicadas.length + pendientes.length, `journal: ${aplicadas.length} → ${despuesMig[0].n} migraciones aplicadas`);
      const segunda = migrar(copia, cMig);
      const [{ n: trasSegunda }] = await su<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`;
      ok(trasSegunda === despuesMig[0].n && segunda.includes("✓"), "correrla dos veces no aplica nada de nuevo");

      // ── 4. Antes vs. después, fila por fila ──────────────────────────
      console.log("\n4. Datos: antes vs. después");
      const tablasDespues = await tablasYClaves(su, "app");
      for (const t of tablas) {
        const d = tablasDespues.find((x) => x.tabla === t.tabla);
        if (!d) {
          ok(false, `${t.tabla}: la tabla desapareció`);
          continue;
        }
        const T = ident(t.tabla);
        const pk = t.pk.length ? t.pk : t.columnas;
        const on = pk.map((c) => `a.${ident(c)} is not distinct from b.${ident(c)}`).join(" and ");
        const [{ faltan, sobran }] = await su.unsafe<{ faltan: number; sobran: number }[]>(
          `select (select count(*) from ensayo_antes.${T} a where not exists (select 1 from app.${T} b where ${on}))::int as faltan,
                  (select count(*) from app.${T} b where not exists (select 1 from ensayo_antes.${T} a where ${on}))::int as sobran`,
        );
        const cambios: string[] = [];
        for (const c of t.columnas.filter((x) => d.columnas.includes(x) && !pk.includes(x))) {
          const [{ n }] = await su.unsafe<{ n: number }[]>(
            `select count(*)::int as n from ensayo_antes.${T} a join app.${T} b on ${on} where a.${ident(c)} is distinct from b.${ident(c)}`,
          );
          if (n > 0) cambios.push(`${c}: ${n} fila(s)`);
        }
        const perdidas: string[] = [];
        for (const c of t.columnas.filter((x) => !d.columnas.includes(x))) {
          const [{ n }] = await su.unsafe<{ n: number }[]>(`select count(${ident(c)})::int as n from ensayo_antes.${T}`);
          const clave = `${t.tabla}.${c}`;
          if (n > 0) {
            const autorizada = aceptadas.has(clave);
            ok(autorizada, `${clave}: columna eliminada con ${n} valor(es) — ${autorizada ? "pérdida autorizada con --aceptar-perdida" : "PÉRDIDA DE DATOS"}`);
          } else console.log(`  · ${clave}: columna eliminada, estaba vacía`);
          perdidas.push(c);
        }
        const nuevas = d.columnas.filter((x) => !t.columnas.includes(x));
        for (const c of nuevas) {
          const [{ n }] = await su.unsafe<{ n: number }[]>(`select count(${ident(c)})::int as n from app.${T}`);
          console.log(`  · ${t.tabla}.${c}: columna nueva, ${n} valor(es) no nulos`);
        }
        const limpio = faltan === 0 && sobran === 0 && cambios.length === 0;
        if (limpio) ok(true, `${t.tabla}: mismas filas y mismos valores${perdidas.length ? ` (salvo la columna eliminada)` : ""}`);
        else {
          if (faltan || sobran) ok(false, `${t.tabla}: ${faltan} fila(s) faltan, ${sobran} fila(s) nuevas`);
          if (cambios.length) console.log(`  ! ${t.tabla}: valores distintos en ${cambios.join(", ")} (revisar si es lo que la migración quiere)`);
        }
      }

      console.log("\n5. Seguridad y permisos después de migrar");
      const eDespues = await estructura(su);
      const seg = (e: Estructura) => huella(e.seguridad);
      ok(seg(eAntes) === seg(eDespues), `RLS, policies, triggers, funciones y permisos iguales que antes (huella ${seg(eDespues)})`);
      const sinForce = eDespues.seguridad.rls.filter((r) => !r.force).map((r) => r.tabla);
      ok(eDespues.seguridad.rls.every((r) => r.rls), `RLS encendido en ${eDespues.seguridad.rls.length}/${eDespues.seguridad.rls.length} tablas (sin FORCE: ${sinForce.join(", ")})`);
      const colsNuevas = eDespues.columnas.filter((c) => !eAntes.columnas.some((x) => x.t === c.t && x.c === c.c));
      for (const c of colsNuevas) {
        const [p] = await su<{ app: boolean; ro: boolean }[]>`
          select has_column_privilege('fn_app', ${`app.${c.t}`}, ${c.c}, 'SELECT, INSERT, UPDATE') as app,
                 has_column_privilege('fn_readonly', ${`app.${c.t}`}, ${c.c}, 'SELECT') as ro`;
        ok(p.app && p.ro, `${c.t}.${c.c}: fn_app lee y escribe, fn_readonly lee`);
      }
      const consNuevas = eDespues.constraints.filter((c) => !eAntes.constraints.some((x) => x.n === c.n));
      for (const c of consNuevas) console.log(`  · constraint nueva ${c.n}: ${c.d}`);
      const consIdas = eAntes.constraints.filter((c) => !eDespues.constraints.some((x) => x.n === c.n));
      for (const c of consIdas) console.log(`  · constraint eliminada ${c.n}`);

      // ── 5. Pruebas funcionales como la app ─────────────────────────────
      console.log("\n6. Pruebas funcionales con fn_app (en una transacción que se revierte)");
      const app = postgres(copia.url("fn_app"), { max: 1, onnotice: () => {} });
      const columnasAlumno = new Set(eDespues.columnas.filter((c) => c.t === "students").map((c) => c.c));
      class Revertir extends Error {}
      try {
        const sinContexto = await app<{ n: number }[]>`select count(*)::int as n from app.students`.then(
          ([f]) => `${f.n} alumnos`,
          () => "un error",
        );
        ok(sinContexto === "0 alumnos" || sinContexto === "un error", `sin contexto de gimnasio, fn_app recibe ${sinContexto}`);
        // El id del gimnasio sale de la copia con el superusuario: fn_app
        // no ve `gyms` sin contexto.
        const [{ id: gymId }] = await su<{ id: string }[]>`select id from app.gyms limit 1`;
        await app
          .begin(async (tx) => {
            await tx`select set_config('app.gym_id', ${gymId}, true)`;
            const [{ n: alumnos }] = await tx<{ n: number }[]>`select count(*)::int as n from app.students`;
            ok(alumnos === esperado.conteos.students, `con el contexto del gimnasio ve ${alumnos} alumnos`);
            if (!columnasAlumno.has("situacion_laboral")) {
              ok(false, "students.situacion_laboral no existe después de migrar");
              throw new Revertir();
            }
            const [alumno] = await tx<{ id: string; fila: string }[]>`
              select id, md5(s::text) as fila from app.students s where vinculo = 'ACTIVO' order by created_at desc limit 1`;
            await tx`update app.students set situacion_laboral = 'SECTOR_PUBLICO', situacion_laboral_detalle = 'Ensayo' where id = ${alumno.id}`;
            const [leido] = await tx<{ s: string; d: string }[]>`
              select situacion_laboral as s, situacion_laboral_detalle as d from app.students where id = ${alumno.id}`;
            ok(leido.s === "SECTOR_PUBLICO" && leido.d === "Ensayo", "fn_app guarda y lee la situación laboral");
            const [{ otras }] = await su<{ otras: number }[]>`
              select count(*)::int as otras from app.students where situacion_laboral is not null`;
            ok(otras === 0, "fuera de la transacción nadie más tiene situación laboral (la prueba no se filtró)");
            for (const [valor, detalle, motivo] of [
              ["DESEMPLEADO", null, "un valor fuera del catálogo"],
              ["OTRO", "", "un detalle vacío"],
              ["OTRO", "x".repeat(121), "un detalle de 121 caracteres"],
            ] as const) {
              const rechazado = await tx
                .savepoint(async (sp) => {
                  await sp`update app.students set situacion_laboral = ${valor}, situacion_laboral_detalle = ${detalle} where id = ${alumno.id}`;
                  return false;
                })
                .catch((e: { code?: string }) => e.code === "23514");
              ok(rechazado, `la base rechaza ${motivo}`);
            }
            if (columnasAlumno.has("disciplina")) {
              const [{ n: conDisciplina }] = await tx<{ n: number }[]>`select count(disciplina)::int as n from app.students`;
              const [{ n: antes }] = await su<{ n: number }[]>`select count(disciplina)::int as n from ensayo_antes.students`;
              ok(conDisciplina === antes, `disciplina sigue con sus ${antes} valores después de editar un alumno`);
            }
            throw new Revertir();
          })
          .catch((e) => {
            if (!(e instanceof Revertir)) throw e;
          });
        const [despuesDeRevertir] = await su<{ n: number }[]>`select count(situacion_laboral)::int as n from app.students`;
        ok(despuesDeRevertir.n === 0, "la prueba se revirtió entera");
        const [{ ajeno }] = await app.begin(async (tx) => {
          await tx`select set_config('app.gym_id', '00000000-0000-0000-0000-000000000000', true)`;
          return tx<{ ajeno: number }[]>`select count(*)::int as ajeno from app.students`;
        });
        ok(ajeno === 0, `con el id de otro gimnasio, fn_app ve ${ajeno} alumnos`);
      } finally {
        await app.end();
      }

      // ── 6. Comando externo con la copia viva ───────────────────────────
      if (despues) {
        console.log(`\n7. --despues: ${despues}`);
        const codigo = await new Promise<number>((ok_) => {
          const hijo = spawn(despues, {
            shell: true,
            stdio: "inherit",
            env: {
              ...process.env,
              FZ_ENSAYO_URL_APP: copia!.url("fn_app"),
              FZ_ENSAYO_URL_OWNER: copia!.url("fn_owner"),
              FZ_ENSAYO_URL_RO: copia!.url("fn_readonly"),
              FZ_ENSAYO_URL_SU: copia!.url("postgres"),
            },
          });
          hijo.on("exit", (c) => ok_(c ?? 1));
        });
        ok(codigo === 0, `el comando terminó con código ${codigo}`);
      }
    } finally {
      await su.end();
    }
  } finally {
    if (referencia) await referencia.apagar();
    if (copia) await copia.apagar();
    for (const c of carpetas) rmSync(c, { recursive: true, force: true });
    rmSync(tmp, { recursive: true, force: true });
    console.log("\n→ Copias, carpetas temporales y dump descifrado borrados.");
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(fallas === 0 ? `✓ ENSAYO OK en ${segundos} s.` : `✗ ENSAYO CON ${fallas} PROBLEMA(S) (${segundos} s).`);
  return fallas === 0 ? 0 : 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  },
);
