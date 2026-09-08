import { and, desc, eq, lt, sql } from "drizzle-orm";
import { activityLog, appUsers } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";

/**
 * Lecturas del log de auditoría.
 *
 * Este archivo NO tiene función de escritura ni de borrado, y no es un
 * olvido: `activity_log` se escribe únicamente desde `logActivity()`,
 * dentro de la misma transacción que el cambio que registra. Borrarlo o
 * editarlo es imposible en cuatro capas independientes (permisos, RLS,
 * trigger y ausencia de superficie) — ver docs/SECURITY.md.
 */

export const ACTIVIDAD_POR_PAGINA = 40;

/**
 * Paginado por CURSOR y no por offset. Un log crece sin parar y se lee de
 * lo más nuevo a lo más viejo: con `offset` la página 20 obliga a Postgres
 * a contar 800 filas antes de devolver 40, y una escritura nueva corre
 * todas las páginas un lugar. Con cursor, cada página es un rango indexado
 * y el resultado es estable aunque entre actividad mientras se lee.
 */
export async function listarActividad(
  tx: TxClient,
  ctx: AuthContext,
  cursor?: string | null,
) {
  const condiciones = [eq(activityLog.gymId, ctx.gymId)];
  if (cursor) condiciones.push(lt(activityLog.ocurridoEn, new Date(cursor)));

  const filas = await tx
    .select({
      id: activityLog.id,
      accion: activityLog.accion,
      entidad: activityLog.entidad,
      entidadId: activityLog.entidadId,
      resumen: activityLog.resumen,
      ocurridoEn: activityLog.ocurridoEn,
      // El nombre para mostrar sale de `app_users`; el email y el rol
      // vienen del SNAPSHOT del momento del hecho. Si mañana el usuario
      // cambia de rol o se desactiva, la fila sigue diciendo con qué rol
      // hizo esto — que es el punto de una auditoría.
      actorNombre: appUsers.nombre,
      actorEmail: activityLog.actorEmailSnapshot,
      actorRol: activityLog.actorRolSnapshot,
    })
    .from(activityLog)
    .innerJoin(appUsers, eq(appUsers.id, activityLog.actorUserId))
    .where(and(...condiciones))
    .orderBy(desc(activityLog.ocurridoEn))
    .limit(ACTIVIDAD_POR_PAGINA + 1);

  // Se pide una fila de más solo para saber si hay página siguiente, sin
  // tener que contar el total de un log que puede tener millones de filas.
  const hayMas = filas.length > ACTIVIDAD_POR_PAGINA;
  return {
    filas: hayMas ? filas.slice(0, ACTIVIDAD_POR_PAGINA) : filas,
    proximoCursor: hayMas ? filas[ACTIVIDAD_POR_PAGINA - 1].ocurridoEn.toISOString() : null,
  };
}

/** Cuántos registros de auditoría hay en total (para el pie de la pantalla). */
export async function contarActividad(tx: TxClient, ctx: AuthContext) {
  const [fila] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(eq(activityLog.gymId, ctx.gymId));
  return fila?.total ?? 0;
}
