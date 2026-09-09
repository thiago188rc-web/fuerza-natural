import { importe, fechaCompleta } from "@/lib/formato";
import { ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";

/**
 * El texto del mensaje de confirmación de pago, listo para un enlace
 * `wa.me`. Vive en `lib/` y no en `domain/` porque da FORMATO de
 * presentación (moneda, fecha en español) — no decide nada de negocio.
 *
 * Distingue MES_COMPLETO de MEDIO_MES a propósito: un medio mes no cambia
 * el plan habitual del alumno (docs/REGLAS-DE-NEGOCIO.md §4), así que el
 * mensaje nunca dice "tu plan se renovó" cuando lo que se cubrió fue una
 * quincena.
 */
export function mensajeConfirmacionDePago(datos: {
  nombre: string;
  monto: number;
  moneda: string;
  modalidad: string;
  planNombre: string;
  cubreHasta: string;
}): string {
  const importeFormateado = importe(datos.monto, datos.moneda);
  const hasta = fechaCompleta(datos.cubreHasta);

  const cobertura =
    datos.modalidad === "MEDIO_MES"
      ? `Tu cobertura de ${ETIQUETA_MODALIDAD[datos.modalidad as Modalidad].toLowerCase()} quedó al día hasta el ${hasta}. Tu plan habitual (${datos.planNombre}) no cambia.`
      : `Tu plan (${datos.planNombre}) quedó renovado hasta el ${hasta}.`;

  return `Hola ${datos.nombre}! Te confirmamos que recibimos tu pago de ${importeFormateado}. ${cobertura} ¡Gracias!`;
}
