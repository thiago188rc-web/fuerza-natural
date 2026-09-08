import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { appUsers, plans, students, studentEvents } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";
import type { Vinculo } from "@/domain/alumnos/vinculo";
import type { CambioDeVinculo } from "@/domain/alumnos/cambio-de-vinculo";
import { escaparComodinesLike, normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";

/**
 * Repositorio de alumnos (SPEC V1 §15.1-15.2). Reglas del patrón, sin
 * excepciones:
 *
 *   · Recibe SIEMPRE `ctx: AuthContext` como segundo parámetro — nunca un
 *     `gymId` suelto, y nunca uno que venga del cliente.
 *   · Recibe el `tx` que ya abrió `withTenantTx` (con el contexto de
 *     tenant seteado). Nunca abre conexiones propias.
 *   · Filtra por `gym_id` explícitamente ADEMÁS de RLS. Es defensa en
 *     profundidad (capa 2 de 4, SPEC V1 §3.5): si mañana alguien se
 *     equivoca en una policy, estas consultas siguen siendo correctas; y
 *     el código se puede auditar leyéndolo, sin ir a mirar la base.
 *
 * Nada de este archivo borra filas: `students` no se elimina nunca — una
 * BAJA es un cambio de estado (SPEC V1 §8). El rol `fn_app` ni siquiera
 * tiene el privilegio DELETE.
 */

export const ALUMNOS_POR_PAGINA = 25;

export interface NuevoAlumno {
  nombre: string;
  apellido: string;
  telefono?: string | null;
  planId: string;
  fechaAltaOriginal: string;
  vinculoDesde: string;
  email?: string | null;
  documento?: string | null;
  fechaNacimiento?: string | null;
  notas?: string | null;
  origen?: "MANUAL" | "IMPORTACION";
}

export async function crearAlumno(tx: TxClient, ctx: AuthContext, input: NuevoAlumno) {
  const [row] = await tx
    .insert(students)
    .values({
      gymId: ctx.gymId,
      nombre: input.nombre,
      apellido: input.apellido,
      telefono: input.telefono ?? null,
      planId: input.planId,
      fechaAltaOriginal: input.fechaAltaOriginal,
      vinculoDesde: input.vinculoDesde,
      email: input.email ?? null,
      documento: input.documento ?? null,
      fechaNacimiento: input.fechaNacimiento ?? null,
      notas: input.notas ?? null,
      origen: input.origen ?? "MANUAL",
    })
    .returning();
  return row;
}

export async function buscarAlumnoPorId(tx: TxClient, ctx: AuthContext, id: string) {
  const [row] = await tx
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.gymId, ctx.gymId)));
  return row ?? null;
}

/** La ficha: el alumno más el nombre de su plan, en una sola consulta. */
export async function obtenerFichaAlumno(tx: TxClient, ctx: AuthContext, id: string) {
  const [row] = await tx
    .select({
      id: students.id,
      nombre: students.nombre,
      apellido: students.apellido,
      telefono: students.telefono,
      email: students.email,
      vinculo: students.vinculo,
      planId: students.planId,
      planNombre: plans.nombre,
      planDiasSemana: plans.diasSemana,
      planActivo: plans.activo,
      fechaAltaOriginal: students.fechaAltaOriginal,
      vinculoDesde: students.vinculoDesde,
      pausaHasta: students.pausaHasta,
      pausaNota: students.pausaNota,
      bajaFecha: students.bajaFecha,
      bajaMotivoEtiqueta: students.bajaMotivoEtiqueta,
      bajaObservacion: students.bajaObservacion,
      notas: students.notas,
      origen: students.origen,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
    })
    .from(students)
    .innerJoin(plans, eq(plans.id, students.planId))
    .where(and(eq(students.id, id), eq(students.gymId, ctx.gymId)));
  return row ?? null;
}

