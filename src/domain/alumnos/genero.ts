/**
 * Género del alumno — dato opcional, cargado a mano. No se infiere de nada
 * (nombre, DNI) y nadie está obligado a cargarlo: un alumno sin dato es un
 * estado real, no un error (ver `docs/DECISIONES.md`). Solo dos opciones,
 * a pedido del dueño.
 */
export const GENEROS = ["FEMENINO", "MASCULINO"] as const;

export type Genero = (typeof GENEROS)[number];

export function esGenero(valor: unknown): valor is Genero {
  return typeof valor === "string" && (GENEROS as readonly string[]).includes(valor);
}

const ETIQUETAS: Record<Genero, string> = {
  FEMENINO: "Femenino",
  MASCULINO: "Masculino",
};

export function etiquetaGenero(genero: Genero): string {
  return ETIQUETAS[genero];
}
