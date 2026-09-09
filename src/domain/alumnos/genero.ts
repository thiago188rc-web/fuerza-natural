/**
 * Género del alumno — dato opcional, cargado a mano. No se infiere de nada
 * (nombre, DNI) y nadie está obligado a cargarlo: un alumno sin dato es un
 * estado real, no un error (ver `docs/DECISIONES.md`).
 */
export const GENEROS = ["FEMENINO", "MASCULINO", "OTRO", "PREFIERO_NO_DECIR"] as const;

export type Genero = (typeof GENEROS)[number];

export function esGenero(valor: unknown): valor is Genero {
  return typeof valor === "string" && (GENEROS as readonly string[]).includes(valor);
}

const ETIQUETAS: Record<Genero, string> = {
  FEMENINO: "Femenino",
  MASCULINO: "Masculino",
  OTRO: "Otro",
  PREFIERO_NO_DECIR: "Prefiero no decir",
};

export function etiquetaGenero(genero: Genero): string {
  return ETIQUETAS[genero];
}
