import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { listarAlumnosActivosParaCobertura } from "@/data/repositories/students-repo";
import { asistenciasDelDia } from "@/data/repositories/attendance-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";

export interface AlumnoParaAsistencia {
  id: string;
  nombre: string;
  apellido: string;
  presente: boolean;
}

export interface AsistenciaDeHoy {
  hoy: string;
  alumnos: AlumnoParaAsistencia[];
  presentes: number;
  total: number;
}

/**
 * Los alumnos ACTIVOS de hoy, cada uno con si ya se lo marcó presente.
 * Solo activos: a alguien pausado o dado de baja no tiene sentido pedirle
 * asistencia.
 */
export const asistenciaDeHoyQuery = withAuth<void, AsistenciaDeHoy>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<AsistenciaDeHoy>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const [activos, presentesHoy] = await Promise.all([
        listarAlumnosActivosParaCobertura(tx, ctx),
        asistenciasDelDia(tx, ctx, hoy),
      ]);

      const alumnos = activos
        .map((a) => ({
          id: a.id,
          nombre: a.nombre,
          apellido: a.apellido,
          presente: presentesHoy.has(a.id),
        }))
        .sort((a, b) => a.apellido.localeCompare(b.apellido, "es"));

      return ok({
        hoy,
        alumnos,
        presentes: alumnos.filter((a) => a.presente).length,
        total: alumnos.length,
      });
    });
  },
);
