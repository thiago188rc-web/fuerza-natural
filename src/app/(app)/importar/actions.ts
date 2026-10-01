"use server";

import { revalidatePath } from "next/cache";
import { importarAlumnosAction } from "@/use-cases/importacion/importar-alumnos";
import type { ImportarAlumnosRaw } from "@/schemas/importacion";

/**
 * La frontera entre el asistente de importación y el caso de uso. Fina a
 * propósito, como el resto de los actions.ts: traduce el `Result` a algo
 * que la pantalla puede mostrar. La autorización (solo DUEÑO) y TODAS las
 * reglas viven en `importarAlumnosAction` — una Server Action es un
 * endpoint público y esta función no protege nada por sí misma.
 */
export async function importarAlumnos(input: ImportarAlumnosRaw) {
  const resultado = await importarAlumnosAction(input);

  if (resultado.ok) {
    if (resultado.data.importados > 0) {
      revalidatePath("/alumnos");
      revalidatePath("/dashboard");
      revalidatePath("/importar");
    }
    return { ok: true as const, data: resultado.data };
  }

  switch (resultado.kind) {
    case "VALIDATION":
      return { ok: false as const, mensaje: resultado.issues[0]?.message ?? "El archivo no tiene un formato válido." };
    case "FORBIDDEN":
      return { ok: false as const, mensaje: "Solo el dueño puede importar alumnos." };
    case "CONFLICT":
      return { ok: false as const, mensaje: resultado.message };
    default:
      return { ok: false as const, mensaje: "No pudimos importar. Probá de nuevo." };
  }
}
