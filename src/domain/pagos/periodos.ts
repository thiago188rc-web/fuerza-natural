import { sumarDias, sumarMeses } from "@/domain/fechas/calendario";
import { coberturaDe, type Cobertura } from "@/domain/pagos/modalidad";

/**
 * QUÉ PERÍODO SE PAGA. Función pura: no ve la base ni el reloj.
 *
 * Al cobrar hay dos fechas que no son la misma cosa
 * (docs/REGLAS-DE-NEGOCIO.md §5bis):
 *
 *   · la FECHA DE COBRO — cuándo entró la plata (`payments.fecha_pago`).
 *     Es un hecho: nunca posterior a hoy.
 *   · el PERÍODO IMPUTADO — qué mes está pagando el alumno
 *     (`payment_periods`). Puede ser atrasado, el que corre o uno futuro.
 *
 * Pagar noviembre el 28 de octubre es fecha de cobro 28/10 y período
 * 1/11–30/11. Antes el cobro solo dejaba elegir la primera, y el período
 * salía siempre "el día después del último cubierto": no había forma de
 * adelantar dos meses de una vez, ni de cobrar el mes en curso a alguien
 * con un hueco de meses sin que el sistema le imputara el más viejo.
 *
 * Los períodos siguen anclados al día de arranque de cada alumno (§3bis):
 * se encadenan desde el día después del último cubierto, un mes corrido
 * cada uno, así que el ciclo del 10 al 9 no se corre aunque se adelante o
 * se atrase.
 */

/** Cuántos meses se pueden cobrar juntos en un solo registro. */
export const MAXIMO_MESES_POR_COBRO = 6;

/**
 * Cuán lejos de hoy puede arrancar un período, para atrás o para
 * adelante. No es una regla del dueño: es la barrera contra un tipeo
 * (2062 en vez de 2026) que dejaría a alguien "cubierto" por décadas.
 */
export const MESES_DE_MARGEN = 12;

/** Cuántos períodos sin pagar anteriores al sugerido se ofrecen a un toque. */
const ATRASADOS_VISIBLES = 2;
/** Cuántos períodos futuros después del sugerido se ofrecen a un toque. */
const ADELANTADOS_VISIBLES = 2;

export type UbicacionDelPeriodo = "ATRASADO" | "EN_CURSO" | "ADELANTADO";

export const ETIQUETA_UBICACION: Record<UbicacionDelPeriodo, string> = {
  ATRASADO: "Atrasado",
  EN_CURSO: "En curso",
  ADELANTADO: "Adelantado",
};

/** Dónde cae un período respecto de hoy. */
export function ubicacionDelPeriodo(periodo: Cobertura, hoy: string): UbicacionDelPeriodo {
  if (periodo.hasta < hoy) return "ATRASADO";
  if (periodo.desde > hoy) return "ADELANTADO";
  return "EN_CURSO";
}

/**
 * `meses` meses completos seguidos desde `desde`: cada uno arranca el día
 * después de que termina el anterior. Es exactamente lo que habría dado
 * registrar esos pagos de a uno, mes tras mes.
 */
export function mesesEncadenados(desde: string, meses: number): Cobertura[] {
  const cantidad = Math.max(1, Math.min(Math.trunc(meses), MAXIMO_MESES_POR_COBRO));
  const salida: Cobertura[] = [];
  let cursor = desde;
  for (let i = 0; i < cantidad; i++) {
    const mes = coberturaDe("MES_COMPLETO", cursor);
    salida.push(mes);
    cursor = sumarDias(mes.hasta, 1);
  }
  return salida;
}

/** ¿El período arranca más lejos de hoy de lo razonable? */
export function inicioFueraDeMargen(desde: string, hoy: string): boolean {
  return desde < sumarMeses(hoy, -MESES_DE_MARGEN) || desde > sumarMeses(hoy, MESES_DE_MARGEN);
}

export interface PeriodoOfrecido extends Cobertura {
  ubicacion: UbicacionDelPeriodo;
}

export interface OpcionesDePeriodo {
  /** Los períodos que se ofrecen a un toque, en orden. */
  periodos: PeriodoOfrecido[];
  /** `desde` del período que se propone. Siempre está en `periodos`. */
  sugerido: string;
  /**
   * El primer día sin pagar, cuando es ANTERIOR al período sugerido: hay
   * meses sin cubrir entre la última cobertura y lo que se propone. La
   * pantalla lo dice en vez de elegir por el dueño si cobra lo atrasado.
   */
  sinPagarDesde: string | null;
}

/** ¿Cada día del período cae dentro de lo ya cubierto? */
function cubiertoEntero(periodo: Cobertura, cubiertos: readonly Cobertura[]): boolean {
  const ordenados = [...cubiertos].sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  let cursor = periodo.desde;
  for (const tramo of ordenados) {
    if (tramo.desde > cursor) return false; // hay un día sin cubrir en `cursor`
    if (tramo.hasta >= cursor) cursor = sumarDias(tramo.hasta, 1);
    if (cursor > periodo.hasta) return true;
  }
  return false;
}

