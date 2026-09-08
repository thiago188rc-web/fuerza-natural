import { z } from "zod";
import { opcional } from "./_helpers";

/**
 * Registro de un pago. Un pago cubre un PERÍODO REAL — nunca "30 días
 * desde el pago". La construcción del período concreto la hace el caso de
 * uso con `coberturaDe()`, no este schema.
 *
 * Dos campos que ESTE schema no tiene, a propósito:
 *
 *   · `gymId` — nunca viene del cliente; sale de la sesión.
 *   · `planId` — el snapshot del plan se lee de la base en el momento de
 *     registrar. Aceptarlo del formulario permitiría que un cliente
 *     manipulado guardara un pago con el nombre y los días de otro plan,
 *     y el snapshot es justamente lo que después nadie puede corregir
 *     (`payments` es append-only salvo anulación).
 *
 * Tampoco existe `decisionPlan`: un pago NUNCA cambia el plan habitual del
 * alumno (docs/REGLAS-DE-NEGOCIO.md §4). Cambiar de plan es otra
 * operación, con su propio registro en el historial.
 */

/**
 * QUÉ cobertura se compró. No es el plan del alumno.
 *
 *   MES_COMPLETO — el mes calendario completo, con el plan habitual.
 *   MEDIO_MES    — "1/2 MES": 15 días consecutivos, que pueden empezar
 *                  cualquier día (principio, medio o fin de mes).
 *
 * Registrar un MEDIO_MES NO cambia el plan habitual del alumno: un alumno
 * de 5 días que paga medio mes sigue siendo de 5 días
 * (docs/REGLAS-DE-NEGOCIO.md §3, §4).
 */
export const MODALIDADES_PAGO = ["MES_COMPLETO", "MEDIO_MES"] as const;
export type ModalidadPago = (typeof MODALIDADES_PAGO)[number];

export const METODOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "BILLETERA", "OTRO"] as const;

export const ETIQUETA_METODO: Record<(typeof METODOS_PAGO)[number], string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  BILLETERA: "Billetera virtual",
  OTRO: "Otro",
};

export const registrarPagoSchema = z.object({
  studentId: z.string().uuid("Elegí un alumno."),
  /** Cuándo se cobró. Puede ser anterior a hoy (se carga un pago de ayer). */
  fechaPago: z.string().date("Fecha inválida. Usá el formato AAAA-MM-DD."),
  modalidad: z.enum(MODALIDADES_PAGO).default("MES_COMPLETO"),
  /**
   * Desde cuándo corre la cobertura.
   *
   * En MEDIO_MES es el primer día de los 15: el dueño confirmó que puede
   * arrancar CUALQUIER día, así que no se deriva de nada.
   * En MES_COMPLETO alcanza con cualquier día del mes que se está
   * pagando — `coberturaDe()` lo normaliza al día 1. Eso permite pagar un
   * mes atrasado o adelantado sin un campo extra.
   */
  cubreDesde: z.string().date("Fecha inválida. Usá el formato AAAA-MM-DD."),
  /**
   * El importe. Se autocompleta con el precio vigente configurado, y el
   * dueño puede editarlo (un pago parcial, un ajuste). Nunca sale de una
   * constante del código.
   */
  monto: z.coerce
    .number({ error: "Ingresá un importe." })
    .min(0, "El importe no puede ser negativo.")
    .max(99_999_999, "Importe demasiado alto."),
  metodo: z.enum(METODOS_PAGO).default("EFECTIVO"),
  nota: opcional(z.string().trim().max(300, "La nota no puede superar los 300 caracteres.")),
  /** Evita el pago doble por doble clic o por reenvío del formulario. */
  idempotencyKey: z.string().uuid(),
  /**
   * El usuario ya vio la advertencia de cobertura superpuesta y decidió
   * seguir. Sin esto, el caso de uso devuelve CONFIRMACION_REQUERIDA en
   * vez de escribir.
   */
  confirmarSuperposicion: z.coerce.boolean().optional(),
});

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
export type RegistrarPagoRaw = z.input<typeof registrarPagoSchema>;