export type FichaAlumno = NonNullable<Awaited<ReturnType<typeof obtenerFichaAlumno>>>;

export interface FiltrosListado {
  termino?: string | null;
  vinculo?: Vinculo | null;
  pagina: number;
}

/**
 * Listado paginado con búsqueda y filtro de estado.
 *
 * La búsqueda parte el término en palabras y exige que TODAS aparezcan en
 * `nombre_busqueda` (la columna generada por la base, ya en minúsculas y
 * sin acentos). Así "gomez ana" encuentra a "Ana Gómez" aunque la columna
 * guarde "ana gomez" — con un solo LIKE del término completo, no la
 * encontraría. Los comodines de LIKE van escapados: buscar "100%" no puede
 * devolver a todo el gimnasio.
 */
export async function listarAlumnos(tx: TxClient, ctx: AuthContext, filtros: FiltrosListado) {
  const condiciones = [eq(students.gymId, ctx.gymId)];
  if (filtros.vinculo) condiciones.push(eq(students.vinculo, filtros.vinculo));

  const termino = normalizarTerminoBusqueda(filtros.termino ?? "");
  if (termino) {
    for (const palabra of termino.split(" ").slice(0, 5)) {
      const patron = `%${escaparComodinesLike(palabra)}%`;
      // `'\\'` en el template literal produce `escape '\'` en el SQL: una
      // sola barra invertida, que es el carácter de escape que usa
      // `escaparComodinesLike()`.
      condiciones.push(sql`${students.nombreBusqueda} like ${patron} escape '\\'`);
    }
  }

  const where = and(...condiciones);
  const offset = (filtros.pagina - 1) * ALUMNOS_POR_PAGINA;

  const [filas, totales] = await Promise.all([
    tx
      .select({
        id: students.id,
        nombre: students.nombre,
        apellido: students.apellido,
        telefono: students.telefono,
        vinculo: students.vinculo,
        planNombre: plans.nombre,
        fechaAltaOriginal: students.fechaAltaOriginal,
      })
      .from(students)
      .innerJoin(plans, eq(plans.id, students.planId))
      .where(where)
      .orderBy(asc(students.apellido), asc(students.nombre))
      .limit(ALUMNOS_POR_PAGINA)
      .offset(offset),
    tx.select({ total: count() }).from(students).where(where),
  ]);

  return {
    filas,
    total: totales[0]?.total ?? 0,
    pagina: filtros.pagina,
    porPagina: ALUMNOS_POR_PAGINA,
  };
}

/** Para los contadores del listado ("Activos 41 · Pausados 3 · Bajas 12"). */
export async function contarAlumnosPorVinculo(tx: TxClient, ctx: AuthContext) {
  const filas = await tx
    .select({ vinculo: students.vinculo, total: count() })
    .from(students)
    .where(eq(students.gymId, ctx.gymId))
    .groupBy(students.vinculo);

  const conteo: Record<string, number> = {};
  for (const fila of filas) conteo[fila.vinculo] = fila.total;
  return conteo;
}

export interface DatosEditablesAlumno {
  nombre: string;
  apellido: string;
  telefono: string | null;
  planId: string;
  fechaAltaOriginal: string;
  vinculoDesde: string;
  notas: string | null;
}

export async function actualizarDatosAlumno(
  tx: TxClient,
  ctx: AuthContext,
  id: string,
  datos: DatosEditablesAlumno,
) {
  const [row] = await tx
    .update(students)
    .set({ ...datos, updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.gymId, ctx.gymId)))
    .returning();
  return row ?? null;
}

/**
 * Escribe el conjunto COMPLETO de columnas de estado que devolvió el
 * dominio — incluidas las que hay que poner en NULL. Ver
 * `resolverCambioDeVinculo()`: escribir solo `vinculo` dejaría datos de un
 * estado anterior colgados y los CHECK de coherencia de la base
 * rechazarían la fila.
 */
