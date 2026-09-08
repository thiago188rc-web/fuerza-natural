/**
 * Lectura de CSV, como función pura.
 *
 * No usa una librería por una razón concreta: lo que llega de un gimnasio
 * real es una planilla exportada a mano, con separador `;` o `,` según la
 * configuración regional de Windows, comillas a veces sí y a veces no, y
 * saltos de línea adentro de las celdas de observaciones. Un parser de 60
 * líneas que contempla exactamente eso es más fácil de auditar que una
 * dependencia con cincuenta opciones.
 *
 * Sigue RFC 4180 en lo que importa: comillas dobles para escapar, `""`
 * para una comilla literal, y saltos de línea permitidos dentro de campos
 * entrecomillados.
 */

/**
 * Adivina el separador contando cuántas veces aparece cada candidato fuera
 * de comillas en las primeras líneas. Gana el más frecuente y consistente.
 */
export function detectarSeparador(texto: string): string {
  const candidatos = [";", ",", "\t", "|"];
  const muestra = texto.slice(0, 8000);

  let mejor = ",";
  let mejorPuntaje = -1;

  for (const separador of candidatos) {
    const filas = parsearCSV(muestra, separador).slice(0, 10);
    if (filas.length === 0) continue;

    const anchos = filas.map((f) => f.length);
    const maximo = Math.max(...anchos);
    if (maximo < 2) continue;

    // Un buen separador produce filas del MISMO ancho. Uno malo produce
    // una sola columna, o anchos que bailan.
    const consistentes = anchos.filter((a) => a === maximo).length / anchos.length;
    const puntaje = maximo * consistentes;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = separador;
    }
  }

  return mejor;
}

export function parsearCSV(texto: string, separador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  // El BOM que Excel escribe al frente rompe la comparación del primer
  // encabezado si no se saca.
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;

  for (let i = 0; i < contenido.length; i++) {
    const caracter = contenido[i];

    if (entreComillas) {
      if (caracter === '"') {
        if (contenido[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === separador) {
      fila.push(celda);
      celda = "";
    } else if (caracter === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else if (caracter === "\r") {
      // Se ignora: el \n que viene después cierra la fila.
    } else {
      celda += caracter;
    }
  }

  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }

  // Las filas totalmente vacías (la última línea del archivo, casi
  // siempre) no son datos.
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}
