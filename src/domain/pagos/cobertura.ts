import { diasEntre, primerDiaDelMes, ultimoDiaDelMes } from "@/domain/fechas/calendario";

/**
 * LA SITUACIÓN DE PAGO SE DERIVA. NUNCA SE GUARDA.
 *
 * No existe —ni va a existir— una columna `moroso` en la base. Esta
 * función recibe los tramos que un alumno tiene cubiertos y devuelve su
 * situación HOY. Si mañana cambia la fecha, cambia la respuesta, sin que
 * nadie tenga que correr un proceso nocturno que "actualice estados".
 * Esa es la clase entera de bug que este diseño elimina
 * (docs/REGLAS-DE-NEGOCIO.md §6).
 *
 * Tampoco es "último pago + 30 días": se pregunta si HOY cae dentro de
 * algún tramo cubierto. Es lo que hace que un "1/2 MES" del 20 al 3 del
 * mes siguiente funcione sin ningún caso especial.
 *
 * Los umbrales (ventana de pago, días de gracia, días de tolerancia para
 * un alumno nuevo) NO están inventados acá: son parámetros que el dueño
 * configura en `gym_settings`, y llegan como argumento.
 */

export interface TramoCubierto {
  desde: string;
  hasta: string;
}

export type EstadoDeCobertura =
  /** Hoy cae dentro de un tramo pagado. */
  | "CUBIERTO"
  /** No cubierto, pero hace `diasGracia` días o menos que venció. */
  | "REVISAR"
  /** No cubierto hace más de `diasGracia` días. */
  | "DESCUBIERTO"
  /** El alumno no está activo: la cobertura no aplica. */
  | "NO_APLICA";

export interface ParametrosDeCobertura {
  /**
   * `gym_settings.ventana_pago_hasta` — hasta qué día del mes se espera el
   * pago. Ya no lo usa `situacionDeCobertura()` (ver `diasGracia`); sigue
   * existiendo para la franja visual de Configuración.
   */
  ventanaPagoHasta: number;
  /**
   * `gym_settings.dias_gracia` — cuántos días desde que venció la
   * cobertura se lo sigue mostrando como "para revisar" (ámbar) antes de
   * pasar a "sin cubrir" (rojo). Es un conteo de días por alumno, no una
   * fecha límite del calendario: con el default de 5, el día 6 sin
   * cobertura ya es rojo, sin importar qué día del mes sea.
   */
  diasGracia: number;
  /** `gym_settings.dias_nuevo_sin_pago` — tolerancia para un alta reciente. */
  diasNuevoSinPago: number;
}

export interface SituacionDeCobertura {
  estado: EstadoDeCobertura;
  /** Frase corta, lista para mostrar. Siempre explica el porqué. */
  detalle: string;
  /** Último día cubierto, si hoy está cubierto. */
  cubiertoHasta: string | null;
  /** Días que faltan para que se termine la cobertura. Null si no aplica. */
  diasRestantes: number | null;
  /**
   * Días transcurridos desde que terminó la última cobertura. Null si está
   * `CUBIERTO`, `NO_APLICA`, o nunca pagó. Es lo que decide el color
   * amarillo/rojo en Alumnos y en la bandeja de atención — no hace falta
   * parsear `detalle`.
   */
  diasVencido: number | null;
}

function estaDentro(tramo: TramoCubierto, dia: string): boolean {
  return tramo.desde <= dia && dia <= tramo.hasta;
}

