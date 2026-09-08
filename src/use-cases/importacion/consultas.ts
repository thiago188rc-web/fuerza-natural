import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { listarNombresDeAlumnos } from "@/data/repositories/students-repo";
import { listarPlanes, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import type { AlumnoExistente } from "@/domain/importacion/analisis";

/**
 * Lo que la pantalla de importación necesita para analizar un archivo:
 * los planes que existen, las personas que ya están cargadas y qué día es
 * hoy en el gimnasio.
 *
 * El análisis ocurre en el navegador y eso es deliberado: el archivo no
 * sale de la máquina del dueño hasta que él decida importarlo. Una
 * planilla de alumnos son datos personales de cientos de personas; subirla
 * a un servidor "para previsualizar" es exponerla sin necesidad.
 *
 * Solo el DUEÑO: importar toca el padrón entero de un saque.
 */

export interface ContextoDeImportacion {
  hoy: string;
  planes: string[];
  existentes: AlumnoExistente[];
}

export const contextoDeImportacionQuery = withAuth<void, ContextoDeImportacion>(
  ["DUENO"],
  async (ctx) => {
    return withTenantTx<Result<ContextoDeImportacion>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const [planes, existentes] = await Promise.all([
        listarPlanes(tx, ctx),
        listarNombresDeAlumnos(tx, ctx),
      ]);

      return ok({
        hoy: hoyISO(gym.timezone),
        planes: planes.filter((p) => p.activo).map((p) => p.nombre),
        existentes,
      });
    });
  },
);
