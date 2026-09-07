/**
 * Corregir la fecha de alta es una operación de negocio, no un UPDATE.
 *
 * `students` guarda DOS fechas distintas y Fase 0 les puso un CHECK que
 * las relaciona (`vinculo_desde >= fecha_alta_original`):
 *
 *   fecha_alta_original — cuándo la persona entró al gimnasio por primera
 *                         vez. No cambia por dar de baja ni por reactivar.
 *   vinculo_desde       — desde cuándo rige el estado ACTUAL. Se mueve en
 *                         cada cambio de estado.
 *
 * El dueño solo ve "Fecha de alta" (la primera). Si edita esa fecha sin
 * más, puede violar el CHECK y recibir un error crudo de Postgres. Esta
 * función pura decide, para cada caso, qué hacer — y cuándo hay que
 * decirle al dueño que lo que pide no es representable.
 */

export interface FechasDelAlumno {
  fechaAltaOriginal: string;
  vinculoDesde: string;
}

export type MotivoRechazoFechaAlta = "FECHA_FUTURA" | "POSTERIOR_AL_ESTADO_ACTUAL";

export type ResultadoFechaAlta =
  | { ok: true; fechas: FechasDelAlumno }
  | { ok: false; motivo: MotivoRechazoFechaAlta };

export function mensajeDeRechazoFechaAlta(motivo: MotivoRechazoFechaAlta): string {
  switch (motivo) {
    case "FECHA_FUTURA":
      return "La fecha de alta no puede ser posterior a hoy.";
    case "POSTERIOR_AL_ESTADO_ACTUAL":
      return "La fecha de alta no puede ser posterior al último cambio de estado del alumno.";
  }
}

export function resolverFechaDeAlta(
  actuales: FechasDelAlumno,
  nuevaFechaAlta: string,
  hoy: string,
): ResultadoFechaAlta {
  if (nuevaFechaAlta > hoy) return { ok: false, motivo: "FECHA_FUTURA" };

  if (nuevaFechaAlta === actuales.fechaAltaOriginal) {
    return { ok: true, fechas: actuales };
  }

  // El alumno nunca cambió de estado desde el alta: las dos fechas venían
  // pegadas, así que se mueven juntas. Es el caso normal (corregir un
  // tipeo el mismo día de la carga).
  if (actuales.vinculoDesde === actuales.fechaAltaOriginal) {
    return { ok: true, fechas: { fechaAltaOriginal: nuevaFechaAlta, vinculoDesde: nuevaFechaAlta } };
  }

  // Ya hubo al menos un cambio de estado: `vinculo_desde` es un hecho
  // histórico con su propia entrada en el historial, y moverlo para
  // acomodar una corrección de otra fecha sería falsear ese hecho.
  if (nuevaFechaAlta > actuales.vinculoDesde) {
    return { ok: false, motivo: "POSTERIOR_AL_ESTADO_ACTUAL" };
  }

  return {
    ok: true,
    fechas: { fechaAltaOriginal: nuevaFechaAlta, vinculoDesde: actuales.vinculoDesde },
  };
}
