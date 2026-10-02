import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";

/**
 * CÓMO CONOCIÓ EL GIMNASIO — el canal por el que llegó cada alumno.
 *
 * Es un catálogo CERRADO a propósito: el dato existe para contarlo (la
 * torta de Métricas), y un texto libre ("recomendacion", "RECOMENDACIÓN",
 * "por una amiga") se parte en diez porciones que son la misma. Una persona
 * puede marcar más de una opción: la base del gimnasio tiene
 * "RECOMENDACIÓN/VIVE CERCA", y quedarse con una sola sería tirar la otra.
 */
export const CANALES = ["RECOMENDACION", "VIVE_CERCA", "REDES_SOCIALES", "YA_VENIA", "OTRO"] as const;

export type Canal = (typeof CANALES)[number];

const ETIQUETAS: Record<Canal, string> = {
  RECOMENDACION: "Recomendación",
  VIVE_CERCA: "Vive cerca",
  REDES_SOCIALES: "Redes sociales",
  YA_VENIA: "Ya venía antes",
  OTRO: "Otro",
};

export function esCanal(valor: unknown): valor is Canal {
  return typeof valor === "string" && (CANALES as readonly string[]).includes(valor);
}

export function etiquetaCanal(canal: Canal): string {
  return ETIQUETAS[canal];
}

/** Deja solo canales válidos, sin repetir, en el orden del catálogo. */
export function ordenarCanales(canales: readonly string[]): Canal[] {
  return CANALES.filter((c) => canales.includes(c));
}

/**
 * Una parte del texto de la planilla → su canal. Tolera los tipeos reales
 * de la base ("RECOMEMDACION", "RECOENDACION", "VICE CERCA") porque cada
 * regla mira la raíz de la palabra, no la palabra exacta.
 */
function canalDeParte(parte: string): Canal | null {
  const p = parte.trim();
  if (!p || /^[/\\\-_.\s]+$/.test(p)) return null;
  if (/^reco/.test(p) || /recomend/.test(p) || /amig|conocid|familiar|boca/.test(p)) return "RECOMENDACION";
  if (/cerca|barrio|zona|vecin/.test(p)) return "VIVE_CERCA";
  if (/red(es)? ?soc|instagram|insta\b|facebook|tik ?tok|^redes?$|google|internet|web/.test(p)) return "REDES_SOCIALES";
  if (/(venia|iba|ya vino|volvio|antes)/.test(p)) return "YA_VENIA";
  return "OTRO";
}

/**
 * El texto de una celda ("RECOMENDACIÓN/VIVE CERCA") → los canales que
 * nombra. `null` cuando la celda está vacía o es solo relleno ("/////"):
 * eso es "sin dato", no "otro".
 */
export function leerComoConocio(texto: string | null | undefined): Canal[] | null {
  if (!texto) return null;
  const normalizado = normalizarTerminoBusqueda(texto);
  const partes = normalizado.split(/[/,;+]| y | - /);
  const canales = partes.map(canalDeParte).filter((c): c is Canal => c !== null);
  if (canales.length === 0) return null;
  return ordenarCanales(canales);
}
