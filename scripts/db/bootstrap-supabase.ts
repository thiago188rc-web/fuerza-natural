import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
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
 * Dos formas de llegar como admin, leídas de .env.produccion.local:
 *
 *   npm run db:prod:bootstrap
 *     con DATABASE_URL_ADMIN: la cadena del "Session pooler" del botón
 *     Connect (usuario `postgres.<ref>`, puerto 5432, con la contraseña de
 *     la base). Al terminar se BORRA del archivo.
 *
 *   npm run db:prod:bootstrap -- --ref <ref del proyecto>
 *     con SUPABASE_ACCESS_TOKEN: un token personal; el SQL va por la
 *     Management API, sin necesitar la contraseña de la base. El token se
 *     revoca a mano en supabase.com/dashboard/account/tokens al terminar.
 *
 * En los dos casos escribe en ese archivo DATABASE_URL (fn_app),
 * DATABASE_URL_OWNER (fn_owner) y DATABASE_URL_READONLY (fn_readonly), con
 * contraseñas aleatorias que nunca se imprimen.
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

/** Cómo se ejecuta SQL como admin y a qué pooler se conectan después los roles. */
interface Admin {
  ref: string;
  poolerHost: string;
  base: string;
  ejecutar<T = Record<string, unknown>>(sqlText: string): Promise<T[]>;
  cerrar(): Promise<void>;
  /** Variable a borrar del archivo al terminar (la credencial admin), si aplica. */
  borrarAlTerminar: string[];
}

function adminPorCadena(crudo: string): Admin {
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    throw new ErrorDeUso("DATABASE_URL_ADMIN no es una URL válida.");
  }
  const [rolAdmin, ref] = decodeURIComponent(url.username).split(".");
  if (!url.hostname.endsWith(".pooler.supabase.com") || url.port !== "5432" || rolAdmin !== "postgres" || !ref) {
    throw new ErrorDeUso(
      `DATABASE_URL_ADMIN tiene que ser la del "Session pooler" (usuario postgres.<ref>, ` +
        `host *.pooler.supabase.com, puerto 5432). Llegó: ${enmascarar(crudo)}`,
    );
  }
  if (!url.password || url.password.includes("YOUR-PASSWORD")) {
    throw new ErrorDeUso("A DATABASE_URL_ADMIN le falta la contraseña real de la base.");
  }
  const sql = postgres(url.toString(), { max: 1, ssl: "require", connect_timeout: 15, onnotice: () => {} });
  return {
    ref,
    poolerHost: url.hostname,
    base: url.pathname.replace(/^\//, "") || "postgres",
    ejecutar: async <T>(sqlText: string) => (await sql.unsafe(sqlText)) as unknown as T[],
    cerrar: () => sql.end({ timeout: 5 }),
    borrarAlTerminar: ["DATABASE_URL_ADMIN"],
  };
}

