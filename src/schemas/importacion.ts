import { z } from "zod";
import { CAMPOS } from "@/domain/importacion/analisis";

/**
 * Lo que manda el asistente al confirmar una importación: las filas tal
 * como se leyeron, SOLO con las columnas mapeadas y en el orden de
 * `CAMPOS`. Nada de lo que el navegador "decidió" viaja: el servidor
 * vuelve a correr el mismo análisis contra su propio padrón y sus planes.
 *
 * Acá solo se valida la forma y el tamaño — que nadie mande un millón de
 * filas o celdas de un megabyte. Las reglas de cada fila (plan existente,
 * duplicados, fechas) viven en el análisis, y una fila mala no tumba a las
 * demás: se informa con su motivo.
 */

export const MAXIMO_FILAS_IMPORTACION = 2000;

const celda = z.string().max(1000, "Hay una celda con más de 1000 caracteres.");

export const importarAlumnosSchema = z
  .object({
    nombreArchivo: z.string().trim().min(1).max(200),
    filas: z
      .array(z.array(celda).length(CAMPOS.length, "Formato de fila inválido."))
      .min(1, "No hay filas para importar.")
      .max(
        MAXIMO_FILAS_IMPORTACION,
        `Se pueden importar hasta ${MAXIMO_FILAS_IMPORTACION} filas por vez. Dividí la planilla.`,
      ),
    /**
     * En qué fila del archivo estaba cada una: solo para que las omisiones
     * se informen con el número que el dueño ve en su Excel. No decide nada.
     */
    lineas: z.array(z.number().int().min(1).max(1_048_576)).optional(),
  })
  .refine((d) => !d.lineas || d.lineas.length === d.filas.length, {
    message: "Formato de importación inválido.",
    path: ["lineas"],
  });

export type ImportarAlumnosRaw = z.input<typeof importarAlumnosSchema>;
