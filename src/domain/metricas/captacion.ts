import { CANALES, esCanal, etiquetaCanal, type Canal } from "@/domain/alumnos/como-conocio";

/**
 * CAPTACIÓN — cómo llegan los alumnos y en qué época del año empiezan.
 * Pura, sin I/O: el repositorio trae la lista, esto la cuenta.
 *
 * Se calcula sobre TODOS los alumnos que pasaron por el gimnasio (activos
 * y de baja), no solo sobre los de hoy: la pregunta del dueño es "cómo nos
 * conoce la gente y si hay meses mejores para captar", y para eso sirve
 * toda la historia, no la foto del mes.
 */

/** Una persona que marcó más de un canal es su propia porción: repartirla entre dos inflaría el total. */
export type ClaveDeCanal = Canal | "VARIOS";

const CLAVES: readonly ClaveDeCanal[] = [...CANALES, "VARIOS"];

export interface SegmentoDeCanal {
  clave: ClaveDeCanal;
  etiqueta: string;
  cantidad: number;
  /** 0 a 100, sobre las personas CON dato. */
  porcentaje: number;
}

export interface CaptacionPorCanal {
  segmentos: SegmentoDeCanal[];
  conDato: number;
  sinDato: number;
}

export function claveDeCanal(comoConocio: readonly string[] | null): ClaveDeCanal | null {
  const validos = (comoConocio ?? []).filter(esCanal);
  if (validos.length === 0) return null;
  if (validos.length > 1) return "VARIOS";
  return validos[0];
}

export function etiquetaClaveDeCanal(clave: ClaveDeCanal): string {
  return clave === "VARIOS" ? "Más de una" : etiquetaCanal(clave);
}

export function captacionPorCanal(
  alumnos: readonly { comoConocio: readonly string[] | null }[],
): CaptacionPorCanal {
  const conteo = new Map<ClaveDeCanal, number>();
  let sinDato = 0;
  for (const a of alumnos) {
    const clave = claveDeCanal(a.comoConocio);
    if (clave === null) sinDato++;
    else conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  const conDato = alumnos.length - sinDato;

  // Porcentajes que suman exactamente 100 (método del mayor resto): una
  // torta cuyos números suman 99 o 101 es una torta en la que no se confía.
  const exactos = CLAVES.map((clave) => ({ clave, cantidad: conteo.get(clave) ?? 0 })).filter((s) => s.cantidad > 0);
  const base = exactos.map((s) => {
    const exacto = conDato === 0 ? 0 : (s.cantidad / conDato) * 100;
    return { ...s, entero: Math.floor(exacto), resto: exacto - Math.floor(exacto) };
  });
  let faltan = conDato === 0 ? 0 : 100 - base.reduce((suma, s) => suma + s.entero, 0);
  for (const s of [...base].sort((x, y) => y.resto - x.resto)) {
    if (faltan <= 0) break;
    s.entero++;
    faltan--;
  }

  return {
    segmentos: base.map((s) => ({
      clave: s.clave,
      etiqueta: etiquetaClaveDeCanal(s.clave),
      cantidad: s.cantidad,
      porcentaje: s.entero,
    })),
    conDato,
    sinDato,
  };
}

export interface InicioDelMes {
  /** 1 = enero … 12 = diciembre. */
  mes: number;
  total: number;
  porCanal: { clave: ClaveDeCanal | "SIN_DATO"; cantidad: number }[];
}

export interface IniciosPorMes {
  meses: InicioDelMes[];
  /** Los años que abarca la cuenta (para decir "entre 2022 y 2026"). */
  desdeAnio: number | null;
  hastaAnio: number | null;
  total: number;
}

/**
 * Cuántas personas EMPEZARON en cada mes del calendario, sumando todos los
 * años (todos los eneros juntos, todos los febreros…) y abiertas por canal.
 * Es la forma de ver estacionalidad con pocos años de datos: un mes que
 * se repite alto año tras año se nota acá aunque cada año por separado
 * tenga pocos casos.
 */
export function iniciosPorMesDelAnio(
  alumnos: readonly { fechaAltaOriginal: string; comoConocio: readonly string[] | null }[],
): IniciosPorMes {
  const meses: InicioDelMes[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, total: 0, porCanal: [] }));
  const conteo = new Map<string, number>();
  let desdeAnio: number | null = null;
  let hastaAnio: number | null = null;

  for (const a of alumnos) {
    const anio = Number(a.fechaAltaOriginal.slice(0, 4));
    const mes = Number(a.fechaAltaOriginal.slice(5, 7));
    if (!anio || mes < 1 || mes > 12) continue;
    desdeAnio = desdeAnio === null ? anio : Math.min(desdeAnio, anio);
    hastaAnio = hastaAnio === null ? anio : Math.max(hastaAnio, anio);
    const clave = claveDeCanal(a.comoConocio) ?? "SIN_DATO";
    meses[mes - 1].total++;
    conteo.set(`${mes}:${clave}`, (conteo.get(`${mes}:${clave}`) ?? 0) + 1);
  }

  for (const m of meses) {
    m.porCanal = [...CLAVES, "SIN_DATO" as const]
      .map((clave) => ({ clave, cantidad: conteo.get(`${m.mes}:${clave}`) ?? 0 }))
      .filter((c) => c.cantidad > 0);
  }

  return { meses, desdeAnio, hastaAnio, total: meses.reduce((s, m) => s + m.total, 0) };
}
