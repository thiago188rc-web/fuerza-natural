import { and, eq, gte, lte } from "drizzle-orm";
import { attendance } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";

/**
 * Repositorio de asistencia. Mismas reglas que el resto (SPEC V1 §15):
 * recibe siempre `(tx, ctx, ...)`, filtra por `gym_id` explícito además de
 * RLS. Nunca hace DELETE — `fn_app` no tiene ese privilegio en ninguna
 * tabla — así que "deshacer" es un UPDATE de `activo`.
 */

export interface MarcaDeAsistencia {
  studentId: string;
  fecha: string;
}

/** Marca presente. Si ya existía una fila de ese día (quizás inactiva), la reactiva. */
export async function registrarAsistencia(
  tx: TxClient,
  ctx: AuthContext,
  input: MarcaDeAsistencia,
) {
  const [row] = await tx
    .insert(attendance)
    .values({
      gymId: ctx.gymId,
      studentId: input.studentId,
      fecha: input.fecha,
      activo: true,
      registradoPor: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [attendance.gymId, attendance.studentId, attendance.fecha],
      set: { activo: true, registradoPor: ctx.userId },
    })
    .returning();
  return row;
}

/** Deshace una marca de hoy — UPDATE, nunca DELETE. */
export async function quitarAsistencia(
  tx: TxClient,
  ctx: AuthContext,
  input: MarcaDeAsistencia,
) {
  await tx
    .update(attendance)
    .set({ activo: false })
    .where(
      and(
        eq(attendance.gymId, ctx.gymId),
        eq(attendance.studentId, input.studentId),
        eq(attendance.fecha, input.fecha),
      ),
    );
}

/** Los IDs de alumnos con una marca ACTIVA ese día exacto. */
export async function asistenciasDelDia(tx: TxClient, ctx: AuthContext, fecha: string) {
  const filas = await tx
    .selectDistinct({ studentId: attendance.studentId })
    .from(attendance)
    .where(
      and(eq(attendance.gymId, ctx.gymId), eq(attendance.fecha, fecha), eq(attendance.activo, true)),
    );
  return new Set(filas.map((f) => f.studentId));
}

/** Los IDs de alumnos con al menos una marca ACTIVA en el rango (para Métricas). */
export async function asistieronEnRango(
  tx: TxClient,
  ctx: AuthContext,
  rango: { desde: string; hasta: string },
) {
  const filas = await tx
    .selectDistinct({ studentId: attendance.studentId })
    .from(attendance)
    .where(
      and(
        eq(attendance.gymId, ctx.gymId),
        eq(attendance.activo, true),
        gte(attendance.fecha, rango.desde),
        lte(attendance.fecha, rango.hasta),
      ),
    );
  return new Set(filas.map((f) => f.studentId));
}
