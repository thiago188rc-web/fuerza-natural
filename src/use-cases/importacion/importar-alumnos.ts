import { z } from "zod";
import { importarAlumnosSchema, type ImportarAlumnosRaw } from "@/schemas/importacion";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import {
  crearAlumno,
  listarNombresDeAlumnos,
  registrarEventoDeAlumno,
} from "@/data/repositories/students-repo";
import { listarPlanes, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { analizarFilas, CAMPOS, type Campo, type FilaAnalizada } from "@/domain/importacion/analisis";
import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";
import { hoyISO } from "@/domain/fechas/hoy";

export interface FilaOmitida {
  linea: number;
  nombre: string;
  motivo: string;
}

export interface ResultadoDeImportacion {
  importados: number;
  omitidos: FilaOmitida[];
}

/** Sin mapeo explícito, las filas llegan con las columnas en el orden de CAMPOS. */
const COLUMNAS_EN_ORDEN = Object.fromEntries(CAMPOS.map((campo, i) => [campo, i])) as Record<Campo, number>;

const LARGO_MAXIMO_NOMBRE = 80;
const LARGO_MAXIMO_DOCUMENTO = 30;
const LARGO_MAXIMO_NOTAS = 1000;
const email = z.string().email();

/** Por qué una fila del análisis no se importa, o null si se importa. */
function motivoParaOmitir(fila: FilaAnalizada): string | null {
  const error = fila.problemas.find((p) => p.gravedad === "ERROR");
  if (error) return error.mensaje;
  if (fila.duplicadoExistente) return `Ya existe en el padrón: ${fila.duplicadoExistente}.`;
  if (fila.duplicadoEnArchivo) return `Repetida: es la misma persona que la línea ${fila.duplicadoEnArchivo}.`;
  if (fila.nombre.length > LARGO_MAXIMO_NOMBRE || fila.apellido.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre y el apellido no pueden superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  }
  return null;
}

/**
 * EL PASO FINAL DEL IMPORTADOR: escribe en el padrón las filas que el
 * análisis dejó limpias.
 *
 * El servidor no confía en lo que vio el navegador. Vuelve a correr
 * `analizarFilas()` — la MISMA función que armó la vista previa — contra
 * los planes y los alumnos que lee él mismo, en la misma transacción en la
 * que escribe. Lo que se guarda no puede diferir de lo que se revisó salvo
 * en una dirección: si entre la vista previa y la confirmación alguien
 * cargó a esa persona, ahora es un duplicado y queda afuera.
 *
 * Qué entra y qué no, con las reglas del análisis (src/domain/importacion):
 *
 *   · Fila con algún ERROR (falta nombre, apellido o plan; plan que no
 *     existe; fecha de alta futura) → afuera, con su motivo.
 *   · Duplicada contra el padrón o dentro del mismo archivo → afuera. El
 *     matching de identidades no se adivina: esa persona se carga a mano.
 *   · AVISO → entra, tal como lo anunció la vista previa: teléfono que no
 *     está en formato internacional, vacío; fecha ilegible, la de hoy.
 *
 * Cada alumno entra ACTIVO, con `origen = IMPORTACION` y su ALTA en el
 * historial. La auditoría es UNA entrada con el resumen: doscientas filas
 * de "Alta creada" en Actividad taparían todo lo demás.
 *
 * Solo el DUEÑO: importar toca el padrón entero de un saque.
 */
export const importarAlumnosAction = withAuth<ImportarAlumnosRaw, ResultadoDeImportacion>(
  ["DUENO"],
  async (ctx, rawInput) => {
    const parsed = parseInput(importarAlumnosSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    return withTenantTx<Result<ResultadoDeImportacion>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const [planes, existentes] = await Promise.all([
        listarPlanes(tx, ctx),
        listarNombresDeAlumnos(tx, ctx),
      ]);
      const activos = planes.filter((p) => p.activo);
      const planPorClave = new Map(activos.map((p) => [normalizarTerminoBusqueda(p.nombre), p.id]));

      // El MISMO mapeo que usó la vista previa: con nombre y apellido en la
      // misma columna, el análisis los separa por la coma (ver schema).
      const { filas } = analizarFilas(input.filas, input.columnas ?? COLUMNAS_EN_ORDEN, {
        planes: activos.map((p) => p.nombre),
        existentes,
        hoy,
        lineas: input.lineas,
      });

      const omitidos: FilaOmitida[] = [];
      let importados = 0;

      for (const fila of filas) {
        const motivo = motivoParaOmitir(fila);
        const planId = fila.plan ? planPorClave.get(normalizarTerminoBusqueda(fila.plan)) : undefined;
        if (motivo || !planId) {
          omitidos.push({
            linea: fila.linea,
            nombre: `${fila.nombre} ${fila.apellido}`.trim(),
            motivo: motivo ?? "El plan no existe en el gimnasio.",
          });
          continue;
        }

        const fechaAlta = fila.fechaAlta ?? hoy;
        const row = await crearAlumno(tx, ctx, {
          nombre: fila.nombre,
          apellido: fila.apellido,
          telefono: fila.telefono,
          planId,
          fechaAltaOriginal: fechaAlta,
          vinculoDesde: fechaAlta,
          // El análisis no valida email ni largo del documento: lo que no
          // cumple el mismo formato que el alta manual entra vacío, igual
          // que un teléfono mal escrito. Mejor vacío que inventado.
          email: fila.email && email.safeParse(fila.email).success ? fila.email : null,
          documento:
            fila.documento && fila.documento.length <= LARGO_MAXIMO_DOCUMENTO ? fila.documento : null,
          notas: fila.notas ? fila.notas.slice(0, LARGO_MAXIMO_NOTAS) : null,
          origen: "IMPORTACION",
        });

        await registrarEventoDeAlumno(tx, ctx, {
          studentId: row.id,
          tipo: "ALTA",
          ocurridoEl: fechaAlta,
          datos: { planId, origen: "IMPORTACION" },
        });
        importados++;
      }

      if (importados > 0) {
        await logActivity(tx, ctx, {
          accion: "students.imported",
          entidad: "student",
          resumen:
            `Importación: ${importados} ${importados === 1 ? "alumno" : "alumnos"} desde “${input.nombreArchivo}”` +
            (omitidos.length > 0 ? ` (${omitidos.length} filas quedaron afuera)` : ""),
        });
      }

      return ok({ importados, omitidos });
    });
  },
);
