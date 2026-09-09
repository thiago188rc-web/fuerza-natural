import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Revisa la conexión de RUNTIME de la aplicación (DATABASE_URL, rol fn_app)
 * exactamente como la usa el login, y dice en castellano qué falta.
 *
 * Existe porque el login solo puede mostrar "No pudimos conectar con el
 * sistema": distinguir ahí entre "no llego a la base", "la base no está
 * migrada" y "el rol no tiene permisos" le daría a un desconocido un mapa
 * de la infraestructura. Este script sí puede decirlo, porque lo corre
 * quien ya tiene la credencial.
 *
 *   npm run db:diagnostico                     # usa DATABASE_URL del entorno
 *   npm run db:diagnostico -- "postgres://…"   # o una cadena puntual
 */

const UUID_DE_PRUEBA = "11111111-1111-1111-1111-111111111111";

/** Nunca imprimir la contraseña: este texto puede terminar en un chat. */
function enmascarar(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]*(@)/, "$1***$2");
}

function explicar(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const codigo = e?.code ?? "";
  const mensaje = e?.message ?? String(err);

  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") {
    return "El host no existe o no resuelve. Revisá el host de la cadena de conexión.";
  }
  if (codigo === "ECONNREFUSED") {
    return (
      "Nadie atiende en ese host y puerto. Si la cadena dice localhost, es la base de tu " +
      "máquina: en Vercel no existe. Usá el host del pooler de Supabase."
    );
  }
  if (codigo === "ETIMEDOUT" || codigo === "CONNECT_TIMEOUT") {
    return "La conexión se quedó esperando. Suele ser el puerto equivocado o SSL faltante.";
  }
  if (codigo === "28P01") {
    return "Contraseña incorrecta para ese rol de base de datos.";
  }
  if (codigo === "28000" || codigo === "3D000") {
    return "El rol o la base no existen. ¿Creaste fn_app en el SQL Editor de Supabase?";
  }
  if (codigo === "3F000") {
    return "No existe el esquema `app`: falta correr `npm run db:migrate` contra esta base.";
  }
  if (codigo === "42883") {
    return "Falta la función `app.get_app_user_by_auth_id`: la capa de RLS no se aplicó.";
  }
  if (codigo === "42501") {
    return "El rol no tiene permiso. Falta el GRANT EXECUTE que aplica `npm run db:migrate`.";
  }
  if (/self.signed|certificate|SSL/i.test(mensaje)) {
    return "Problema de SSL. Agregá `?sslmode=require` al final de la cadena de conexión.";
  }
  return mensaje;
}

async function main() {
  const url = process.argv.slice(2).find((a) => a.startsWith("postgres")) ?? process.env.DATABASE_URL;

  if (!url) {
    console.error("✗ No hay DATABASE_URL. Pasala como argumento o cargala en .env.local.");
    process.exit(1);
  }

  console.log(`Conexión de runtime (la que usa la app):\n  ${enmascarar(url)}\n`);

  const puerto = url.match(/:(\d+)\//)?.[1];
  if (puerto === "5432" && url.includes("pooler.supabase.com")) {
    console.log(
      "  Nota: puerto 5432 es el pooler en modo sesión. La app espera el modo\n" +
        "  transacción, en 6543 (ver src/data/db.ts). Funciona igual, pero 6543\n" +
        "  es el correcto para runtime.\n",
    );
  }
  if (url.includes("supabase") && !/sslmode=/.test(url)) {
    console.log("  Nota: la cadena no trae `?sslmode=require`. Supabase suele exigirlo.\n");
  }

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  let fallo = false;

  try {
    const [{ rol, base }] = await sql<{ rol: string; base: string }[]>`
      SELECT current_user AS rol, current_database() AS base
    `;
    console.log(`✓ Conecta. Rol: ${rol} · Base: ${base}`);
    if (rol !== "fn_app") {
      console.log(
        `  Atención: la app debería conectar como fn_app, no como ${rol}. ` +
          "Un rol con más privilegios se saltea RLS.",
      );
    }

    const [{ existe }] = await sql<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') AS existe
    `;
    if (!existe) {
      console.log("✗ No existe el esquema `app`. Falta correr `npm run db:migrate` contra esta base.");
      return void (fallo = true);
    }
    console.log("✓ Existe el esquema `app`.");

    const filas = await sql`
      SELECT * FROM app.get_app_user_by_auth_id(${UUID_DE_PRUEBA}::uuid)
    `;
    console.log(`✓ La función get_app_user_by_auth_id responde (${filas.length} filas, se esperaba 0).`);

    // A propósito NO se cuentan las filas de app_users desde acá: fn_app
    // está sujeto a RLS y sin contexto de gimnasio siempre vería cero, lo
    // que haría creer que no hay nadie vinculado. Para ver quién está
    // vinculado hace falta la credencial de migraciones:
    //   npm run db:provision-owner
    console.log("\nLa base responde y la app puede leerla.");
    console.log(
      "Si el login igual dice que tu usuario no está habilitado, falta vincularlo:\n" +
        "  npm run db:provision-owner",
    );
  } catch (err) {
    fallo = true;
    console.log(`✗ ${explicar(err)}`);
    console.log(`\n  Detalle técnico: ${(err as Error).message}`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
    if (fallo) process.exitCode = 1;
  }
}

main();
