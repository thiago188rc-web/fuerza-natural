import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";

/**
 * Corre un script con las credenciales de PRODUCCIÓN.
 *
 *   npx tsx scripts/db/produccion.ts scripts/db/migrate.ts --produccion
 *
 * Las credenciales viven FUERA del repositorio y de cualquier carpeta
 * sincronizada: hasta el 2026-10-02 estaban en `.env.produccion.local`,
 * dentro del repo, que está en el Escritorio, que OneDrive sube a la nube.
 * Ahora el archivo es `~/.fuerza-natural/produccion.env` (o el que diga
 * FN_ENV_PRODUCCION), y este cargador se niega a usar uno que esté dentro
 * del repo o de OneDrive. Nunca imprime su contenido.
 */

const RAIZ = resolve(__dirname, "..", "..");

export function rutaEnvProduccion(): string {
  return resolve(process.env.FN_ENV_PRODUCCION || join(homedir(), ".fuerza-natural", "produccion.env"));
}

export function exigirUbicacionSegura(ruta: string): void {
  const rel = relative(RAIZ, ruta);
  const dentroDelRepo = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  const sincronizada = /[\\/](OneDrive|Dropbox|Google Drive|iCloudDrive)[\\/]/i.test(ruta);
  if (dentroDelRepo || sincronizada) {
    throw new Error(
      `Las credenciales de producción no pueden estar en ${dentroDelRepo ? "el repositorio" : "una carpeta sincronizada"}. ` +
        "Movelas a ~/.fuerza-natural/produccion.env (ver docs/RUNBOOK.md).",
    );
  }
}

async function main() {
  const [script, ...resto] = process.argv.slice(2);
  if (!script) throw new Error("Uso: tsx scripts/db/produccion.ts <script> [argumentos]");

  const ruta = rutaEnvProduccion();
  exigirUbicacionSegura(ruta);
  if (!existsSync(ruta)) throw new Error(`No existe ${ruta}.`);
  // override: lo que diga el archivo de producción gana sobre el entorno.
  config({ path: ruta, override: true, quiet: true });

  const objetivo = resolve(RAIZ, script);
  process.argv = [process.argv[0], objetivo, ...resto];
  await import(pathToFileURL(objetivo).href);
}

// Solo cuando se lo ejecuta directo; los otros scripts importan las funciones.
if (require.main === module) {
  main().catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  });
}