export async function actualizarVinculoAlumno(
  tx: TxClient,
  ctx: AuthContext,
  id: string,
  cambio: CambioDeVinculo,
) {
  const [row] = await tx
    .update(students)
    .set({ ...cambio, updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.gymId, ctx.gymId)))
    .returning();
  return row ?? null;
}

export async function listarPlanesActivos(tx: TxClient, ctx: AuthContext) {
  return tx
    .select({
      id: plans.id,
      nombre: plans.nombre,
      diasSemana: plans.diasSemana,
      precioActual: plans.precioActual,
    })
    .from(plans)
    .where(and(eq(plans.gymId, ctx.gymId), eq(plans.activo, true)))
    .orderBy(asc(plans.orden), asc(plans.nombre));
}

export async function existePlanEnGimnasio(tx: TxClient, ctx: AuthContext, planId: string) {
  const [row] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.gymId, ctx.gymId), eq(plans.activo, true)));
  return Boolean(row);
}

export interface NuevoEventoAlumno {
  studentId: string;
  tipo:
    | "ALTA"
    | "BAJA"
    | "REACTIVACION"
    | "PAUSA"
    | "REANUDACION"
    | "CAMBIO_PLAN"
    | "CONTACTO"
    | "NOTA";
  ocurridoEl: string;
  datos?: Record<string, unknown>;
}

/**
 * `student_events` es el HISTORIAL DE NEGOCIO del alumno — lo que se ve en
 * su ficha. Es distinto de `activity_log` (auditoría técnica, append-only,
 * con retención acotada), y Fase 0 los separó a propósito: uno se lee, el
 * otro se audita. Los cambios relevantes escriben en los dos, dentro de la
 * misma transacción.
 */
export async function registrarEventoDeAlumno(
  tx: TxClient,
  ctx: AuthContext,
  evento: NuevoEventoAlumno,
) {
  await tx.insert(studentEvents).values({
    gymId: ctx.gymId,
    studentId: evento.studentId,
    tipo: evento.tipo,
    ocurridoEl: evento.ocurridoEl,
    datos: evento.datos ?? {},
    creadoPor: ctx.userId,
  });
}

export async function listarEventosDeAlumno(
  tx: TxClient,
  ctx: AuthContext,
  studentId: string,
  limite = 20,
) {
  return tx
    .select({
      id: studentEvents.id,
      tipo: studentEvents.tipo,
      ocurridoEl: studentEvents.ocurridoEl,
      datos: studentEvents.datos,
      createdAt: studentEvents.createdAt,
      actorNombre: appUsers.nombre,
    })
    .from(studentEvents)
    .innerJoin(appUsers, eq(appUsers.id, studentEvents.creadoPor))
    .where(and(eq(studentEvents.gymId, ctx.gymId), eq(studentEvents.studentId, studentId)))
    .orderBy(desc(studentEvents.createdAt))
    .limit(limite);
}


/**
 * Los alumnos ACTIVOS con lo mínimo para derivar su situación de pago.
 *
 * No trae la situación: la situación no existe en la base. Trae los datos
 * con los que `situacionDeCobertura()` la calcula (SPEC V1 §5) — el
 * vínculo y la fecha de alta, que es lo que decide si a un alumno nuevo
 * todavía no se le reclama nada.
 */
export async function listarAlumnosActivosParaCobertura(tx: TxClient, ctx: AuthContext) {
  return tx
    .select({
      id: students.id,
      nombre: students.nombre,
      apellido: students.apellido,
      telefono: students.telefono,
      vinculo: students.vinculo,
      fechaAltaOriginal: students.fechaAltaOriginal,
      planNombre: plans.nombre,
    })
    .from(students)
    .innerJoin(plans, eq(plans.id, students.planId))
    .where(and(eq(students.gymId, ctx.gymId), eq(students.vinculo, "ACTIVO")))
    .orderBy(asc(students.apellido), asc(students.nombre));
}

