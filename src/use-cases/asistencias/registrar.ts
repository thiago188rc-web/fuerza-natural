import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { notFound, ok, type Result } from "@/use-cases/_kernel/result";
import {
  registrarAsistencia as insertarAsistencia,
  quitarAsistencia as desactivarAsistencia,
} from "@/data/repositories/attendance-repo";
import { buscarAlumnoPorId } from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { nombreCompleto } from "@/domain/alumnos/identidad";
import { hoyISO } from "@/domain/fechas/hoy";

export interface AsistenciaInput {
  studentId: string;
}

export interface AsistenciaRegistrada {
  studentId: string;
  fecha: string;
}

/**
 * Marca a un alumno presente HOY. Idempotente: tocar el botón dos veces no
 * duplica nada (`onConflictDoNothing` en el repositorio). Siempre se marca
 * la fecha de hoy en la TZ del gimnasio — no se recibe del cliente.
 */
export const marcarAsistenciaAction = withAuth<AsistenciaInput, AsistenciaRegistrada>(
  ["DUENO", "STAFF"],
  async (ctx, input) => {
    return withTenantTx<Result<AsistenciaRegistrada>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return notFound();

      const alumno = await buscarAlumnoPorId(tx, ctx, input.studentId);
      if (!alumno) return notFound();

      const hoy = hoyISO(gym.timezone);
      await insertarAsistencia(tx, ctx, { studentId: input.studentId, fecha: hoy });

      await logActivity(tx, ctx, {
        accion: "attendance.marked",
        entidad: "student",
        entidadId: input.studentId,
        resumen: `Asistencia registrada: ${nombreCompleto(alumno.nombre, alumno.apellido)}`,
      });

      return ok({ studentId: input.studentId, fecha: hoy });
    });
  },
);

/** Deshace una marca de hoy — para corregir un toque accidental. */
export const desmarcarAsistenciaAction = withAuth<AsistenciaInput, AsistenciaRegistrada>(
  ["DUENO", "STAFF"],
  async (ctx, input) => {
    return withTenantTx<Result<AsistenciaRegistrada>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return notFound();

      const alumno = await buscarAlumnoPorId(tx, ctx, input.studentId);
      if (!alumno) return notFound();

      const hoy = hoyISO(gym.timezone);
      await desactivarAsistencia(tx, ctx, { studentId: input.studentId, fecha: hoy });

      await logActivity(tx, ctx, {
        accion: "attendance.unmarked",
        entidad: "student",
        entidadId: input.studentId,
        resumen: `Asistencia deshecha: ${nombreCompleto(alumno.nombre, alumno.apellido)}`,
      });

      return ok({ studentId: input.studentId, fecha: hoy });
    });
  },
);
