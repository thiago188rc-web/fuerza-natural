import { distribucion, type SegmentoDistribucion } from "./demografia";

/**
 * Frecuencia semanal de uso — pura, sin I/O. "Veces por semana" es un
 * PROMEDIO del período mostrado (confirmado): total de asistencias del
 * alumno en el rango, dividido las semanas que tiene ese rango, redondeado
 * al entero más cercano. No es la semana más reciente ni una fórmula de
 * "asistencia esperada" — ver docs/REGLAS-DE-NEGOCIO.md sobre no inventar
 * ese tipo de cálculo.
 */

/** 0 a 7: el gimnasio no puede abrir más días que la semana tiene. */
const CLAVES_FRECUENCIA = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;

function etiquetaFrecuencia(veces: string): string {
  if (veces === "0") return "No vino";
  return `${veces} ${veces === "1" ? "vez" : "veces"} por semana`;
}

/**
 * @param visitasPorAlumno Total de asistencias en el rango, una entrada por alumno activo (0 si no vino nunca).
 * @param diasDelPeriodo Cuántos días abarca el rango que se está mirando (para convertir el total en un promedio semanal).
 */
export function distribucionPorFrecuencia(
  visitasPorAlumno: readonly number[],
  diasDelPeriodo: number,
): SegmentoDistribucion[] {
  const semanas = Math.max(diasDelPeriodo / 7, 1 / 7);
  const valores = visitasPorAlumno.map((visitas) => {
    const promedio = Math.round(visitas / semanas);
    const acotado = Math.min(7, Math.max(0, promedio));
    return String(acotado) as (typeof CLAVES_FRECUENCIA)[number];
  });
  return distribucion(valores, CLAVES_FRECUENCIA, etiquetaFrecuencia);
}
