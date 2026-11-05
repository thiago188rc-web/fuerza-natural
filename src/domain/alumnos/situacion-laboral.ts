/**
 * DÓNDE TRABAJA O CUÁL ES SU SITUACIÓN — dato opcional de la ficha.
 *
 * Dos partes, a propósito:
 *
 *   · una categoría de un catálogo CERRADO (sector privado, sector
 *     público, jubilado/a, estudiante, otro), para poder contarla sin que
 *     "municipalidad", "Municipalidad" y "muni" sean tres cosas distintas;
 *   · un detalle en texto libre ("Registro Civil", "Comercio", el nombre
 *     de la escuela), que es lo que el dueño realmente quiere recordar.
 *
 * Ninguna es obligatoria y ninguna depende de la otra: un alumno que no
 * quiere decirlo queda "sin dato", nunca se infiere.
 */
export const SITUACIONES_LABORALES = [
  "SECTOR_PRIVADO",
  "SECTOR_PUBLICO",
  "JUBILADO",
  "ESTUDIANTE",
  "OTRO",
] as const;

export type SituacionLaboral = (typeof SITUACIONES_LABORALES)[number];

/** Largo máximo del detalle. Mismo valor que el CHECK de la base. */
export const LARGO_DETALLE_LABORAL = 120;

const ETIQUETAS: Record<SituacionLaboral, string> = {
  SECTOR_PRIVADO: "Sector privado",
  SECTOR_PUBLICO: "Sector público",
  JUBILADO: "Jubilado/a",
  ESTUDIANTE: "Estudiante",
  OTRO: "Otro",
};

/** El ejemplo del campo de detalle, según lo elegido. */
const EJEMPLOS_DE_DETALLE: Record<SituacionLaboral, string> = {
  SECTOR_PRIVADO: "Empresa o comercio donde trabaja",
  SECTOR_PUBLICO: "Organismo, ej: Municipalidad, Registro Civil",
  JUBILADO: "Opcional, ej: docente jubilado",
  ESTUDIANTE: "Institución educativa",
  OTRO: "Contá su situación",
};

export function esSituacionLaboral(valor: unknown): valor is SituacionLaboral {
  return typeof valor === "string" && (SITUACIONES_LABORALES as readonly string[]).includes(valor);
}

export function etiquetaSituacionLaboral(situacion: SituacionLaboral): string {
  return ETIQUETAS[situacion];
}

export function ejemploDeDetalleLaboral(situacion: SituacionLaboral | null): string {
  return situacion ? EJEMPLOS_DE_DETALLE[situacion] : "Dónde trabaja o estudia";
}

/** "Sector público · Municipalidad", "Estudiante", "Registro Civil" o null. */
export function resumenLaboral(
  situacion: string | null | undefined,
  detalle: string | null | undefined,
): string | null {
  const partes = [esSituacionLaboral(situacion) ? ETIQUETAS[situacion] : null, detalle?.trim() || null];
  const conDato = partes.filter((p): p is string => p !== null);
  return conDato.length > 0 ? conDato.join(" · ") : null;
}
