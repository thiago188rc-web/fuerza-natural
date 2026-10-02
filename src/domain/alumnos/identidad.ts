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

/**
 * Un número argentino escrito como se escribe acá ("2804001234",
 * "0280 4001234") → E.164 de celular (+549…).
 *
 * Solo para un gimnasio que está en Argentina: ahí el país NO se adivina,
 * es el del gimnasio. Lo que sí sería adivinar es el resto, así que la
 * regla acepta únicamente la forma inequívoca:
 *
 *  · 10 dígitos (característica sin 0 + número, sin 15) → +549 + dígitos.
 *    El 9 es el de celular, que es lo que el gimnasio usa (WhatsApp).
 *  · 11 dígitos empezando con 0 → se saca el 0 de la característica.
 *  · Ya viene con 54 adelante (12 o 13 dígitos) → se respeta.
 *
 * Cualquier otra cosa (9 dígitos, 11 sin 0, el 15 metido en el medio)
 * devuelve null: un número con un dígito de menos no se completa.
 */
export function telefonoArgentino(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (/^549\d{10}$/.test(digitos)) return `+${digitos}`;
  if (/^54\d{10}$/.test(digitos)) return `+549${digitos.slice(2)}`;
  if (/^0\d{10}$/.test(digitos)) return `+549${digitos.slice(1)}`;
  if (/^[1-9]\d{9}$/.test(digitos)) return `+549${digitos}`;
  return null;
}

/** Si el gimnasio está en Argentina (lo dice su zona horaria). */
export function esGimnasioArgentino(timezone: string): boolean {
  return timezone.startsWith("America/Argentina/");
}

export function nombreCompleto(nombre: string, apellido: string): string {
  return `${nombre} ${apellido}`.trim();
}
