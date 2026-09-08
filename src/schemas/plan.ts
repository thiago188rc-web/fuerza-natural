import { z } from "zod";

/**
 * Datos de un plan (SPEC V1 §7 sec. "Planes"): crear/editar. `precioActual`
 * es el precio vigente desde hoy — el historial de precios anteriores no
 * se toca acá, lo maneja el caso de uso, y los pagos ya registrados
 * conservan su propio snapshot.
 *
 * Los planes y sus precios son DATOS del gimnasio, no constantes del
 * código: acá no hay ninguna lista de nombres ni ningún importe.
 */

/**
 * Cómo se accede al gimnasio con este plan.
 *
 *   DIAS_FIJOS — 2, 3, 4 o 5 días por semana.
 *   LIBRE      — "5 días o más por semana, incluye sábados" (definición
 *                textual del dueño). `diasSemana` se lee como el PISO,
 *                no como el total.
 *
 * LIBRE NO es equivalente a "5 días" aunque históricamente haya tenido el
 * mismo precio (docs/REGLAS-DE-NEGOCIO.md §1).
 */
export const ACCESOS_PLAN = ["DIAS_FIJOS", "LIBRE"] as const;
export type AccesoPlan = (typeof ACCESOS_PLAN)[number];

export const planSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  diasSemana: z.coerce.number().int().min(1).max(7),
  acceso: z.enum(ACCESOS_PLAN).default("DIAS_FIJOS"),
  /**
   * Opcional: "precio todavía no confirmado" es un estado real del
   * negocio — hoy es el caso de LIBRE. Guardar 0 en su lugar diría que el
   * plan es gratis, y Fase 2 lo autocompletaría como monto del pago.
   */
  precioActual: z.coerce.number().min(0).nullish(),
  activo: z.boolean().default(true),
});

export type PlanInput = z.infer<typeof planSchema>;
