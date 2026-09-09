"use server";

import { revalidatePath } from "next/cache";
import { marcarAsistenciaAction, desmarcarAsistenciaAction } from "@/use-cases/asistencias/registrar";

/**
 * Frontera delgada, mismo criterio que `alumnos/actions.ts`: traduce el
 * pedido del cliente al caso de uso y listo. Sin lógica de negocio acá.
 */
export async function marcarAsistencia(studentId: string): Promise<{ ok: boolean }> {
  const resultado = await marcarAsistenciaAction({ studentId });
  if (resultado.ok) revalidatePath("/asistencias");
  return { ok: resultado.ok };
}

export async function desmarcarAsistencia(studentId: string): Promise<{ ok: boolean }> {
  const resultado = await desmarcarAsistenciaAction({ studentId });
  if (resultado.ok) revalidatePath("/asistencias");
  return { ok: resultado.ok };
}
