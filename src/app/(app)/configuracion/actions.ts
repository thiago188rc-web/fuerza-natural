"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarActivoDePlanAction,
  actualizarParametrosAction,
  actualizarPreciosAction,
  agregarMotivoDeBajaAction,
} from "@/use-cases/gimnasio/configuracion";
import type { EstadoFormulario } from "@/app/(app)/alumnos/estado-formulario";
import type { Result } from "@/use-cases/_kernel/result";

/**
 * La frontera entre la pantalla de configuración y sus casos de uso.
 * Traduce `FormData` a input y `Result` a algo que el formulario puede
 * mostrar. Ninguna regla de negocio vive acá.
 */

function aEstado(resultado: Result<unknown, unknown>, mensajeOk: string): EstadoFormulario {
  if (resultado.ok) return { ok: true, mensaje: mensajeOk };

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
    case "NOT_FOUND":
      return { ok: false, mensaje: "No encontramos la configuración del gimnasio." };
    case "FORBIDDEN":
      return {
        ok: false,
        mensaje: "Solo el dueño puede cambiar precios y parámetros de cobro.",
      };
    default:
      return { ok: false, mensaje: "No pudimos guardar los cambios." };
  }
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function guardarPreciosFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Los precios llegan como `precio:<planId>`. Se leen del propio FormData
  // en vez de recibir una lista de ids aparte: así no hay forma de que la
  // pantalla mande un id que no corresponde a un campo real del formulario.
  const precios: { planId: string; precio: string }[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith("precio:") && typeof valor === "string") {
      precios.push({ planId: clave.slice("precio:".length), precio: valor });
    }
  }

  const resultado = await actualizarPreciosAction({
    precios,
    precioMedioMes: texto(formData, "precioMedioMes"),
  });

  if (resultado.ok) {
    // La situación de pago y los importes sugeridos se derivan de esto.
    revalidatePath("/configuracion");
    revalidatePath("/dashboard");
    revalidatePath("/pagos/nuevo");
  }

  return aEstado(
    resultado,
    resultado.ok && resultado.data.cambios === 0
      ? "No había nada que cambiar."
      : "Precios actualizados. Los pagos ya registrados no cambian.",
  );
}

/** Prende/apaga un plan para el alta de alumnos nuevos. Se llama directo desde el switch, sin formulario. */
export async function cambiarActivoDePlanAction(
  planId: string,
  activo: boolean,
): Promise<{ ok: boolean; mensaje?: string }> {
  const resultado = await actualizarActivoDePlanAction({ planId, activo });
  if (resultado.ok) {
    revalidatePath("/configuracion");
    revalidatePath("/alumnos/nuevo");
    return { ok: true };
  }
  return { ok: false, mensaje: aEstado(resultado, "").mensaje };
}

export async function agregarMotivoDeBajaFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await agregarMotivoDeBajaAction({ etiqueta: texto(formData, "etiqueta") });

  if (resultado.ok) revalidatePath("/configuracion");

  return aEstado(
    resultado,
    resultado.ok ? `Motivo "${resultado.data.motivo.etiqueta}" agregado.` : "",
  );
}

export async function guardarParametrosFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await actualizarParametrosAction({
    ventanaPagoDesde: texto(formData, "ventanaPagoDesde"),
    ventanaPagoHasta: texto(formData, "ventanaPagoHasta"),
    diasGracia: texto(formData, "diasGracia"),
    diasNuevoSinPago: texto(formData, "diasNuevoSinPago"),
  });

  if (resultado.ok) {
    revalidatePath("/configuracion");
    revalidatePath("/dashboard");
    revalidatePath("/alumnos");
  }

  return aEstado(resultado, "Parámetros guardados.");
}
