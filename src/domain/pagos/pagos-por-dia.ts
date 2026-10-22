import { diasEntre, sumarDias } from "@/domain/fechas/calendario";

/**
 * EL MES DÍA POR DÍA — todos los días del rango, hayan tenido pagos o no.
 *
 * El historial de Pagos se leía como una lista de pagos: un día sin cobros
 * simplemente no aparecía, y "¿el 14 no cobramos nada?" no tenía
 * respuesta a la vista. Acá cada día del rango tiene su fila, con sus
 * pagos adentro (o ninguno). El último día sale del rango que se pide
 * (`ultimoDiaDelMes`), así que febrero termina el 28 o el 29 y los meses
 * de 30 días no muestran un 31.
 *
 * Pura y sin I/O: recibe los pagos ya leídos. Los anulados quedan en su
 * día (el historial es un registro contable: se ven tachados) pero NO
 * suman al total ni a la cantidad del día — mismo criterio que
 * `totalCobrado()`.
 */

export interface PagoFechado {
  fechaPago: string;
  monto: number;
  anulado: boolean;
}

export interface DiaDelHistorial<P extends PagoFechado> {
  fecha: string;
  /** Los pagos de ese día, en el orden en que llegaron. */
  pagos: P[];
  /** Pagos vigentes (sin los anulados). */
  cantidad: number;
  /** Lo cobrado ese día (sin los anulados). */
  total: number;
}

export function pagosPorDia<P extends PagoFechado>(
  pagos: readonly P[],
  rango: { desde: string; hasta: string },
  direccion: "asc" | "desc" = "asc",
): DiaDelHistorial<P>[] {
  const largo = diasEntre(rango.desde, rango.hasta);
  if (largo < 0) return [];

  const porFecha = new Map<string, P[]>();
  for (const pago of pagos) {
    const lista = porFecha.get(pago.fechaPago);
    if (lista) lista.push(pago);
    else porFecha.set(pago.fechaPago, [pago]);
  }

  const dias: DiaDelHistorial<P>[] = [];
  for (let i = 0; i <= largo; i++) {
    const fecha = sumarDias(rango.desde, i);
    const delDia = porFecha.get(fecha) ?? [];
    const vigentes = delDia.filter((p) => !p.anulado);
    dias.push({
      fecha,
      pagos: delDia,
      cantidad: vigentes.length,
      total: vigentes.reduce((suma, p) => suma + p.monto, 0),
    });
  }

  return direccion === "desc" ? dias.reverse() : dias;
}
