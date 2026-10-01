import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { enmascarar, leerArgumentos } from "./_compartido";

/**
 * Prepara un proyecto Supabase NUEVO para que `db:prod:migrate` pueda
 * correr: los tres roles de la aplicación, sus permisos sobre la base y las
 * extensiones. Es el paso "una sola vez, con el usuario admin" que
 * db/migrations/infra/00_extensions_and_roles.sql documenta y no puede
 * hacer solo (fn_owner no puede crearse a sí mismo).
 *
 *   npm run db:prod:bootstrap
 *
 * Lee DATABASE_URL_ADMIN de .env.produccion.local: la cadena del "Session
 * pooler" del botón Connect de Supabase (usuario `postgres.<ref>`, puerto
 * 5432). Escribe en ese mismo archivo DATABASE_URL (fn_app),
 * DATABASE_URL_OWNER (fn_owner) y DATABASE_URL_READONLY (fn_readonly), con
 * contraseñas aleatorias que nunca se imprimen, y BORRA la cadena admin:
 * después de esto ya no hace falta, y es la credencial más poderosa del
 * proyecto.
 *
 * Por qué un archivo aparte y no .env.local: los tests de integración
 * escriben gimnasios de prueba en la base de DATABASE_URL sin limpiarlos
 * (es una base descartable por diseño). Con producción en .env.local, un
 * `npm test` la ensucia.
 *
 * Si los roles ya existen, se niega — salvo con --rotar, que les genera
 * contraseñas nuevas (y deja inservibles las anteriores, también la de
 * Vercel: hay que actualizar DATABASE_URL allá).
 */

const ROLES = ["fn_owner", "fn_app", "fn_readonly"] as const;
type RolApp = (typeof ROLES)[number];

/** Qué variable guarda la conexión de cada rol, y por qué puerto del pooler. */
const CONEXIONES: Record<RolApp, { variable: string; puerto: number }> = {
  // Session pooler (5432): las migraciones necesitan una sesión estable.
  fn_owner: { variable: "DATABASE_URL_OWNER", puerto: 5432 },
  // Transaction pooler (6543): el runtime de la app en Vercel. Ver
  // src/data/db.ts (`prepare: false`, `set_config(..., true)`).
  fn_app: { variable: "DATABASE_URL", puerto: 6543 },
  fn_readonly: { variable: "DATABASE_URL_READONLY", puerto: 5432 },
};

class ErrorDeUso extends Error {}

