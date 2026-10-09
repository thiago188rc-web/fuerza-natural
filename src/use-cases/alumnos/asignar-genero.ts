import { z } from "zod";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { notFound, ok, type Result } from "@/use-cases/_kernel/result";
import { asignarGeneroAlumno, buscarAlumnoPorId, listarSinGenero } from "@/data/repositories/students-repo";
import { GENEROS, etiquetaGenero } from "@/domain/alumnos/genero";
import { inferirGeneroDesdeNombre } from "@/domain/alumnos/inferir-genero";
import { nombreCompleto } from "@/domain/alumnos/identidad";

/**
 * COMPLETAR EL GÉNERO DE A MUCHOS — la base del gimnasio no lo trae, y el
 * sistema no lo deduce del nombre (ver domain/alumnos/genero.ts). Lo carga
 * una persona, de a un toque por alumno, desde una sola pantalla.
 *
 * Solo toca `genero`: no es la edición de la ficha (que pide todos los
 * datos), es un atajo para un único campo, con su propio registro.
 */

const asignarGeneroSchema = z.object({
  id: z.string().uuid(),
  genero: z.string().pipe(z.enum(GENEROS, { error: "Género inválido." })),
});

export const asignarGeneroAction = withAuth<z.input<typeof asignarGeneroSchema>, { id: string }>(
  ["DUENO", "STAFF"],
  async (ctx, rawInput) => {
    const parsed = parseInput(asignarGeneroSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const { id, genero } = parsed.data;

    return withTenantTx<Result<{ id: string }>>(ctx, async (tx) => {
      const actual = await buscarAlumnoPorId(tx, ctx, id);
      if (!actual) return notFound();
      if (actual.genero === genero) return ok({ id });

      const row = await asignarGeneroAlumno(tx, ctx, id, genero);
      if (!row) return notFound();

      await logActivity(tx, ctx, {
        accion: "student.updated",
        entidad: "student",
        entidadId: id,
        resumen: `Datos actualizados de ${nombreCompleto(row.nombre, row.apellido)}: Género (${etiquetaGenero(genero)})`,
        cambios: { genero: { antes: actual.genero, despues: genero } },
      });

      return ok({ id });
    });
  },
);

export interface ResultadoClasificacionAutomatica {
  clasificados: number;
  sinClasificar: number;
}

/**
 * CLASIFICAR TODOS DE UNA, por nombre de pila — a pedido explícito del
 * dueño. Es la excepción deliberada a "el sistema no lo deduce del
 * nombre" (ver `domain/alumnos/genero.ts` y `inferir-genero.ts`): acá
 * SÍ se escribe sin que nadie confirme alumno por alumno, así que un
 * nombre ambiguo clasificado mal no se corrige solo — queda sin tocar
 * (`inferirGeneroDesdeNombre` devuelve `null`) en vez de adivinar.
 *
 * Incluye también a los de baja: "todos de una" es todos, no solo los
 * que hoy cuentan en Métricas.
 */
export const clasificarGeneroAutomaticamenteAction = withAuth<
  void,
  ResultadoClasificacionAutomatica
>(["DUENO", "STAFF"], async (ctx) => {
  return withTenantTx<Result<ResultadoClasificacionAutomatica>>(ctx, async (tx) => {
    const sinGenero = await listarSinGenero(tx, ctx, true);

    let clasificados = 0;
    for (const alumno of sinGenero) {
      const genero = inferirGeneroDesdeNombre(alumno.nombre);
      if (!genero) continue;
      await asignarGeneroAlumno(tx, ctx, alumno.id, genero);
      clasificados++;
    }

    if (clasificados > 0) {
      await logActivity(tx, ctx, {
        accion: "student.updated",
        entidad: "student",
        resumen: `Género clasificado automáticamente por nombre: ${clasificados} de ${sinGenero.length} alumnos sin dato`,
      });
    }

    return ok({ clasificados, sinClasificar: sinGenero.length - clasificados });
  });
});

export interface AlumnoSinGenero {
  id: string;
  nombre: string;
  apellido: string;
  vinculo: string;
}

/** Los alumnos sin género cargado: primero los activos (son los que cuentan en Métricas). */
export const alumnosSinGeneroQuery = withAuth<{ incluirBajas?: boolean } | undefined, AlumnoSinGenero[]>(
  ["DUENO", "STAFF"],
  async (ctx, input) =>
    withTenantTx<Result<AlumnoSinGenero[]>>(ctx, async (tx) =>
      ok(await listarSinGenero(tx, ctx, input?.incluirBajas ?? false)),
    ),
);
