import readXlsxFile from "read-excel-file/web-worker";
import { detectarSeparador, parsearCSV } from "@/domain/importacion/csv";
import {
  elegirHoja,
  hojaATexto,
  separarEncabezado,
  type HojaCruda,
  type ValorDeCelda,
} from "@/domain/importacion/planilla";

/**
 * Abre la planilla que eligió el dueño, EN EL NAVEGADOR: nada se sube a
 * ningún lado hasta que confirme la importación (ver asistente.tsx).
 *
 * Acepta .xlsx (Excel, Google Sheets, Numbers) y CSV. El formato se decide
 * por los primeros bytes del archivo, no por la extensión: un .xlsx es un
 * zip ("PK"), un .xls viejo es un documento OLE2, y lo demás se intenta
 * como texto.
 *
 * `read-excel-file/web-worker` es la variante que NO abre Web Workers:
 * la planilla de un gimnasio se lee en milisegundos, y un worker creado
 * desde un blob chocaría con la CSP (`script-src` con nonce, sin `blob:`).
 */

/** Más grande que esto no es un padrón de alumnos: es un error o un zip bomb. */
export const TAMANIO_MAXIMO = 10 * 1024 * 1024;

export interface HojaLeida {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  /** La fila del archivo de cada elemento de `filas`, para que la revisión diga "línea 7" y sea la 7 del Excel. */
  lineas: number[];
}

export type ResultadoDeLectura =
  | {
      ok: true;
      nombre: string;
      formato: "xlsx" | "csv";
      /** Solo en CSV. */
      separador?: string;
      /** Solo las hojas con datos. Un CSV es una sola "hoja". */
      hojas: HojaLeida[];
      /** Cuál mostrar de entrada. */
      hoja: number;
    }
  | { ok: false; error: string };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0];

function empiezaCon(bytes: Uint8Array, firma: number[]): boolean {
  return firma.every((b, i) => bytes[i] === b);
}

const SIN_FILAS = "El archivo no tiene filas de datos, solo el encabezado (o está vacío).";

export async function leerArchivo(file: File): Promise<ResultadoDeLectura> {
  if (file.size > TAMANIO_MAXIMO) {
    return { ok: false, error: "El archivo es demasiado grande para ser un padrón de alumnos (máximo 10 MB)." };
  }

  const cabecera = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  if (empiezaCon(cabecera, OLE2)) {
    return {
      ok: false,
      error: "Es un Excel antiguo (.xls). Abrilo en Excel y guardalo como .xlsx, o exportalo a CSV.",
    };
  }

  if (empiezaCon(cabecera, ZIP)) return leerXlsx(file);
  return leerCsv(file);
}

async function leerXlsx(file: File): Promise<ResultadoDeLectura> {
  let crudas: HojaCruda[];
  try {
    // `parseNumber` devuelve el TEXTO de la celda: un teléfono guardado
    // como número no pasa por un double de JS (ni termina en "5.49e+12").
    const libro = await readXlsxFile(file, { parseNumber: (texto: string) => texto });
    // Los tipos de la librería declaran `typeof Date` (el constructor)
    // donde en ejecución entrega instancias de Date — verificado en
    // tests/domain/importacion/leer-archivo.test.ts.
    crudas = libro.map((h) => ({
      nombre: h.sheet,
      ...hojaATexto(h.data as unknown as ValorDeCelda[][]),
    }));
  } catch {
    return {
      ok: false,
      error: "No pudimos abrir la planilla. Probá guardarla de nuevo como .xlsx desde Excel, o exportarla a CSV.",
    };
  }

  const hojas: HojaLeida[] = [];
  for (const cruda of crudas) {
    const separada = separarEncabezado(cruda.filas, cruda.lineas);
    if (separada) hojas.push({ nombre: cruda.nombre, ...separada });
  }
  if (elegirHoja(crudas) === -1 || hojas.length === 0) return { ok: false, error: SIN_FILAS };

  return { ok: true, nombre: file.name, formato: "xlsx", hojas, hoja: 0 };
}

async function leerCsv(file: File): Promise<ResultadoDeLectura> {
  let texto: string;
  try {
    texto = await file.text();
  } catch {
    return { ok: false, error: "No pudimos leer el archivo. Tiene que ser un .xlsx o un CSV." };
  }

  const separador = detectarSeparador(texto);
  const separada = separarEncabezado(parsearCSV(texto, separador));
  if (!separada) return { ok: false, error: SIN_FILAS };

  return {
    ok: true,
    nombre: file.name,
    formato: "csv",
    separador,
    hojas: [{ nombre: file.name, ...separada }],
    hoja: 0,
  };
}