async function adminPorManagementApi(token: string, ref: string): Promise<Admin> {
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new ErrorDeUso(`--ref no parece un ref de Supabase: ${ref || "(vacío)"}`);
  const api = async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(`https://api.supabase.com${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`Management API ${metodo} ${ruta} → ${r.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : null;
  };
  const poolers = (await api("GET", `/v1/projects/${ref}/config/database/pooler`)) as {
    database_type: string;
    db_host: string;
    db_name: string;
  }[];
  const primario = poolers.find((p) => p.database_type === "PRIMARY") ?? poolers[0];
  if (!primario?.db_host) throw new ErrorDeUso("La Management API no devolvió el host del pooler.");
  return {
    ref,
    poolerHost: primario.db_host,
    base: primario.db_name || "postgres",
    ejecutar: async <T>(sqlText: string) => (await api("POST", `/v1/projects/${ref}/database/query`, { query: sqlText })) as T[],
    cerrar: async () => {},
    borrarAlTerminar: [],
  };
}

/**
 * El verificador SCRAM-SHA-256 que Postgres guarda en pg_authid, calculado
 * acá (RFC 5802/7677, mismo formato que genera Postgres). `CREATE ROLE …
 * PASSWORD 'SCRAM-SHA-256$…'` lo guarda tal cual: la contraseña en texto
 * plano nunca viaja a Supabase — ni por la API ni a los logs de Postgres,
 * que con `log_statement = ddl` registrarían el CREATE ROLE entero.
 */
function verificadorScram(password: string): string {
  const salt = randomBytes(16);
  const iteraciones = 4096;
  const salted = pbkdf2Sync(password, salt, iteraciones, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iteraciones}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

function cadenaDe(admin: Admin, rol: RolApp, password: string): string {
  const url = new URL(`postgresql://${admin.poolerHost}`);
  url.username = `${rol}.${admin.ref}`;
  url.password = password;
  url.port = String(CONEXIONES[rol].puerto);
  url.pathname = `/${admin.base}`;
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

  const cadenaAdmin = process.env.DATABASE_URL_ADMIN?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  let admin: Admin;
  if (cadenaAdmin) {
    admin = adminPorCadena(cadenaAdmin);
  } else if (token) {
    admin = await adminPorManagementApi(token, args.get("ref")?.trim() ?? "");
  } else {
    throw new ErrorDeUso(
      "Falta cómo entrar como admin: DATABASE_URL_ADMIN (cadena del Session pooler) o " +
        "SUPABASE_ACCESS_TOKEN + --ref, en .env.produccion.local.",
    );
  }

  try {
    const existentes = await admin.ejecutar<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname IN (${ROLES.map((r) => `'${r}'`).join(", ")})`,
    );
    if (existentes.length > 0 && !rotar) {
      throw new ErrorDeUso(
        `Los roles ${existentes.map((r) => r.rolname).join(", ")} ya existen en este proyecto. ` +
          "Si es a propósito, --rotar les genera contraseñas nuevas (invalida las actuales).",
      );
    }

    const passwords = {} as Record<RolApp, string>;
    for (const rol of ROLES) {
      // base64url: va dentro de la URL de conexión sin escapar. Al servidor
      // solo llega su verificador SCRAM (base64 estándar, sin comillas).
      const password = randomBytes(24).toString("base64url");
      passwords[rol] = password;
      const existe = existentes.some((r) => r.rolname === rol);
      const verificador = verificadorScram(password);
      await admin.ejecutar(
        existe
          ? `ALTER ROLE ${rol} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${verificador}'`
          : `CREATE ROLE ${rol} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${verificador}'`,
      );
      console.log(`✓ rol ${rol} ${existe ? "con contraseña nueva" : "creado"}`);
    }

    // Lo que 00_extensions_and_roles.sql pide como "bootstrap manual previo".
    await admin.ejecutar(`GRANT CREATE, CONNECT ON DATABASE "${admin.base}" TO fn_owner`);
    await admin.ejecutar(`GRANT CONNECT ON DATABASE "${admin.base}" TO fn_app, fn_readonly`);
    await admin.ejecutar(`GRANT USAGE, CREATE ON SCHEMA public TO fn_owner`);
    // immutable_unaccent() y los operadores de pg_trgm viven en public: la
    // columna generada y la búsqueda los usan con el rol de la app.
    await admin.ejecutar(`GRANT USAGE ON SCHEMA public TO fn_app, fn_readonly`);
    console.log("✓ permisos sobre la base y el esquema public");

    // Las extensiones las crea el admin, en public: el wrapper
    // public.immutable_unaccent() llama a public.unaccent() por nombre.
    const extensiones = await admin.ejecutar<{ extname: string; schema: string }>(
      `SELECT extname, extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')`,
    );
    for (const ext of ["unaccent", "pg_trgm"]) {
      const actual = extensiones.find((e) => e.extname === ext);
      if (!actual) {
        await admin.ejecutar(`CREATE EXTENSION IF NOT EXISTS ${ext} WITH SCHEMA public`);
        console.log(`✓ extensión ${ext} en public`);
      } else if (actual.schema !== "public") {
        console.warn(`⚠ ${ext} ya existe en el esquema "${actual.schema}", no en public: revisar antes de migrar.`);
      } else {
        console.log(`✓ extensión ${ext} ya estaba en public`);
      }
    }

    const cadenas = Object.fromEntries(
      ROLES.map((rol) => [CONEXIONES[rol].variable, cadenaDe(admin, rol, passwords[rol])]),
    );

    // Primero guardar: si la prueba de abajo falla, las contraseñas recién
    // asignadas no se pierden (y la credencial admin sigue ahí para reintentar).
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

    actualizarEnv(archivo, {}, admin.borrarAlTerminar);
    console.log(`\n✓ Conexiones guardadas en ${archivo}.`);
    if (admin.borrarAlTerminar.length) console.log("  DATABASE_URL_ADMIN borrada.");
    else console.log("  Revocá el token en supabase.com/dashboard/account/tokens cuando termines.");
    console.log("  Siguiente: npm run db:prod:migrate");
  } finally {
    await admin.cerrar();
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