function leerAdmin(): { url: URL; ref: string; base: string } {
  const crudo = process.env.DATABASE_URL_ADMIN?.trim();
  if (!crudo) {
    throw new ErrorDeUso(
      "Falta DATABASE_URL_ADMIN en .env.produccion.local. Es la cadena del " +
        '"Session pooler" del botón Connect del proyecto Supabase, con la contraseña de la base.',
    );
  }
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    throw new ErrorDeUso("DATABASE_URL_ADMIN no es una URL válida.");
  }
  const usuario = decodeURIComponent(url.username);
  const [rolAdmin, ref] = usuario.split(".");
  if (!url.hostname.endsWith(".pooler.supabase.com") || url.port !== "5432" || rolAdmin !== "postgres" || !ref) {
    throw new ErrorDeUso(
      `DATABASE_URL_ADMIN tiene que ser la del "Session pooler" (usuario postgres.<ref>, ` +
        `host *.pooler.supabase.com, puerto 5432). Llegó: ${enmascarar(crudo)}`,
    );
  }
  if (!url.password || url.password.includes("YOUR-PASSWORD")) {
    throw new ErrorDeUso("A DATABASE_URL_ADMIN le falta la contraseña real de la base.");
  }
  return { url, ref, base: url.pathname.replace(/^\//, "") || "postgres" };
}

function cadenaDe(admin: URL, ref: string, base: string, rol: RolApp, password: string): string {
  const url = new URL(admin.toString());
  url.username = `${rol}.${ref}`;
  url.password = password;
  url.port = String(CONEXIONES[rol].puerto);
  url.pathname = `/${base}`;
  url.search = "?sslmode=require";
  return url.toString();
}

/** Reemplaza (o agrega) variables en un archivo .env, conservando el resto. */
function actualizarEnv(ruta: string, valores: Record<string, string>, borrar: string[]) {
  const lineas = existsSync(ruta) ? readFileSync(ruta, "utf8").split(/\r?\n/) : [];
  const pendientes = new Map(Object.entries(valores));
  const salida: string[] = [];
  for (const linea of lineas) {
    const clave = linea.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (clave && borrar.includes(clave)) {
      salida.push(`# ${clave} se borró tras el bootstrap (${new Date().toISOString().slice(0, 10)}).`);
    } else if (clave && pendientes.has(clave)) {
      salida.push(`${clave}="${pendientes.get(clave)}"`);
      pendientes.delete(clave);
    } else {
      salida.push(linea);
    }
  }
  for (const [clave, valor] of pendientes) salida.push(`${clave}="${valor}"`);
  writeFileSync(ruta, salida.join("\n").replace(/\n*$/, "\n"));
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const rotar = args.has("rotar");
  const archivo = resolve(process.cwd(), args.get("archivo") || ".env.produccion.local");
  const { url: admin, ref, base } = leerAdmin();

  const sql = postgres(admin.toString(), { max: 1, ssl: "require", connect_timeout: 15, onnotice: () => {} });
  try {
    const existentes = await sql<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname IN ${sql([...ROLES])}
    `;
    if (existentes.length > 0 && !rotar) {
      throw new ErrorDeUso(
        `Los roles ${existentes.map((r) => r.rolname).join(", ")} ya existen en este proyecto. ` +
          "Si es a propósito, --rotar les genera contraseñas nuevas (invalida las actuales).",
      );
    }

    const passwords = {} as Record<RolApp, string>;
    for (const rol of ROLES) {
      // base64url: sin comillas ni barras — va literal dentro del SQL (DDL
      // no acepta parámetros) y dentro de la URL sin escapar.
      const password = randomBytes(24).toString("base64url");
      passwords[rol] = password;
      const existe = existentes.some((r) => r.rolname === rol);
      await sql.unsafe(
        existe
          ? `ALTER ROLE ${rol} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`
          : `CREATE ROLE ${rol} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
      );
      console.log(`✓ rol ${rol} ${existe ? "con contraseña nueva" : "creado"}`);
    }

    // Lo que 00_extensions_and_roles.sql pide como "bootstrap manual previo".
    await sql.unsafe(`GRANT CREATE, CONNECT ON DATABASE "${base}" TO fn_owner`);
    await sql.unsafe(`GRANT CONNECT ON DATABASE "${base}" TO fn_app, fn_readonly`);
    await sql.unsafe(`GRANT USAGE, CREATE ON SCHEMA public TO fn_owner`);
    // immutable_unaccent() y los operadores de pg_trgm viven en public: la
    // columna generada y la búsqueda los usan con el rol de la app.
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO fn_app, fn_readonly`);
    console.log("✓ permisos sobre la base y el esquema public");

    // Las extensiones las crea el admin, en public: el wrapper
    // public.immutable_unaccent() llama a public.unaccent() por nombre.
    for (const ext of ["unaccent", "pg_trgm"]) {
      const [actual] = await sql<{ schema: string }[]>`
        SELECT extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname = ${ext}
      `;
      if (!actual) {
        await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS ${ext} WITH SCHEMA public`);
        console.log(`✓ extensión ${ext} en public`);
      } else if (actual.schema !== "public") {
        console.warn(`⚠ ${ext} ya existe en el esquema "${actual.schema}", no en public: revisar antes de migrar.`);
      } else {
        console.log(`✓ extensión ${ext} ya estaba en public`);
      }
    }

    const cadenas = Object.fromEntries(
      ROLES.map((rol) => [CONEXIONES[rol].variable, cadenaDe(admin, ref, base, rol, passwords[rol])]),
    );

    // Primero guardar: si la prueba de abajo falla, las contraseñas recién
    // asignadas no se pierden (y la cadena admin sigue ahí para reintentar).
    actualizarEnv(archivo, cadenas, []);

    // Cada rol entra de verdad por el pooler antes de dar nada por hecho.
    for (const rol of ROLES) {
      const variable = CONEXIONES[rol].variable;
      const prueba = postgres(cadenas[variable]!, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
      try {
        const [{ quien }] = await prueba<{ quien: string }[]>`SELECT current_user AS quien`;
        console.log(`✓ ${variable} entra como ${quien} (${enmascarar(cadenas[variable]!)})`);
      } finally {
        await prueba.end({ timeout: 5 });
      }
    }

    actualizarEnv(archivo, {}, ["DATABASE_URL_ADMIN"]);
    console.log(`\n✓ Conexiones guardadas en ${archivo}; DATABASE_URL_ADMIN borrada.`);
    console.log("  Siguiente: npm run db:prod:migrate");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  if (err instanceof ErrorDeUso) {
    console.error(`✗ ${err.message}`);
  } else {
    const e = err as { code?: string; message?: string };
    console.error("✗ Bootstrap falló:", e.code ?? "", (e.message ?? String(err)).replace(/:\/\/[^@\s]*@/g, "://***@"));
  }
  process.exit(1);
});