/**
 * El movimiento del padrón en un rango: cuántos entraron, cuántos
 * volvieron y cuántos se fueron.
 *
 * Sale de `student_events` y no de contar filas de `students` por una
 * razón que importa: una BAJA no borra al alumno ni pisa su fecha de alta,
 * así que la única forma de saber QUÉ PASÓ EN ESTE MES es mirar los
 * hechos, no el estado actual.
 */
export async function contarMovimientoDelPadron(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
) {
  const filas = await tx
    .select({ tipo: studentEvents.tipo, total: count() })
    .from(studentEvents)
    .where(
      and(
        eq(studentEvents.gymId, ctx.gymId),
        gte(studentEvents.ocurridoEl, rango.desde),
        lte(studentEvents.ocurridoEl, rango.hasta),
      ),
    )
    .groupBy(studentEvents.tipo);

  const conteo: Record<string, number> = {};
  for (const fila of filas) conteo[fila.tipo] = fila.total;
  return {
    nuevos: conteo.ALTA ?? 0,
    volvieron: conteo.REACTIVACION ?? 0,
    dejaron: conteo.BAJA ?? 0,
    pausaron: conteo.PAUSA ?? 0,
  };
}

/** Los últimos hechos de negocio del gimnasio entero, para el panel. */
export async function listarEventosRecientes(tx: TxClient, ctx: AuthContext, limite = 8) {
  return tx
    .select({
      id: studentEvents.id,
      tipo: studentEvents.tipo,
      ocurridoEl: studentEvents.ocurridoEl,
      datos: studentEvents.datos,
      createdAt: studentEvents.createdAt,
      studentId: students.id,
      nombre: students.nombre,
      apellido: students.apellido,
      actorNombre: appUsers.nombre,
    })
    .from(studentEvents)
    .innerJoin(students, eq(students.id, studentEvents.studentId))
    .innerJoin(appUsers, eq(appUsers.id, studentEvents.creadoPor))
    .where(eq(studentEvents.gymId, ctx.gymId))
    // Por la fecha en que OCURRIÓ el hecho, no por cuándo se insertó la
    // fila. Un alta cargada hoy con fecha del mes pasado es una noticia
    // vieja: ordenar por `created_at` la pondría arriba de todo.
    .orderBy(desc(studentEvents.ocurridoEl), desc(studentEvents.createdAt))
    .limit(limite);
}

/** Las bajas, con su motivo, para la pantalla de bajas. */
export async function listarBajas(tx: TxClient, ctx: AuthContext, limite = 100) {
  return tx
    .select({
      id: students.id,
      nombre: students.nombre,
      apellido: students.apellido,
      telefono: students.telefono,
      planNombre: plans.nombre,
      fechaAltaOriginal: students.fechaAltaOriginal,
      bajaFecha: students.bajaFecha,
      bajaMotivoCodigo: students.bajaMotivoCodigo,
      bajaMotivoEtiqueta: students.bajaMotivoEtiqueta,
      bajaObservacion: students.bajaObservacion,
    })
    .from(students)
    .innerJoin(plans, eq(plans.id, students.planId))
    .where(and(eq(students.gymId, ctx.gymId), eq(students.vinculo, "BAJA")))
    .orderBy(desc(students.bajaFecha))
    .limit(limite);
}

/**
 * Solo los nombres, para detectar duplicados al importar una planilla.
 *
 * Incluye a los dados de baja a propósito: alguien que se fue y vuelve NO
 * es un alumno nuevo — importarlo otra vez crearía una persona duplicada y
 * le partiría el historial de pagos en dos.
 */
export async function listarNombresDeAlumnos(tx: TxClient, ctx: AuthContext) {
  return tx
    .select({ id: students.id, nombre: students.nombre, apellido: students.apellido })
    .from(students)
    .where(eq(students.gymId, ctx.gymId))
    .orderBy(asc(students.apellido));
}
