import { z } from "zod";

/**
 * Registro de un pago. Un pago cubre un PERÍODO REAL — nunca "30 días
 * desde el pago". La construcción del período concreto la hace el caso de
 * uso (Fase 2), no este schema.
 *
 * `monto` es opcional acá porque se autocompleta con el precio vigente de
 * la modalidad elegida y el usuario puede editarlo antes de confirmar; la
 * resolución final vive en el caso de uso. Ese precio sale SIEMPRE de la
 * configuración del gimnasio (`plans.precio_actual` o
 * `gym_settings.precio_medio_mes`), nunca de una constante del código.
 *
 * `decisionPlan` es obligatorio solo cuando el plan indicado difiere del
 * plan actual del alumno (SPEC V1 §7): el caso de uso es quien conoce el
 * plan vigente y decide si exige esta confirmación, no este schema.
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

export const registrarPagoSchema = z.object({
  studentId: z.string().uuid(),
  fechaPago: z.string().date(),
  /** El plan HABITUAL del alumno al momento del pago (para el snapshot). */
  planId: z.string().uuid(),
  modalidad: z.enum(MODALIDADES_PAGO).default("MES_COMPLETO"),
  /**
   * Inicio de la cobertura. Obligatorio en MEDIO_MES: el dueño confirmó
   * que puede arrancar cualquier día, así que no se puede derivar. En
   * MES_COMPLETO el caso de uso lo deriva del mes elegido.
   */
  cubreDesde: z.string().date().optional(),
  monto: z.coerce.number().min(0).optional(),
  metodo: z.enum(["EFECTIVO", "TRANSFERENCIA", "BILLETERA", "OTRO"]).default("EFECTIVO"),
  nota: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().uuid(),
  decisionPlan: z.enum(["CONFIRMAR_CAMBIO", "MANTENER_PLAN"]).optional(),
});

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
