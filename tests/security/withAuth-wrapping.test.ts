import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Toda Server Action de escritura Y toda consulta de lectura debe pasar por
 * withAuth() — es la única barrera real de autenticación/rol, ver
 * src/use-cases/_kernel/with-auth.ts. Este test recorre el código fuente
 * de src/use-cases/ (salvo _kernel/, que es el propio wrapper) y falla si
 * algún identificador exportado que termine en "Action" o en "Query" no
 * tiene, en el mismo archivo, la cadena "withAuth(". Es estático (texto,
 * no AST) a propósito: rápido, sin dependencias nuevas, y suficiente para
 * esta regla.
 *
 * Las lecturas entran en la regla desde Fase 1, y no por simetría: los
 * datos de los alumnos son el activo sensible del sistema, y una lectura
 * sin autorización los filtra igual de mal que una escritura sin
 * autorización los corrompe.
 */

const USE_CASES_ROOT = join(process.cwd(), "src", "use-cases");

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

function isKernelFile(absPath: string): boolean {
  const rel = relative(USE_CASES_ROOT, absPath);
  return rel.split(sep)[0] === "_kernel";
}

// Cubre las formas reales de export que puede tener un caso de uso:
//   export const crearAlumnoAction = withAuth(...)
//   export function crearAlumnoAction(...) { ... }
//   export async function crearAlumnoAction(...) { ... }
//   export { crearAlumnoAction }
const EXPORT_ACTION_RE =
  /export\s+(?:const|function|async function)\s+(\w*(?:Action|Query)\w*)\b|export\s*\{[^}]*\b(\w*(?:Action|Query)\w*)\b[^}]*\}/g;

function findExportedActionNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(EXPORT_ACTION_RE)) {
    const name = match[1] ?? match[2];
    if (name && (name.endsWith("Action") || name.endsWith("Query"))) names.add(name);
  }
  return [...names];
}

// "withAuth(" en el sentido literal de la consigna, pero tolerando type
// arguments explícitos entre el nombre y el paréntesis — el propio caso
// de uso de ejemplo del proyecto llama a `withAuth<CrearAlumnoInput,
// AlumnoCreado>(...)`, así que un substring exacto "withAuth(" nunca
// matchearía código real con generics.
const WITH_AUTH_CALL_RE = /withAuth\s*(?:<[^;]*?>)?\s*\(/;

function callsWithAuth(source: string): boolean {
  return WITH_AUTH_CALL_RE.test(source);
}

describe("toda Server Action y toda consulta exportada están envueltas en withAuth()", () => {
  const allFiles = listTsFilesRecursive(USE_CASES_ROOT);
  const files = allFiles.filter((f) => !isKernelFile(f));

  it("encuentra al menos un archivo de caso de uso fuera de _kernel/ para analizar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("todo export *Action / *Query tiene 'withAuth(' en el mismo archivo", () => {
    const violaciones: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      const relPath = relative(process.cwd(), file);
      const actionNames = findExportedActionNames(source);

      if (actionNames.length === 0) continue;

      if (!callsWithAuth(source)) {
        violaciones.push(`${relPath}: exporta ${actionNames.join(", ")} sin usar withAuth(...)`);
      }
    }

    expect(violaciones).toEqual([]);
  });

  it("cubre de verdad los casos de uso de alumnos de Fase 1", () => {
    const esperados = ["crear-alumno.ts", "editar-alumno.ts", "cambiar-vinculo.ts", "consultas.ts"];
    const encontrados = files
      .filter((f) => f.includes(join("use-cases", "alumnos")))
      .map((f) => f.split(sep).pop());
    for (const esperado of esperados) {
      expect(encontrados, `falta ${esperado} en el análisis`).toContain(esperado);
    }
  });

  it("detecta las consultas de lectura como exports que necesitan withAuth", () => {
    const consultas = files.find((f) => f.endsWith(join("alumnos", "consultas.ts")));
    expect(consultas).toBeDefined();
    const source = readFileSync(consultas!, "utf-8");
    expect(findExportedActionNames(source)).toContain("listarAlumnosQuery");
    expect(callsWithAuth(source)).toBe(true);
  });

  it("sanity check: crear-alumno.ts (caso de uso de ejemplo) es detectado como envuelto", () => {
    // Si esto fallara, la regex de arriba estaría rota y el test de
    // seguridad de más arriba pasaría vacuamente para todo el proyecto.
    const ejemplo = files.find((f) => f.endsWith(join("alumnos", "crear-alumno.ts")));
    expect(ejemplo).toBeDefined();

    const source = readFileSync(ejemplo!, "utf-8");
    expect(findExportedActionNames(source)).toContain("crearAlumnoAction");
    expect(callsWithAuth(source)).toBe(true);
  });
});
