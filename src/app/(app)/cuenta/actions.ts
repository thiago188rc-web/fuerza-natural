"use server";

import { revalidatePath } from "next/cache";
import { cambiarContrasenaAction } from "@/use-cases/cuenta/contrasena";
import type { EstadoContrasena } from "./estado-formulario";

/**
 * Frontera del cambio de contraseña: FormData → caso de uso → estado del
 * formulario. Las contraseñas no se devuelven nunca, ni en los errores: el
 * formulario se vacía después de cada envío y eso es lo correcto acá.
 */
function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function cambiarContrasenaFormAction(
  _prev: EstadoContrasena,
  formData: FormData,
): Promise<EstadoContrasena> {
  const actual = texto(formData, "actual");
  const resultado = await cambiarContrasenaAction({
    actual: actual === "" ? undefined : actual,
    nueva: texto(formData, "nueva"),
    repetida: texto(formData, "repetida"),
  });

  if (resultado.ok) {
    revalidatePath("/actividad");
    return {
      ok: true,
      mensaje: "Listo: tu contraseña cambió.",
      otrasSesionesCerradas: resultado.data.otrasSesionesCerradas,
    };
  }

  switch (resultado.kind) {
    case "VALIDATION": {
      const errores: Record<string, string> = {};
      for (const issue of resultado.issues) {
        if (!errores[issue.path]) errores[issue.path] = issue.message;
      }
      return { ok: false, errores, mensaje: "Revisá los datos marcados." };
    }
    case "CONFLICT":
      return { ok: false, mensaje: resultado.message };
    case "FORBIDDEN":
      return { ok: false, mensaje: "Tu sesión venció. Volvé a entrar y probá de nuevo." };
    default:
      return { ok: false, mensaje: "No pudimos cambiar la contraseña. Probá de nuevo." };
  }
}
