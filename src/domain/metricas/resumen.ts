/**
 * EL RESUMEN DEL MES: los números que el dueño quiere ver de un vistazo,
 * arriba de todo en Métricas. Salió de una captura de otro gimnasio que él
 * mandó ("Septiembre, +5% vs mes anterior · 7 bajas · ocupación 93% ·
 * género · edad"), con un pedido explícito: no copiar la pantalla, tener
 * esos datos.
 *
 * "Ocupación" se traduce como "al día con la cuota": en un gimnasio de
 * horario libre, sin cupos ni turnos, no hay lugares que ocupar. Lo que el
 * dueño necesita saber es qué parte del padrón NO debe nada vencido — los
 * que tienen el mes cubierto más los que están dentro de sus días de
 * gracia, con la misma situación de cobertura que usa el Panel. Contar
 * solo a los que ya pagaron haría que el día 2 de cada mes el gimnasio
 * pareciera en crisis (casi nadie pagó todavía, y está bien).
 *
 * Funciones puras: los números llegan ya calculados del caso de uso.
 */

export interface EntradaDelResumen {
  /** Facturado en el mes (en curso: hasta hoy). */
  facturado: number;
  /**
   * Lo del mes anterior con qué compararlo — a la MISMA ALTURA si el mes
   * está en curso (al día 10 se compara con el 1-10 del mes pasado, no con
   * el mes pasado entero). null: el sistema no tiene ese mes.
   */
  facturadoMesAnterior: number | null;
  nuevos: number;
  volvieron: number;
  bajas: number;
  activos: number;
  activosMesAnterior: number | null;
  /** Solo para el mes en curso: la situación de cobertura es de HOY. */
  alDia: {
    cubiertos: number;
    /** Sin cubrir pero dentro de los días de gracia (o alta reciente): todavía no deben. */
    enPlazo?: number;
    total: number;
  } | null;
}

export interface ResumenDelMes {
  facturado: number;
  /** % entero con signo, o null si no hay contra qué comparar. */
  variacionFacturado: number | null;
  /** Nuevos + los que volvieron: gente que se sumó al padrón este mes. */
  altas: number;
  bajas: number;
  activos: number;
  /** Diferencia absoluta contra el fin del mes anterior, o null. */
  diferenciaActivos: number | null;
  alDia: { porcentaje: number; cubiertos: number; enPlazo: number; vencidos: number; total: number } | null;
}

/**
 * Cuánto cambió `actual` respecto de `anterior`, en % entero. Contra cero
 * no hay porcentaje posible: devolver "+100%" o "+∞%" para un mes que
 * simplemente no está cargado sería inventar una mejora.
 */
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  // `+ 0` evita el -0 de Math.round(-0,1).
  return Math.round(((actual - anterior) / anterior) * 100) + 0;
}

export function resumenDelMes(e: EntradaDelResumen): ResumenDelMes {
  return {
    facturado: e.facturado,
    variacionFacturado:
      e.facturadoMesAnterior === null ? null : variacionPorcentual(e.facturado, e.facturadoMesAnterior),
    altas: e.nuevos + e.volvieron,
    bajas: e.bajas,
    activos: e.activos,
    diferenciaActivos: e.activosMesAnterior === null ? null : e.activos - e.activosMesAnterior,
    alDia:
      e.alDia && e.alDia.total > 0
        ? {
            // Hacia abajo: con 249 de 250 al día, decir "100%" escondería al
            // único que falta, que es justo el que hay que ir a buscar.
            porcentaje: Math.floor(((e.alDia.cubiertos + (e.alDia.enPlazo ?? 0)) / e.alDia.total) * 100),
            cubiertos: e.alDia.cubiertos,
            enPlazo: e.alDia.enPlazo ?? 0,
            vencidos: e.alDia.total - e.alDia.cubiertos - (e.alDia.enPlazo ?? 0),
            total: e.alDia.total,
          }
        : null,
  };
}
