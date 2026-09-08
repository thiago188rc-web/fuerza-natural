import {
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  ultimoDiaDelMes,
} from "@/domain/fechas/calendario";

/**
 * Qué cubre un pago, según su modalidad. Función pura: no ve la base ni
 * el reloj (docs/REGLAS-DE-NEGOCIO.md §3 y §5).
 *
 * Las dos modalidades confirmadas por el dueño, y nada más. No existe
 * "trimestre", "anual" ni "clase suelta": inventar modalidades es
 * inventar reglas de negocio.
 */

export const MODALIDADES = ["MES_COMPLETO", "MEDIO_MES"] as const;
export type Modalidad = (typeof MODALIDADES)[number];

/** 15 días consecutivos, contando el primero. Confirmado por el dueño. */
export const DIAS_DE_MEDIO_MES = 15;

export function esModalidad(valor: unknown): valor is Modalidad {
  return typeof valor === "string" && (MODALIDADES as readonly string[]).includes(valor);
}

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  MES_COMPLETO: "Mes completo",
  MEDIO_MES: "1/2 mes",
};

export interface Cobertura {
  desde: string;
  hasta: string;
}

/**
 * El rango que cubre un pago.
 *
 *   MES_COMPLETO — del día 1 al último día del mes de `desde`. Se
 *                  normaliza a propósito: elegir "septiembre" cubre
 *                  septiembre entero, sin importar qué día se pague.
 *   MEDIO_MES    — 15 días corridos desde `desde`, que puede ser
 *                  CUALQUIER día del mes. Puede terminar en el mes
 *                  siguiente, y eso es correcto.
 */
export function coberturaDe(modalidad: Modalidad, desde: string): Cobertura {
  if (modalidad === "MES_COMPLETO") {
    return { desde: primerDiaDelMes(desde), hasta: ultimoDiaDelMes(desde) };
  }
  return { desde, hasta: sumarDias(desde, DIAS_DE_MEDIO_MES - 1) };
}

export interface TramoImputado {
  /** Día 1 del mes al que se imputa este tramo. */
  periodo: string;
  cubreDesde: string;
  cubreHasta: string;
}

/**
 * Parte una cobertura en un tramo por cada mes que toca.
 *
 * `payment_periods` guarda una fila por mes imputado, y la base exige
 * (CHECK `payment_periods_periodo_coherente_check`) que `periodo` sea el
 * mes en el que ARRANCA el tramo. Un medio mes que empieza el 25 de
 * septiembre produce dos filas: una imputada a septiembre (25→30) y otra
 * a octubre (1→9).
 *
 * Es lo que permite que "¿quién tiene cubierto septiembre?" siga siendo
 * un WHERE indexado sin perder la fecha real de la cobertura.
 */
export function tramosImputados(cobertura: Cobertura): TramoImputado[] {
  const tramos: TramoImputado[] = [];
  let cursor = cobertura.desde;

  // Cota dura: una cobertura no puede tocar más de 24 meses. Si algo
  // rompe la aritmética, el bucle termina igual en vez de colgar el
  // servidor.
  for (let vuelta = 0; vuelta < 24 && cursor <= cobertura.hasta; vuelta++) {
    const finDelMes = ultimoDiaDelMes(cursor);
    const hasta = finDelMes < cobertura.hasta ? finDelMes : cobertura.hasta;
    tramos.push({ periodo: primerDiaDelMes(cursor), cubreDesde: cursor, cubreHasta: hasta });
    cursor = primerDiaDelMes(sumarMeses(cursor, 1));
  }

  return tramos;
}
