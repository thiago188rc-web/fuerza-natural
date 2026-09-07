/**
 * IDENTIDAD DEL ALUMNO — normalización, no fusión.
 *
 * El Data Discovery encontró nombres con espacios de más, diferencias de
 * formato, errores de tipeo y problemas de encoding. La conclusión de
 * producto fue: **el identificador es el `id`, nunca nombre+apellido**, y
 * el teléfono no se asume único (Fase 0 no le puso índice único, y hay
 * familias que comparten número).
 *
 * Este módulo hace lo mínimo y verificable: limpiar lo que es
 * inequívocamente ruido (espacios). NO cambia mayúsculas/minúsculas: en
 * apellidos reales ("de la Cruz", "MacLeod") cualquier regla automática
 * de capitalización se equivoca, y equivocarse escribiendo el nombre de
 * una persona es peor que dejar lo que el dueño tipeó.
 *
 * La detección/fusión de personas duplicadas es de Migración (Fase 5), y
 * no vive acá.
 */

/** Colapsa espacios internos y recorta los de los extremos. */
export function normalizarTexto(valor: string): string {
  return valor.trim().replace(/\s+/g, " ");
}

/**
 * Limpia separadores de tipeo del teléfono (espacios, guiones, paréntesis,
 * puntos) sin intentar adivinar prefijo de país: convertir "1155551234" a
 * E.164 exige saber de qué país es, y suponerlo es inventar un dato. La
 * validación de formato la hace Zod, y el CHECK de la base es la última
 * palabra.
 */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/[\s().-]/g, "");
}

export function nombreCompleto(nombre: string, apellido: string): string {
  return `${nombre} ${apellido}`.trim();
}
