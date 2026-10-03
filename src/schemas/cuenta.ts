import { z } from "zod";
import { LARGO_MAXIMO_CONTRASENA, LARGO_MINIMO_CONTRASENA } from "@/lib/auth/flujo-contrasena";

/**
 * Cambio de contraseña. `actual` es opcional en el schema porque la pide
 * o no el caso de uso según cómo se abrió la sesión (ver
 * `exigeContrasenaActual`); el largo y la repetición se validan siempre.
 * Las contraseñas no se recortan: un espacio al final es parte de ella.
 */
export const cambiarContrasenaSchema = z
  .object({
    actual: z.string().max(LARGO_MAXIMO_CONTRASENA).optional(),
    nueva: z
      .string({ error: "Escribí la contraseña nueva." })
      .min(LARGO_MINIMO_CONTRASENA, `Tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`)
      .max(LARGO_MAXIMO_CONTRASENA, `No puede tener más de ${LARGO_MAXIMO_CONTRASENA} caracteres.`),
    repetida: z.string({ error: "Repetí la contraseña nueva." }),
  })
  .refine((d) => d.nueva === d.repetida, {
    path: ["repetida"],
    message: "Las dos contraseñas no coinciden.",
  });

export type CambiarContrasenaRaw = z.input<typeof cambiarContrasenaSchema>;

export const pedirRecuperacionSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribí un email válido.").max(254),
});
