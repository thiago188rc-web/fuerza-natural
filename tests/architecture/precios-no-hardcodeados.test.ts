import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Los precios son DATOS del gimnasio, no constantes del código
 * (docs/REGLAS-DE-NEGOCIO.md §2). El dueño ya los cambió 3 veces en 7
 * meses según el Data Discovery; un importe escrito en el código
 * convierte cada ajuste de precio en un despliegue, y —peor— en un
 * recálculo silencioso de lo que muestra el historial.
 *
 * Este test es estático: recorre `src/` y falla si aparece cualquiera de
 * los importes confirmados. Cubre el caso realista (alguien "resuelve"
 * rápido un default o un fallback), no un atacante creativo que escriba
 * `49000 + 1000`.
 */

const SRC = join(process.cwd(), "src");

/** Los importes confirmados por el dueño. Ninguno debe estar en el código. */
const IMPORTES_PROHIBIDOS = [50000, 55000, 60000, 65000, 45000];

function listarFuentes(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const full = join(dir, entrada);
    if (statSync(full).isDirectory()) out.push(...listarFuentes(full));
    else if (/\.tsx?$/.test(entrada)) out.push(full);
  }
  return out;
}

describe("los precios no están hardcodeados en src/", () => {
  const archivos = listarFuentes(SRC);

  it("encuentra archivos para analizar", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it.each(IMPORTES_PROHIBIDOS)("el importe %i no aparece en ningún archivo", (importe) => {
    // \b para no marcar un falso positivo dentro de un número más largo
    // (p. ej. 450000) ni dentro de un identificador.
    const patron = new RegExp(`\\b${importe}\\b`);
    const infractores = archivos
      .filter((f) => patron.test(readFileSync(f, "utf-8")))
      .map((f) => relative(process.cwd(), f));

    expect(infractores).toEqual([]);
  });

  it("tampoco aparecen escritos con separador de miles de JS (50_000)", () => {
    const infractores: string[] = [];
    for (const archivo of archivos) {
      const fuente = readFileSync(archivo, "utf-8");
      for (const importe of IMPORTES_PROHIBIDOS) {
        const conGuionBajo = String(importe).replace(/(\d)(\d{3})$/, "$1_$2");
        if (fuente.includes(conGuionBajo)) {
          infractores.push(`${relative(process.cwd(), archivo)}: ${conGuionBajo}`);
        }
      }
    }
    expect(infractores).toEqual([]);
  });
});
