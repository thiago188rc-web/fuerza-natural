import { z } from "zod";

/**
 * Registro de un pago (SPEC V1 §7 sec. "Pagos"): un pago cubre un PERÍODO
 * (mes calendario), nunca "30 días desde el pago" — eso lo resuelve el
 * caso de uso al construir el período, no este schema.
 *
 * `monto` es opcional acá porque se autocompleta con el precio vigente del
 * plan elegido (histórico, no el actual) y el usuario puede editarlo antes
 * de confirmar — la resolución final del monto vive en el caso de uso.
 *
 * `decisionPlan` es obligatorio solo cuando el plan indicado difiere del
 * plan actual del alumno (SPEC V1 §7): el caso de uso es quien conoce el
 * plan vigente y decide si exige esta confirmación, no este schema.
 */
export const registrarPagoSchema = z.object({
  studentId: z.string().uuid(),
  fechaPago: z.string().date(),
  planId: z.string().uuid(),
  monto: z.coerce.number().min(0).optional(),
  metodo: z.enum(["EFECTIVO", "TRANSFERENCIA", "BILLETERA", "OTRO"]).default("EFECTIVO"),
  nota: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().uuid(),
  decisionPlan: z.enum(["CONFIRMAR_CAMBIO", "MANTENER_PLAN"]).optional(),
});

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
