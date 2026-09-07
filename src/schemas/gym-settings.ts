import { z } from "zod";

/**
 * Subset editable de gym_settings desde Configuración (SPEC V1 §7 sec.
 * "Configuración"): ventana de pago, días de gracia y umbral de "nuevo
 * sin pago". El resto de gym_settings (ej. motivos_baja) no se edita
 * desde este formulario.
 */
export const gymSettingsSchema = z.object({
  ventanaPagoDesde: z.coerce.number().int().min(1).max(28),
  ventanaPagoHasta: z.coerce.number().int().min(1).max(28),
  diasGracia: z.coerce.number().int().min(0).max(20),
  diasNuevoSinPago: z.coerce.number().int().min(1).max(60),
});

export type GymSettingsInput = z.infer<typeof gymSettingsSchema>;
