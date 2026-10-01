import { z } from "zod";
import { CAMPOS, type Campo } from "@/domain/importacion/analisis";

/**
 * Lo que manda el asistente al confirmar una importación: las filas tal
 * como se leyeron, SOLO con las columnas que se usan, y el MAPEO de qué
 * columna es cada campo. Nada de lo que el navegador "decidió" viaja: el
 * servidor vuelve a correr el mismo análisis, con el mismo mapeo, contra
 * su propio padrón y sus planes.
 *
 * El mapeo viaja porque cambia lo que significa una celda: con nombre y
 * apellido en la MISMA columna ("NOMBRE Y APELLIDO"), la celda se separa
 * por la coma. Sin el mapeo, el servidor veía dos columnas iguales y
 * guardaba "SOSA, ANA" como nombre y como apellido.
 *
 * Acá solo se valida la forma y el tamaño — que nadie mande un millón de
 * filas o celdas de un megabyte. Las reglas de cada fila (plan existente,
 * duplicados, fechas) viven en el análisis, y una fila mala no tumba a las
 * demás: se informa con su motivo.
 */

export const MAXIMO_FILAS_IMPORTACION = 2000;

const celda = z.string().max(1000, "Hay una celda con más de 1000 caracteres.");

/** Índice de columna dentro de cada fila enviada, o -1 si el campo no está en el archivo. */
const indiceDeColumna = z.number().int().min(-1).max(CAMPOS.length - 1);

const columnasSchema = z.object(
  Object.fromEntries(CAMPOS.map((campo) => [campo, indiceDeColumna])) as Record<Campo, typeof indiceDeColumna>,
);

const FORMATO_INVALIDO = "Formato de importación inválido.";

export const importarAlumnosSchema = z
  .object({
    nombreArchivo: z.string().trim().min(1).max(200),
    filas: z
      .array(z.array(celda).min(1, FORMATO_INVALIDO).max(CAMPOS.length, FORMATO_INVALIDO))
      .min(1, "No hay filas para importar.")
      .max(
        MAXIMO_FILAS_IMPORTACION,
        `Se pueden importar hasta ${MAXIMO_FILAS_IMPORTACION} filas por vez. Dividí la planilla.`,
      ),
    /**
     * Qué columna de cada fila es cada campo. Sin esto, las filas vienen en
     * el orden de CAMPOS, una columna por campo.
     */
    columnas: columnasSchema.optional(),
    /**
     * En qué fila del archivo estaba cada una: solo para que las omisiones
     * se informen con el número que el dueño ve en su Excel. No decide nada.
     */
    lineas: z.array(z.number().int().min(1).max(1_048_576)).optional(),
  })
  .superRefine((d, ctx) => {
    const ancho = d.filas[0]?.length ?? 0;
    const parejas = d.filas.every((f) => f.length === ancho);
    const anchoEsperado = d.columnas ? ancho : CAMPOS.length;
    const mapeoValido = !d.columnas || Object.values(d.columnas).every((i) => i < ancho);
    const lineasValidas = !d.lineas || d.lineas.length === d.filas.length;
    if (!parejas || ancho !== anchoEsperado || !mapeoValido || !lineasValidas) {
      ctx.addIssue({ code: "custom", message: FORMATO_INVALIDO, path: ["filas"] });
    }
  });

export type ImportarAlumnosRaw = z.input<typeof importarAlumnosSchema>;
