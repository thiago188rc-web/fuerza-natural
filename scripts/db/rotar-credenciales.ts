import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { rutaEnvProduccion } from "./produccion";
import { verificadorScram } from "./scram";

/**
 * ROTA las contraseñas de fn_readonly, fn_owner y fn_app SIN credencial de
 * administrador: en Postgres cada rol puede cambiar su propia contraseña.
 *
 *   npx tsx scripts/db/produccion.ts scripts/db/rotar-credenciales.ts
 *
 * Por rol, en este orden (de menos a más crítico):
 *   1. Genera una contraseña nueva (32 bytes al azar) y anota la URL nueva
 *      en `<archivo>.pendiente` ANTES de tocar la base: si el proceso se
 *      corta a mitad de camino, la contraseña nueva no se pierde.
 *   2. Se conecta con la credencial actual y hace ALTER ROLE … PASSWORD
 *      con el verificador SCRAM (la contraseña en claro no sale de acá).
 *   3. Verifica que la nueva conecte (reintenta: el pooler puede tardar).
 *   4. Recién ahí reescribe la variable en el archivo de credenciales.
 *
 * Nunca imprime URLs ni contraseñas. Después hay que actualizar
 * DATABASE_URL en Vercel y volver a publicar (RUNBOOK).
 */

const ROLES = [
  { rol: "fn_readonly", variable: "DATABASE_URL_READONLY" },
  { rol: "fn_owner", variable: "DATABASE_URL_OWNER" },
  { rol: "fn_app", variable: "DATABASE_URL" },
] as const;

function leerVariables(ruta: string): Map<string, string> {
  const valores = new Map<string, string>();
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) valores.set(m[1], m[2]);
  }
  return valores;
}

function reemplazarVariable(ruta: string, clave: string, valor: string): void {
  const lineas = readFileSync(ruta, "utf8").split(/\r?\n/);
  let hecho = false;
  const salida = lineas.map((l) => {
    if (new RegExp(`^\\s*${clave}\\s*=`).test(l)) {
      hecho = true;
      return `${clave}="${valor}"`;
    }
    return l;
  });
  if (!hecho) salida.push(`${clave}="${valor}"`);
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, salida.join("\n").replace(/\n*$/, "\n"));
  renameSync(temporal, ruta);
}

async function conecta(url: string, rolEsperado: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
  try {
    const [fila] = await sql<{ quien: string }[]>`select current_user as quien`;
    return fila?.quien === rolEsperado;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

async function main() {
  const ruta = rutaEnvProduccion();
  const solo = process.argv.slice(2).find((a) => a.startsWith("--solo="))?.slice(7);

  for (const { rol, variable } of ROLES) {
    if (solo && solo !== rol) continue;
    const pendiente = `${ruta}.pendiente-${rol}`;
    if (existsSync(pendiente)) {
      throw new Error(`Hay una rotación a medias de ${rol} (${pendiente}). Resolverla antes de seguir (RUNBOOK).`);
    }

    const actual = leerVariables(ruta).get(variable);
    if (!actual) throw new Error(`Falta ${variable} en el archivo de credenciales.`);
    if (!(await conecta(actual, rol))) throw new Error(`${rol}: la credencial actual no conecta. No se tocó nada.`);

    const nueva = new URL(actual);
    nueva.password = randomBytes(32).toString("base64url");
    const urlNueva = nueva.toString();
    writeFileSync(pendiente, `${variable}="${urlNueva}"\n`, { mode: 0o600 });

    const sql = postgres(actual, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
    try {
      await sql.unsafe(`ALTER ROLE ${rol} PASSWORD '${verificadorScram(nueva.password)}'`);
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }

    let ok = false;
    for (let intento = 1; intento <= 12 && !ok; intento++) {
      ok = await conecta(urlNueva, rol);
      if (!ok) await new Promise((r) => setTimeout(r, 5000));
    }
    if (!ok) {
      throw new Error(
        `${rol}: la contraseña se cambió pero la nueva no conecta todavía. La nueva quedó en ${pendiente}; ` +
          "no borrarlo. Reintentar la verificación más tarde o resolver desde el SQL Editor de Supabase.",
      );
    }

    reemplazarVariable(ruta, variable, urlNueva);
    unlinkSync(pendiente);
    const vieja = await conecta(actual, rol);
    console.log(`✓ ${rol}: rotada y verificada. La contraseña anterior ${vieja ? "TODAVÍA conecta (caché del pooler)" : "ya no conecta"}.`);
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message.replace(/:\/\/[^@\s]*@/g, "://***@")}`);
  process.exit(1);
});
