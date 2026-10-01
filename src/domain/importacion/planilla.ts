import { CAMPOS, detectarColumnas, type Campo } from "./analisis";

/**
 * DE UNA HOJA DE EXCEL A LAS FILAS DE TEXTO QUE EL ANÁLISIS YA ENTIENDE.
 *
 * Funciones puras: no leen archivos (eso lo hace el componente, con la
 * librería), solo deciden qué significa cada celda y dónde empieza la
 * tabla. Todo termina en `string[][]`, el mismo formato que produce el
 * CSV, para que un .xlsx y un .csv pasen por exactamente el mismo
 * análisis y las mismas reglas.
 */

/** Lo que puede traer una celda leída de un .xlsx. */
export type ValorDeCelda = string | number | boolean | Date | null | undefined;

/** Una hoja ya leída, antes de saber cuál fila es el encabezado. */
export interface HojaCruda {
  nombre: string;
  filas: string[][];
  /** La fila de Excel (desde 1) de cada elemento de `filas`. */
  lineas: number[];
}

/**
 * Una celda como texto.
 *
 *   · Fecha → AAAA-MM-DD, con los componentes UTC: Excel guarda fechas sin
 *     zona horaria y la librería las entrega a medianoche UTC. Leerlas en
 *     la hora local de Argentina las correría un día para atrás.
 *   · Número → el texto tal cual: el lector se configura para entregar el
 *     texto de la celda, así un teléfono de 13 dígitos no termina en
 *     notación científica ni un DNI con decimales.
 */
export function celdaATexto(valor: ValorDeCelda): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return "";
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  return valor;
}

/**
 * Convierte la hoja y descarta las filas totalmente vacías, igual que el
 * parser de CSV: una fila en blanco en el medio de la planilla (separador
 * visual) no es un alumno sin nombre.
 *
 * Pero se acuerda de en qué fila de Excel estaba cada una: cuando la
 * revisión dice "línea 7", quien corrige la planilla tiene que encontrar a
 * esa persona en la fila 7 de su Excel, no en la que quedaría después de
 * sacar el título y los renglones vacíos.
 */
export function hojaATexto(filas: readonly (readonly ValorDeCelda[])[]): {
  filas: string[][];
  lineas: number[];
} {
  const salida: string[][] = [];
  const lineas: number[] = [];
  filas.forEach((fila, indice) => {
    const texto = fila.map(celdaATexto);
    if (texto.some((celda) => celda.trim() !== "")) {
      salida.push(texto);
      lineas.push(indice + 1);
    }
  });
  return { filas: salida, lineas };
}

/** Hasta qué fila se busca el encabezado: un título arriba, no una tabla entera. */
const FILAS_DONDE_BUSCAR_ENCABEZADO = 10;

/**
 * Separa el encabezado de los datos.
 *
 * El encabezado no es siempre la primera fila: una planilla hecha a mano
 * suele tener un título ("Padrón 2026") arriba de la tabla. Se elige, entre
 * las primeras filas, la que nombra más columnas conocidas (las mismas que
 * reconoce el mapeo de columnas); lo que queda arriba se descarta. Si
 * ninguna nombra nada conocido, el encabezado es la primera fila — y el
 * mapeo se corrige a mano en la pantalla siguiente, como siempre.
 *
 * `lineas` dice en qué fila del archivo estaba cada una (por defecto, la
 * posición: sirve para un CSV, donde las filas vacías ya se descartaron).
 *
 * Devuelve null si no queda ninguna fila de datos.
 */
export function separarEncabezado(
  filas: readonly string[][],
  lineas: readonly number[] = filas.map((_, i) => i + 1),
): { encabezados: string[]; filas: string[][]; lineas: number[] } | null {
  let mejor = 0;
  let mejorPuntaje = 0;
  const limite = Math.min(filas.length, FILAS_DONDE_BUSCAR_ENCABEZADO);
  for (let i = 0; i < limite; i++) {
    const asignacion = detectarColumnas(filas[i]!);
    const puntaje = CAMPOS.filter((campo) => asignacion[campo] !== -1).length;
    if (puntaje > mejorPuntaje) {
      mejor = i;
      mejorPuntaje = puntaje;
    }
  }

  const datos = filas.slice(mejor + 1);
  if (filas.length === 0 || datos.length === 0) return null;
  return { encabezados: filas[mejor]!, filas: datos, lineas: lineas.slice(mejor + 1) };
}

/**
 * Qué hoja abrir de entrada: la primera que tiene al menos una fila de
 * datos debajo del encabezado. Muchos libros arrancan con una portada o
 * una hoja vacía. -1 si ninguna tiene datos.
 */
export function elegirHoja(hojas: readonly HojaCruda[]): number {
  return hojas.findIndex((h) => separarEncabezado(h.filas, h.lineas) !== null);
}

/**
 * Lo que viaja al servidor al confirmar la importación: cada fila con SOLO
 * las columnas que el mapeo usa (no el importe, no lo que no se mapeó: no
 * hace falta para crear un alumno y no tiene por qué salir de la máquina),
 * y el mapeo traducido a esas posiciones.
 *
 * El mapeo viaja junto con las filas porque cambia lo que significa una
 * celda — nombre y apellido en la misma columna se separan por la coma —,
 * y el servidor tiene que analizar EXACTAMENTE lo mismo que vio la vista
 * previa (ver el test "idéntico al de la vista previa").
 */
export function recortarAColumnasUsadas(
  filas: readonly (readonly string[])[],
  columnas: Readonly<Record<Campo, number>>,
): { filas: string[][]; columnas: Record<Campo, number> } {
  const usadas = [...new Set(CAMPOS.map((c) => columnas[c]).filter((i) => i >= 0))].sort((a, b) => a - b);
  const posicion = new Map(usadas.map((original, nueva) => [original, nueva]));
  return {
    filas: filas.map((fila) => usadas.map((i) => fila[i] ?? "")),
    columnas: Object.fromEntries(
      CAMPOS.map((c) => [c, columnas[c] >= 0 ? posicion.get(columnas[c])! : -1]),
    ) as Record<Campo, number>,
  };
}