export function situacionDeCobertura(
  hoy: string,
  tramos: readonly TramoCubierto[],
  parametros: ParametrosDeCobertura,
  contexto: { vinculo: string; fechaAltaOriginal: string },
): SituacionDeCobertura {
  // Un alumno pausado o dado de baja no "debe": no está usando el
  // gimnasio. Mostrarlo como descubierto sería ruido en la bandeja.
  if (contexto.vinculo !== "ACTIVO") {
    return {
      estado: "NO_APLICA",
      detalle: contexto.vinculo === "PAUSADO" ? "Pausado" : "Baja",
      cubiertoHasta: null,
      diasRestantes: null,
      diasVencido: null,
    };
  }

  const vigente = tramos.filter((t) => estaDentro(t, hoy)).sort((a, b) => (a.hasta > b.hasta ? -1 : 1))[0];

  if (vigente) {
    const restantes = diasEntre(hoy, vigente.hasta);
    return {
      estado: "CUBIERTO",
      detalle:
        restantes === 0
          ? "Último día cubierto"
          : restantes <= 5
            ? `Vence en ${restantes} ${restantes === 1 ? "día" : "días"}`
            : `Cubierto hasta el ${Number(vigente.hasta.slice(8, 10))}`,
      cubiertoHasta: vigente.hasta,
      diasRestantes: restantes,
      diasVencido: null,
    };
  }

  // Alta reciente: todavía no se le puede reclamar nada.
  const diasDesdeElAlta = diasEntre(contexto.fechaAltaOriginal, hoy);
  if (diasDesdeElAlta >= 0 && diasDesdeElAlta <= parametros.diasNuevoSinPago) {
    return {
      estado: "REVISAR",
      detalle: "Alta reciente, sin pago todavía",
      cubiertoHasta: null,
      diasRestantes: null,
      diasVencido: null,
    };
  }

  // Sin cobertura vigente: un conteo de días real por alumno, no una fecha
  // límite del calendario. `diasGracia` decide cuántos días de margen tiene
  // antes de pasar de "para revisar" a "sin cubrir" — sin importar qué día
  // del mes sea ni si viene de un hueco viejo o de recién vencer.
  const ultimo = [...tramos].sort((a, b) => (a.hasta > b.hasta ? -1 : 1))[0];
  const diasVencido = ultimo ? diasEntre(ultimo.hasta, hoy) : null;

  if (diasVencido !== null && diasVencido <= parametros.diasGracia) {
    return {
      estado: "REVISAR",
      detalle: `Sin cubrir hace ${diasVencido} ${diasVencido === 1 ? "día" : "días"}`,
      cubiertoHasta: null,
      diasRestantes: null,
      diasVencido,
    };
  }

  return {
    estado: "DESCUBIERTO",
    detalle:
      diasVencido === null
        ? "Nunca registró un pago"
        : `Sin cobertura hace ${diasVencido} ${diasVencido === 1 ? "día" : "días"}`,
    cubiertoHasta: null,
    diasRestantes: null,
    diasVencido,
  };
}

/**
 * Los tramos de un mes, normalizados a fracciones de 0 a 1 dentro de ese
 * mes. Es lo que dibuja la barra del mes: cada pago cubierto se convierte
 * en un segmento con una posición y un ancho.
 *
 * Un tramo que empieza antes del mes o termina después se recorta a los
 * bordes — no se descarta. Un "1/2 MES" que arranca el 25 tiene que verse
 * en los dos meses que toca.
 */
export interface SegmentoDelMes {
  inicio: number;
  fin: number;
}

export function segmentosDelMes(mesISO: string, tramos: readonly TramoCubierto[]): SegmentoDelMes[] {
  const primero = primerDiaDelMes(mesISO);
  const ultimo = ultimoDiaDelMes(mesISO);
  const total = diasEntre(primero, ultimo);
  if (total <= 0) return [];

  return tramos
    .filter((t) => t.hasta >= primero && t.desde <= ultimo)
    .map((t) => {
      const desde = t.desde < primero ? primero : t.desde;
      const hasta = t.hasta > ultimo ? ultimo : t.hasta;
      return {
        inicio: diasEntre(primero, desde) / total,
        // +1 día de ancho para que un tramo de un solo día sea visible.
        fin: Math.min(1, (diasEntre(primero, hasta) + 1) / total),
      };
    })
    .sort((a, b) => a.inicio - b.inicio);
}
