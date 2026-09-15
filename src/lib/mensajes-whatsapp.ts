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

/**
 * El recordatorio de vencimiento. Dos variantes de tono, no de información:
 * "para revisar" (ámbar, recién venció) es un aviso amable; "sin cubrir"
 * (rojo, más de `diasGracia` días) pide una acción más directa. Ninguna de
 * las dos inventa un monto ni una fecha límite — eso lo decide el dueño al
 * cobrar, no este mensaje.
 */
export function mensajeRecordatorioDeVencimiento(datos: {
  nombre: string;
  estado: "REVISAR" | "DESCUBIERTO";
  diasVencido: number | null;
  planNombre: string;
}): string {
  if (datos.estado === "REVISAR") {
    return `Hola ${datos.nombre}! Te escribimos de Fuerza Natural para avisarte que tu cuota de ${datos.planNombre} está vencida. Cuando puedas, acercate a ponerla al día. ¡Gracias!`;
  }

  const hace =
    datos.diasVencido === null
      ? ""
      : ` hace ${datos.diasVencido} ${datos.diasVencido === 1 ? "día" : "días"}`;

  return `Hola ${datos.nombre}! Vemos que tu cuota de ${datos.planNombre} sigue sin abonarse${hace}. Te pedimos que te acerques a regularizarla a la brevedad. ¡Gracias!`;
}
