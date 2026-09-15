/**
 * Disciplina que practica el alumno — dato opcional, cargado a mano. Igual
 * que género: nadie está obligado a cargarlo, un alumno sin dato queda
 * "sin especificar", nunca se infiere.
 */
export const DISCIPLINAS = ["MUSCULACION", "CALISTENIA"] as const;

export type Disciplina = (typeof DISCIPLINAS)[number];

export function esDisciplina(valor: unknown): valor is Disciplina {
  return typeof valor === "string" && (DISCIPLINAS as readonly string[]).includes(valor);
}

const ETIQUETAS: Record<Disciplina, string> = {
  MUSCULACION: "Musculación",
  CALISTENIA: "Calistenia",
};

export function etiquetaDisciplina(disciplina: Disciplina): string {
  return ETIQUETAS[disciplina];
}
