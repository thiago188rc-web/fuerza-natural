import { z } from "zod";

/**
 * Datos de un plan (SPEC V1 §7 sec. "Planes"): crear/editar. `precioActual`
 * es el precio vigente desde hoy — el historial de precios anteriores no
 * se toca acá, lo maneja el caso de uso.
 */
export const planSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  diasSemana: z.coerce.number().int().min(1).max(7),
  precioActual: z.coerce.number().min(0),
  activo: z.boolean().default(true),
});

export type PlanInput = z.infer<typeof planSchema>;
