import { z } from "zod";

/**
 * Registro de una baja (SPEC V1 §7 sec. "Bajas"): el vinculo pasa a BAJA
 * de forma manual, nunca automática. `motivoCodigo` se valida contra la
 * lista configurable en gym_settings.motivos_baja dentro del caso de uso
 * (acá solo se exige que venga presente).
 *
 * `observacion` es SIEMPRE opcional (SPEC V1 §8.2): no incentivar carga
 * de información médica/sensible en un campo de texto libre.
 */
export const registrarBajaSchema = z.object({
  studentId: z.string().uuid(),
  fecha: z.string().date(),
  motivoCodigo: z.string().trim().min(1),
  observacion: z.string().trim().max(500).optional(),
});

export type RegistrarBajaInput = z.infer<typeof registrarBajaSchema>;
