import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";

/**
 * EMPAREJAR NOMBRES ENTRE PLANILLAS — la planilla de cuotas escribe a la
 * misma persona como la escribió quien cobró ese día ("ROMERO, FEDE",
 * "CARLOS QUIROZ", "BALMACEA, RODRIGO"), y la base general como quedó en la
 * ficha ("ROMERO, FEDERICO", "QUIROZ, CARLOS", "BALMACEDA, RODRIGO").
 *
 * Reglas, de más a menos estrictas, y SIEMPRE con candidato único: si dos
 * personas de la base califican igual de bien, no se elige ninguna — el
 * caso va al reporte para que lo resuelva un humano. Un pago imputado a la
 * persona equivocada es peor que un pago que pide revisión.
 */

export interface NombreSeparado {
  apellido: string;
  nombre: string;
}

/** "APELLIDO, NOMBRE" (o "APELLIDO. NOMBRE", un tipeo real) → partes normalizadas. */
export function separarConComa(completo: string): NombreSeparado | null {
  const limpio = normalizarTerminoBusqueda(completo).replace(/\.\s/, ", ");
  const coma = limpio.indexOf(",");
  if (coma === -1) return null;
  const apellido = limpio.slice(0, coma).replace(/[^a-z ]/g, "").trim().replace(/\s+/g, " ");
  const nombre = limpio.slice(coma + 1).replace(/[^a-z ]/g, "").trim().replace(/\s+/g, " ");
  if (!apellido || !nombre) return null;
  return { apellido, nombre };
}

/**
 * Un nombre de la BASE GENERAL. La columna se llama "APELLIDO Y NOMBRE",
 * así que cuando falta la coma ("PASIAN DANILO") la primera palabra es el
 * apellido: acá el orden no se adivina, lo dice el encabezado.
 */
export function separarDeBase(completo: string): NombreSeparado | null {
  const conComa = separarConComa(completo);
  if (conComa) return conComa;
  const partes = normalizarTerminoBusqueda(completo).replace(/[^a-z ]/g, "").trim().split(/\s+/);
  if (partes.length < 2) return null;
  return { apellido: partes[0], nombre: partes.slice(1).join(" ") };
}

/**
 * Las lecturas posibles de un nombre. Con coma hay una sola. Sin coma
 * ("CARLOS QUIROZ", "HANSEN LUCAS") no se sabe el orden, así que se
 * prueban las dos: el nombre primero o el apellido primero.
 */
export function lecturasPosibles(completo: string): NombreSeparado[] {
  const conComa = separarConComa(completo);
  // "CARLOS, QUIROZ": la coma también se escribe al revés alguna vez.
  if (conComa) return [conComa, { apellido: conComa.nombre, nombre: conComa.apellido }];
  const partes = normalizarTerminoBusqueda(completo).replace(/[^a-z ]/g, "").trim().split(/\s+/);
  if (partes.length < 2) return [];
  return [
    { apellido: partes.slice(0, -1).join(" "), nombre: partes[partes.length - 1] },
    { apellido: partes.slice(1).join(" "), nombre: partes[0] },
  ];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previa[0];
    previa[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = previa[j];
      previa[j] = Math.min(previa[j] + 1, previa[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return previa[b.length];
}

/** Errores de tipeo tolerables según el largo: más largo, más margen. */
function parecidos(a: string, b: string): boolean {
  const corto = Math.min(a.length, b.length);
  const d = levenshtein(a, b);
  return d === 0 || (corto >= 4 && d <= 1) || (corto >= 7 && d <= 2);
}

/** Apodos de la planilla que no son un prefijo del nombre. */
const APODOS: Record<string, string[]> = {
  vico: ["victorio"],
  vito: ["victorio"],
  juanse: ["juan"],
  marianela: ["maria nelida", "marianela"],
  pegu: ["pehuen"],
  stella: ["estela"],
  estela: ["stella"],
};

function nombreCompatible(planilla: string, base: string): 0 | 1 | 2 | 3 {
  if (planilla === base) return 3;
  const p = planilla.split(" ")[0];
  const b = base.split(" ")[0];
  if (p === b) return 2;
  if (APODOS[planilla]?.includes(base) || APODOS[p]?.includes(b)) return 2;
  if (p.length >= 3 && (b.startsWith(p) || p.startsWith(b))) return 1;
  // "EUGENIA" en la planilla, "MARIA EUGENIA" en la ficha.
  if (planilla.length >= 4 && base.split(" ").includes(planilla)) return 1;
  if (parecidos(p, b) || parecidos(planilla.replace(/ /g, ""), base.replace(/ /g, ""))) return 1;
  // Nombres cortos con una letra de diferencia ("EMA" / "EMMA").
  if (Math.min(p.length, b.length) >= 3 && levenshtein(p, b) === 1 && p[0] === b[0]) return 1;
  return 0;
}

function apellidoCompatible(planilla: string, base: string): 0 | 1 | 2 {
  if (planilla === base) return 2;
  const sinEspacios = (s: string) => s.replace(/ /g, "");
  if (sinEspacios(planilla) === sinEspacios(base)) return 2;
  if (parecidos(sinEspacios(planilla), sinEspacios(base))) return 1;
  // "FERNANDEZ VAI" en la base y "FERNANDEZ" en la planilla.
  const p = planilla.split(" ");
  const b = base.split(" ");
  if (p[0] === b[0] && (p.length === 1 || b.length === 1)) return 1;
  return 0;
}

export type Emparejamiento<T> =
  | { tipo: "UNICO"; persona: T; puntaje: number }
  | { tipo: "AMBIGUO"; candidatos: T[] }
  | { tipo: "NINGUNO" };

/**
 * Busca en `base` a la persona que la planilla llama `completo`. Exige
 * apellido Y nombre compatibles; con un solo apellido parecido (y no
 * idéntico) además pide que el nombre coincida bien, para no confundir a
 * dos hermanos.
 */
export function emparejar<T>(
  completo: string,
  base: readonly T[],
  separado: (persona: T) => NombreSeparado | null,
): Emparejamiento<T> {
  let mejor = 0;
  let candidatos: T[] = [];
  for (const lectura of lecturasPosibles(completo)) {
    for (const persona of base) {
      const suyo = separado(persona);
      if (!suyo) continue;
      const ap = apellidoCompatible(lectura.apellido, suyo.apellido);
      if (ap === 0) continue;
      const no = nombreCompatible(lectura.nombre, suyo.nombre);
      if (no === 0 || (ap === 1 && no < 2)) continue;
      const puntaje = ap * 10 + no;
      if (puntaje > mejor) {
        mejor = puntaje;
        candidatos = [persona];
      } else if (puntaje === mejor && !candidatos.includes(persona)) {
        candidatos.push(persona);
      }
    }
  }
  if (candidatos.length === 0) return { tipo: "NINGUNO" };
  if (candidatos.length > 1) return { tipo: "AMBIGUO", candidatos };
  return { tipo: "UNICO", persona: candidatos[0], puntaje: mejor };
}
