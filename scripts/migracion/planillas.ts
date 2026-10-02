import readXlsxFile from "read-excel-file/node";
import { normalizarTexto } from "@/domain/alumnos/identidad";
import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";

/**
 * LECTURA DE LAS DOS PLANILLAS DEL GIMNASIO — para la migración inicial
 * (ver migrar-planillas.ts). Solo lee y estructura; no decide nada.
 *
 *  · "BASE DE DATOS GYM.xlsx": una hoja por grupo de letras (A-B, C-D…),
 *    todas con el mismo encabezado en la fila 2. La fecha de nacimiento
 *    ocupa TRES celdas (día, mes, año) bajo un único "FECHA NAC".
 *  · "CONTROL CUOTA GYM - 2026.xlsx": una hoja por mes con los pagos en
 *    las columnas B-G, más paneles al costado (resumen, calistenia) que
 *    NO son pagos del gimnasio y se ignoran.
 */

type Celda = string | number | boolean | Date | null;

export interface PersonaDeBase {
  hoja: string;
  /** Fila del Excel (1 = primera fila de la hoja). */
  linea: number;
  completo: string;
  dni: string | null;
  /** Las tres celdas de FECHA NAC, tal cual. */
  nacimiento: { dia: string; mes: string; anio: string };
  direccion: string | null;
  telefono: string | null;
  comoConocio: string | null;
  /** INICIO: ISO si la celda era una fecha de Excel; si no, el texto crudo. */
  inicio: { iso: string | null; crudo: string };
}

export interface PagoDePlanilla {
  hoja: string;
  linea: number;
  /** Mes al que corresponde la hoja (AAAA-MM-01). */
  mesDeHoja: string;
  nombre: string;
  /** Fecha del pago corregida (ver `corregirAnio`), o null si no hay fecha. */
  fecha: string | null;
  fechaCruda: string;
  dias: string;
  valor: string;
  /** La columna NUEVOS: un número cuando el dueño lo contó como alta o vuelta. */
  nuevos: string;
}

function texto(c: Celda | undefined): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return normalizarTexto(String(c));
}

function clave(c: Celda | undefined): string {
  return normalizarTerminoBusqueda(texto(c));
}

async function leerLibro(ruta: string) {
  const libro = await readXlsxFile(ruta, { parseNumber: (t: string) => t });
  // Los tipos de la librería declaran `typeof Date`; en ejecución son
  // instancias (ver src/components/features/importacion/leer-archivo.ts).
  return libro.map((h) => ({ hoja: h.sheet, filas: h.data as unknown as Celda[][] }));
}

export async function leerBaseGeneral(ruta: string): Promise<PersonaDeBase[]> {
  const personas: PersonaDeBase[] = [];
  for (const { hoja, filas } of await leerLibro(ruta)) {
    const iEnc = filas.findIndex((f) => f.some((c) => clave(c) === "apellido y nombre"));
    if (iEnc === -1) continue;
    const enc = filas[iEnc].map(clave);
    const col = (nombre: string) => enc.findIndex((h) => h === nombre);
    const cNombre = col("apellido y nombre");
    const cDni = col("dni");
    const cNac = col("fecha nac");
    const cDir = col("direccion");
    const cTel = col("num tel");
    const cComo = col("como conocio el gym");
    const cInicio = col("inicio");

    for (let i = iEnc + 1; i < filas.length; i++) {
      const f = filas[i];
      const completo = texto(f[cNombre]);
      if (!completo) continue;
      const inicioCelda = cInicio >= 0 ? f[cInicio] : null;
      personas.push({
        hoja,
        linea: i + 1,
        completo,
        dni: texto(f[cDni]) || null,
        nacimiento:
          cNac >= 0
            ? { dia: texto(f[cNac]), mes: texto(f[cNac + 1]), anio: texto(f[cNac + 2]) }
            : { dia: "", mes: "", anio: "" },
        direccion: cDir >= 0 ? texto(f[cDir]) || null : null,
        telefono: cTel >= 0 ? texto(f[cTel]) || null : null,
        comoConocio: cComo >= 0 ? texto(f[cComo]) || null : null,
        inicio: {
          iso: inicioCelda instanceof Date ? inicioCelda.toISOString().slice(0, 10) : null,
          crudo: texto(inicioCelda),
        },
      });
    }
  }
  return personas;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, sept: 9, setiembre: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

/**
 * "1-Jan" tipeado en diciembre queda guardado por Excel como 1/1 del año
 * EN CURSO al tipearlo (2025) aunque la hoja sea de enero 2026. Solo se
 * corrige ese caso exacto: mismo mes que la hoja, un año antes.
 */
export function corregirAnio(iso: string, mesDeHoja: string): string {
  const [anio, mes] = iso.split("-");
  const [anioHoja, mesHoja] = mesDeHoja.split("-");
  if (mes === mesHoja && Number(anio) === Number(anioHoja) - 1) return `${anioHoja}${iso.slice(4)}`;
  return iso;
}

export async function leerControlDeCuotas(ruta: string, anio: number): Promise<{
  pagos: PagoDePlanilla[];
  bajasPorMes: Map<string, string[]>;
}> {
  const pagos: PagoDePlanilla[] = [];
  const bajasPorMes = new Map<string, string[]>();

  for (const { hoja, filas } of await leerLibro(ruta)) {
    const nombreHoja = normalizarTerminoBusqueda(hoja);

    if (nombreHoja === "bajas" || nombreHoja === "dejaron") {
      const enc = filas[0] ?? [];
      enc.forEach((c, j) => {
        const mes = MESES[clave(c)];
        if (!mes) return;
        const nombres = filas
          .slice(1)
          .map((f) => texto(f[j]))
          .filter((n) => n && /[a-z]/i.test(n) && !/hombres|mujeres/i.test(n));
        bajasPorMes.set(`${anio}-${String(mes).padStart(2, "0")}-01`, nombres);
      });
      continue;
    }

    const mes = MESES[nombreHoja];
    if (!mes) continue;
    const mesDeHoja = `${anio}-${String(mes).padStart(2, "0")}-01`;

    const iEnc = filas.findIndex((f) => clave(f[1]) === "nombre y apellido");
    if (iEnc === -1) continue;

    for (let i = iEnc + 1; i < filas.length; i++) {
      const f = filas[i];
      const nombre = texto(f[1]);
      if (!nombre || !/[a-z]/i.test(nombre)) continue;
      const fechaCelda = f[2];
      const fecha = fechaCelda instanceof Date ? corregirAnio(fechaCelda.toISOString().slice(0, 10), mesDeHoja) : null;
      pagos.push({
        hoja,
        linea: i + 1,
        mesDeHoja,
        nombre,
        fecha,
        fechaCruda: texto(fechaCelda),
        dias: texto(f[3]),
        valor: texto(f[4]),
        nuevos: texto(f[5]),
      });
    }
  }

  return { pagos, bajasPorMes };
}
