/**
 * Normaliza el término que tipea el dueño para que compare contra
 * `app.students.nombre_busqueda`, que la base genera como
 * `public.immutable_unaccent(lower(nombre || ' ' || apellido))`.
 *
 * Las dos normalizaciones tienen que coincidir o la búsqueda miente:
 * buscar "gomez" no encontraría a "Gómez". Acá se hace en JavaScript puro
 * (NFD + descarte de diacríticos) en vez de mandar `unaccent()` en la
 * consulta, porque así el término normalizado viaja como parámetro
 * bindeado y el índice GIN de trigramas sigue siendo usable.
 */
export function normalizarTerminoBusqueda(termino: string): string {
  return termino
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Escapa los comodines de LIKE (`%`, `_`) y la barra de escape, para que
 * un alumno buscado como "100%" no termine matcheando a todos. El
 * repositorio usa este resultado con `ESCAPE '\'`.
 */
export function escaparComodinesLike(termino: string): string {
  return termino.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}
