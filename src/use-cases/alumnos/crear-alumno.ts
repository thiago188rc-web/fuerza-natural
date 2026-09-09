import { crearAlumnoSchema, type CrearAlumnoRaw } from "@/schemas/student";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { ok, validationError, type Result } from "@/use-cases/_kernel/result";
import {
  crearAlumno,
  existePlanEnGimnasio,
  registrarEventoDeAlumno,
  type NuevoAlumno,
} from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { nombreCompleto } from "@/domain/alumnos/identidad";
import { hoyISO } from "@/domain/fechas/hoy";

export interface AlumnoCreado {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * ALTA DE ALUMNO. El patrón completo: Zod → withAuth → withTenantTx →
 * repositorio → historial + auditoría → Result. Todo dentro de UNA
 * transacción: si la auditoría falla, el alumno no se crea.
 *
 * Reglas que aplica y por qué:
 *
 *   · `gymId` sale de `ctx`, jamás del input. No hay forma de que el
 *     cliente lo mande — el schema de Zod ni siquiera tiene ese campo.
 *   · El estado inicial es siempre ACTIVO. No se acepta del cliente:
 *     "dar de alta a alguien ya dado de baja" no es un alta.
 *   · "Hoy" se calcula en la TZ del gimnasio, en el servidor. Si el dueño
 *     indica una fecha de alta (carga de un alumno que empezó la semana
 *     pasada), se acepta siempre que no sea futura.
 *   · El plan tiene que existir, estar activo y pertenecer a este
 *     gimnasio. RLS ya lo garantiza, pero comprobarlo antes convierte una
 *     violación de foreign key ilegible en un mensaje que el dueño puede
 *     entender.
 *
 * NO hace (a propósito): detección de duplicados por nombre — el Data
 * Discovery mostró que nombre+apellido no identifica a una persona, y el
 * matching de identidades es de Migración (Fase 5), no de un alta manual.
 */
export const crearAlumnoAction = withAuth<CrearAlumnoRaw, AlumnoCreado>(
  ["DUENO", "STAFF"],
  async (ctx, rawInput) => {
    const parsed = parseInput(crearAlumnoSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    return withTenantTx<Result<AlumnoCreado>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return validationError([{ path: "gymId", message: "Gimnasio no encontrado." }]);

      const hoy = hoyISO(gym.timezone);
      const fechaAlta = input.fechaAltaOriginal ?? hoy;
      if (fechaAlta > hoy) {
        return validationError([
          { path: "fechaAltaOriginal", message: "La fecha de alta no puede ser posterior a hoy." },
        ]);
      }

      if (!(await existePlanEnGimnasio(tx, ctx, input.planId))) {
        return validationError([{ path: "planId", message: "Elegí un plan válido." }]);
      }

      const nuevo: NuevoAlumno = {
        nombre: input.nombre,
        apellido: input.apellido,
        telefono: input.telefono ?? null,
        planId: input.planId,
        // Alta: las dos fechas arrancan juntas. `vinculoDesde` se separa de
        // `fechaAltaOriginal` recién en el primer cambio de estado.
        fechaAltaOriginal: fechaAlta,
        vinculoDesde: fechaAlta,
        email: input.email ?? null,
        documento: input.documento ?? null,
        fechaNacimiento: input.fechaNacimiento ?? null,
        genero: input.genero ?? null,
        notas: input.notas ?? null,
        origen: "MANUAL",
      };

      const row = await crearAlumno(tx, ctx, nuevo);
      const nombre = nombreCompleto(row.nombre, row.apellido);

      await registrarEventoDeAlumno(tx, ctx, {
        studentId: row.id,
        tipo: "ALTA",
        ocurridoEl: fechaAlta,
        datos: { planId: row.planId },
      });

      await logActivity(tx, ctx, {
        accion: "student.created",
        entidad: "student",
        entidadId: row.id,
        resumen: `Alta creada: ${nombre}`,
      });

      return ok({ id: row.id, nombre: row.nombre, apellido: row.apellido });
    });
  },
);
