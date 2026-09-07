import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * src/domain/ debe ser 100% puro: funciones sin I/O, sin conocer Next.js,
 * la capa de datos, la app, ni auth. La única excepción reconocida (y
 * documentada en el propio archivo) es src/domain/fechas/hoy.ts, que
 * puede tocar `Date`/`Intl` — pero ni siquiera esa función importa nada
 * de fuera del dominio. Este test es estático: lee texto fuente con
 * node:fs, no ejecuta ni typechequea nada.
 */

const DOMAIN_ROOT = join(process.cwd(), "src", "domain");

function listTsFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFilesRecursive(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// import ... from '...'  |  import ... from "..."  |  export ... from '...'
// (export-from también reexporta una dependencia real, así que cuenta).
const IMPORT_RE = /\b(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;

const FORBIDDEN_EXACT_OR_PREFIX = ["next", "@/data", "@/app", "@/lib/auth"];

function isForbiddenImportPath(importPath: string): boolean {
  return FORBIDDEN_EXACT_OR_PREFIX.some(
    (forbidden) => importPath === forbidden || importPath.startsWith(`${forbidden}/`),
  );
}

describe("límites de dependencias del dominio (src/domain/ debe ser puro)", () => {
  const files = listTsFilesRecursive(DOMAIN_ROOT);

  it("encuentra al menos un archivo bajo src/domain/ para analizar", () => {
    // Si esto falla, el test de abajo estaría pasando vacuamente.
    expect(files.length).toBeGreaterThan(0);
  });

  it("ningún archivo de src/domain/ importa de next, @/data, @/app o @/lib/auth, ni menciona 'postgres' en un import", () => {
    const violaciones: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      const relPath = relative(process.cwd(), file);

      for (const match of source.matchAll(IMPORT_RE)) {
        const importPath = match[1];

        if (isForbiddenImportPath(importPath)) {
          violaciones.push(`${relPath}: import prohibido de "${importPath}"`);
        }
        if (importPath.toLowerCase().includes("postgres")) {
          violaciones.push(`${relPath}: import prohibido que menciona "postgres" ("${importPath}")`);
        }
      }
    }

    expect(violaciones).toEqual([]);
  });
});
