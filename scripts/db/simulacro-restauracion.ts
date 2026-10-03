import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { leerArgumentos } from "./_compartido";
import { binario, levantarPostgresDescartable } from "./postgres-descartable";

/**
 * SIMULACRO DE RESTAURACIÓN: demuestra que un backup sirve. "Sin un
 * simulacro registrado, no hay backup: solo una hipótesis" (RUNBOOK).
 *
 *   npx tsx scripts/db/simulacro-restauracion.ts \
 *     --backup "D:/Backups/fuerza-natural/fuerza-natural-….dump.gpg" \
 *     --conteos "D:/Backups/fuerza-natural/fuerza-natural-….conteos.json"
 *
 * 1. Verifica la huella SHA-256 del archivo cifrado contra el JSON.
 * 2. Lo descifra con gpg (pide la contraseña en la terminal) en una
 *    carpeta temporal.
 * 3. Levanta un Postgres DESCARTABLE local, le aplica la capa 00
 *    (extensiones, roles, unaccent) y restaura el dump con pg_restore.
 * 4. Compara fila por fila el conteo de cada tabla contra el JSON, y que
 *    RLS siga encendido y forzado.
 * 5. Apaga y borra todo, incluido el dump descifrado.
 *
 * No toca ninguna base existente. Anotá el resultado y la duración en la
 * tabla de simulacros de docs/RUNBOOK.md.
 */

const RAIZ = resolve(__dirname, "..", "..");

async function main(): Promise<number> {
  const args = leerArgumentos(process.argv.slice(2));
  const rutaBackup = args.get("backup");
  const rutaConteos = args.get("conteos");
  if (!rutaBackup || !rutaConteos) throw new Error("Uso: --backup <archivo .dump.gpg> --conteos <archivo .conteos.json>");

  const inicio = Date.now();
  const esperado = JSON.parse(readFileSync(rutaConteos, "utf8")) as { conteos: Record<string, number>; sha256: string };

  const huella = createHash("sha256").update(readFileSync(rutaBackup)).digest("hex");
  if (huella !== esperado.sha256) throw new Error("La huella del backup no coincide con la del JSON: el archivo cambió o no es ese.");
  console.log("✓ Huella SHA-256 verificada.");

  const tmp = mkdtempSync(join(tmpdir(), "fz-simulacro-"));
  const dump = join(tmp, "backup.dump");
  const pg = await levantarPostgresDescartable("fz_restaurada");
  try {
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
    console.log("✓ Backup descifrado (en una carpeta temporal).");

    // Capa 00: extensiones, roles y el wrapper de unaccent que usa una
    // columna generada. El resto (esquema, datos, RLS, triggers) viene en el dump.
    const owner = postgres(pg.url("fn_owner"), { max: 1, onnotice: () => {} });
    await owner.unsafe(readFileSync(join(RAIZ, "db/migrations/infra/00_extensions_and_roles.sql"), "utf8"));
    await owner.end();

    const restaurar = spawnSync(binario("pg_restore"), ["--exit-on-error", "--dbname", pg.url("postgres"), dump], {
      encoding: "utf8",
    });
    if (restaurar.status !== 0) throw new Error(`pg_restore falló:\n${restaurar.stderr}`);
    console.log("✓ pg_restore terminó sin errores.");

    const su = postgres(pg.url("postgres"), { max: 1, onnotice: () => {} });
    const filas: { tabla: string; origen: number; restaurado: number }[] = [];
    try {
      for (const [tabla, origen] of Object.entries(esperado.conteos)) {
        const [fila] = await su.unsafe<{ n: number }[]>(`select count(*)::int as n from app."${tabla}"`);
        filas.push({ tabla, origen, restaurado: fila.n });
      }
      const sinRls = await su<{ tabla: string }[]>`
        select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity`;
      console.table(filas.map((f) => ({ ...f, ok: f.origen === f.restaurado ? "✓" : "✗" })));
      if (sinRls.length) console.log(`✗ Tablas sin RLS después de restaurar: ${sinRls.map((t) => t.tabla).join(", ")}`);
      const bien = filas.every((f) => f.origen === f.restaurado) && sinRls.length === 0;
      const segundos = Math.round((Date.now() - inicio) / 1000);
      console.log(bien ? `✓ SIMULACRO OK en ${segundos} s.` : `✗ SIMULACRO FALLIDO (${segundos} s).`);
      return bien ? 0 : 1;
    } finally {
      await su.end();
    }
  } finally {
    await pg.apagar();
    rmSync(tmp, { recursive: true, force: true });
    console.log("→ Base temporal y dump descifrado borrados.");
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  },
);