/**
 * Los períodos a ofrecer al cobrar, y cuál proponer.
 *
 *   ancla        — el día después del último cubierto, o la fecha de alta
 *                  si nunca pagó. De ahí sale el día de arranque del ciclo.
 *   fechaDeCobro — cuándo se cobra. Decide el período PROPUESTO: el primero
 *                  sin pagar que no terminó antes de esa fecha — el que la
 *                  contiene o, si ese día ya estaba cubierto, el siguiente
 *                  sin pagar (un adelanto).
 *   hoy          — solo para marcar cada período como atrasado, en curso o
 *                  adelantado, y para no ofrecer de más.
 *   cubiertos    — lo ya pagado. Un período cubierto entero no se ofrece.
 *                  Con adelantos pueden quedar huecos ANTES del último día
 *                  pagado (pagó diciembre y enero, salteó noviembre): por
 *                  eso la cadena también se recorre hacia atrás del ancla.
 *   noAntesDe    — la fecha de alta: no se ofrece un período que terminó
 *                  antes de que la persona empezara.
 *
 * Por qué se propone el período de la fecha de cobro y no el primero sin
 * pagar: alguien que vuelve después de dos meses sin venir y paga hoy
 * está pagando HOY. Imputarle el mes más viejo lo dejaba "sin cubrir"
 * habiendo pagado. Los atrasados se siguen ofreciendo, a un toque, y la
 * pantalla avisa que existen (`sinPagarDesde`).
 */
export function periodosParaCobrar({
  ancla,
  fechaDeCobro,
  hoy,
  cubiertos,
  noAntesDe,
}: {
  ancla: string;
  fechaDeCobro: string;
  hoy: string;
  cubiertos: readonly Cobertura[];
  noAntesDe?: string;
}): OpcionesDePeriodo {
  const masTemprana = fechaDeCobro < hoy ? fechaDeCobro : hoy;
  const masTardia = fechaDeCobro > hoy ? fechaDeCobro : hoy;
  const desdeDondeInteresa = sumarMeses(masTemprana, -(ATRASADOS_VISIBLES + 1));

  // HACIA ATRÁS del ancla, con el mismo día de arranque: los huecos que
  // quedaron antes de lo último pagado. Sin bajar de lo que interesa ni de
  // la fecha de alta.
  const anteriores: Cobertura[] = [];
  let arranque = ancla;
  for (let vuelta = 0; vuelta < 24; vuelta++) {
    const desde = sumarMeses(arranque, -1);
    if (desde < desdeDondeInteresa) break;
    const mes = coberturaDe("MES_COMPLETO", desde);
    if (noAntesDe && mes.hasta < noAntesDe) break;
    anteriores.unshift(mes);
    arranque = desde;
  }

  // HACIA ADELANTE desde el ancla. Un ancla muy vieja (un alta de hace
  // años sin ningún pago) no se recorre mes por mes desde el principio:
  // se salta a unos meses antes de lo que interesa, en el mismo día.
  let inicio = ancla;
  const salto = inicio < desdeDondeInteresa;
  if (salto) {
    let saltos = 0;
    while (sumarMeses(ancla, saltos + 1) <= desdeDondeInteresa && saltos < 1200) saltos++;
    inicio = sumarMeses(ancla, saltos);
  }
  // Hasta unos meses después de lo que interesa — o del ancla, si alguien
  // ya tiene pagado más allá de eso.
  const referenciaFinal = ancla > masTardia ? ancla : masTardia;
  const tope = sumarMeses(referenciaFinal, ADELANTADOS_VISIBLES + 1);
  const siguientes: Cobertura[] = [];
  let cursor = inicio;
  // Cota dura: si algo rompe la aritmética, el bucle termina igual.
  for (let vuelta = 0; vuelta < 60 && (vuelta === 0 || cursor <= tope); vuelta++) {
    const mes = coberturaDe("MES_COMPLETO", cursor);
    siguientes.push(mes);
    cursor = sumarDias(mes.hasta, 1);
  }

  // Lo que ya está pagado entero no se ofrece. Lo que viene después del
  // ancla nunca está cubierto, así que la cadena no puede quedar vacía.
  const cadena = [...anteriores, ...siguientes].filter((p) => !cubiertoEntero(p, cubiertos));

  // El primer período sin pagar que todavía no terminó en esa fecha.
  const indiceDe = (dia: string) => {
    const i = cadena.findIndex((p) => p.hasta >= dia);
    return i === -1 ? cadena.length - 1 : i;
  };
  const iCobro = indiceDe(fechaDeCobro);
  const iHoy = indiceDe(hoy);

  const primero = Math.max(0, Math.min(iCobro, iHoy) - ATRASADOS_VISIBLES);
  const ultimo = Math.min(cadena.length - 1, Math.max(iCobro, iHoy) + ADELANTADOS_VISIBLES);
  const periodos = cadena
    .slice(primero, ultimo + 1)
    .map((p) => ({ ...p, ubicacion: ubicacionDelPeriodo(p, hoy) }));

  const sugerido = cadena[iCobro]!.desde;
  const primeroSinPagar = salto ? ancla : cadena[0]!.desde;
  return {
    periodos,
    sugerido,
    sinPagarDesde: primeroSinPagar < sugerido ? primeroSinPagar : null,
  };
}
