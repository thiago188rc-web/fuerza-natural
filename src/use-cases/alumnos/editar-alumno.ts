import { editarAlumnoSchema, type EditarAlumnoRaw } from "@/schemas/student";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity, type CambioCampo } from "@/use-cases/_kernel/with-audit";
import { notFound, ok, validationError, type Result } from "@/use-cases/_kernel/result";
import {
  actualizarDatosAlumno,
  buscarAlumnoPorId,
  existePlanEnGimnasio,
  registrarEventoDeAlumno,
  type DatosEditablesAlumno,
} from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { nombreCompleto } from "@/domain/alumnos/identidad";
import { mensajeDeRechazoFechaAlta, resolverFechaDeAlta } from "@/domain/alumnos/fecha-de-alta";
import { hoyISO } from "@/domain/fechas/hoy";

export interface AlumnoEditado {
  id: string;
  huboCambios: boolean;
}

const ETIQUETAS_DE_CAMPO: Record<string, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  telefono: "Teléfono",
  planId: "Plan",
  fechaAltaOriginal: "Fecha de alta",
  notas: "Observaciones",
};

/**
 * EDICIÓN DE DATOS del alumno. Actualiza la fila existente — nunca crea
 * una nueva: "una persona = un registro" es la razón de ser de este
 * módulo, y duplicar al editar sería romperla en el primer intento.
 *
 * Explícitamente NO cambia el estado del vínculo. Esa es otra operación
 * (`cambiarVinculoAction`), con sus propias reglas y su propio evento en
 * el historial. Un formulario de datos personales no debería poder dar de
 * baja a nadie sin decirlo.
 *
 * Si el formulario se envía sin ningún cambio real, no escribe nada y no
 * audita nada: un `activity_log` lleno de "editó y no cambió nada" es
 * ruido que después esconde los cambios que sí importan.
 */
export const editarAlumnoAction = withAuth<EditarAlumnoRaw, AlumnoEditado>(
  ["DUENO", "STAFF"],
  async (ctx, rawInput) => {
    const parsed = parseInput(editarAlumnoSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    return withTenantTx<Result<AlumnoEditado>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return validationError([{ path: "gymId", message: "Gimnasio no encontrado." }]);

      // RLS + el filtro por gym_id: un alumno de otro gimnasio simplemente
      // no existe desde acá. Devolver NOT_FOUND (y no FORBIDDEN) tampoco
      // revela que ese id exista en otro lado.
      const actual = await buscarAlumnoPorId(tx, ctx, input.id);
      if (!actual) return notFound();

      const hoy = hoyISO(gym.timezone);

      const fechas = resolverFechaDeAlta(
        { fechaAltaOriginal: actual.fechaAltaOriginal, vinculoDesde: actual.vinculoDesde },
        input.fechaAltaOriginal,
        hoy,
      );
      if (!fechas.ok) {
        return validationError([
          { path: "fechaAltaOriginal", message: mensajeDeRechazoFechaAlta(fechas.motivo) },
        ]);
      }

      const planCambio = input.planId !== actual.planId;
      if (planCambio && !(await existePlanEnGimnasio(tx, ctx, input.planId))) {
        return validationError([{ path: "planId", message: "Elegí un plan válido." }]);
      }

      const datos: DatosEditablesAlumno = {
        nombre: input.nombre,
        apellido: input.apellido,
        telefono: input.telefono ?? null,
        planId: input.planId,
        fechaAltaOriginal: fechas.fechas.fechaAltaOriginal,
        vinculoDesde: fechas.fechas.vinculoDesde,
        notas: input.notas ?? null,
      };

      const cambios: Record<string, CambioCampo> = {};
      for (const campo of Object.keys(ETIQUETAS_DE_CAMPO) as (keyof DatosEditablesAlumno)[]) {
        const antes = actual[campo] ?? null;
        const despues = datos[campo] ?? null;
        if (antes !== despues) cambios[campo] = { antes, despues };
      }

      if (Object.keys(cambios).length === 0) {
        return ok({ id: actual.id, huboCambios: false });
      }

      const row = await actualizarDatosAlumno(tx, ctx, input.id, datos);
      if (!row) return notFound();

      if (planCambio) {
        await registrarEventoDeAlumno(tx, ctx, {
          studentId: row.id,
          tipo: "CAMBIO_PLAN",
          ocurridoEl: hoy,
          datos: { planIdAnterior: actual.planId, planIdNuevo: row.planId },
        });
      }

      const camposTocados = Object.keys(cambios)
        .map((campo) => ETIQUETAS_DE_CAMPO[campo] ?? campo)
        .join(", ");

      await logActivity(tx, ctx, {
        accion: "student.updated",
        entidad: "student",
        entidadId: row.id,
        resumen: `Datos actualizados de ${nombreCompleto(row.nombre, row.apellido)}: ${camposTocados}`,
        cambios,
      });

      return ok({ id: row.id, huboCambios: true });
    });
  },
);
