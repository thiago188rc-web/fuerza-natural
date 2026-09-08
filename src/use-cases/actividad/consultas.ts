import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { contarActividad, listarActividad } from "@/data/repositories/actividad-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";

/**
 * EL REGISTRO DE ACTIVIDAD.
 *
 * Solo el DUEÑO. No es una restricción caprichosa: el log dice quién hizo
 * qué, y en un gimnasio con personal eso incluye la actividad de cada
 * empleado. Que un usuario STAFF pueda auditar a otro STAFF es una
 * decisión que le corresponde al dueño, no un valor por defecto.
 */

export interface RegistroDeActividad {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  resumen: string;
  /** ISO completo con hora: la auditoría necesita el momento, no el día. */
  ocurridoEn: string;
  /** 'YYYY-MM-DD', para agrupar por jornada. */
  dia: string;
  hora: string;
  actorNombre: string;
  actorEmail: string;
  actorRol: string;
}

export interface Actividad {
  hoy: string;
  registros: RegistroDeActividad[];
  proximoCursor: string | null;
  total: number;
}

export const actividadQuery = withAuth<string | undefined, Actividad>(["DUENO"], async (ctx, cursor) => {
  return withTenantTx<Result<Actividad>>(ctx, async (tx) => {
    const gym = await obtenerGimnasio(tx, ctx);
    if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

    const [pagina, total] = await Promise.all([
      listarActividad(tx, ctx, cursor ?? null),
      contarActividad(tx, ctx),
    ]);

    // El día y la hora se formatean en la zona del gimnasio, no en UTC ni
    // en la del navegador: un cambio hecho a las 22:30 de Buenos Aires
    // tiene que aparecer ese día, no al día siguiente.
    const formatoDia = new Intl.DateTimeFormat("en-CA", {
      timeZone: gym.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const formatoHora = new Intl.DateTimeFormat("es-AR", {
      timeZone: gym.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return ok({
      hoy: hoyISO(gym.timezone),
      total,
      proximoCursor: pagina.proximoCursor,
      registros: pagina.filas.map((f) => ({
        id: f.id,
        accion: f.accion,
        entidad: f.entidad,
        entidadId: f.entidadId,
        resumen: f.resumen,
        ocurridoEn: f.ocurridoEn.toISOString(),
        dia: formatoDia.format(f.ocurridoEn),
        hora: formatoHora.format(f.ocurridoEn),
        actorNombre: f.actorNombre,
        actorEmail: f.actorEmail,
        actorRol: f.actorRol,
      })),
    });
  });
});
