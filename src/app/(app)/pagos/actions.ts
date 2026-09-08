"use server";

import { revalidatePath } from "next/cache";
import { registrarPagoAction } from "@/use-cases/pagos/registrar-pago";
import type { EstadoPago } from "./estado-formulario";

/**
 * La frontera entre la pantalla de cobro y el caso de uso. Traduce
 * `FormData` a input y `Result` a algo que el formulario puede mostrar.
 * Ninguna regla de negocio vive acá.
 *
 * Toda la autorización ocurre adentro del caso de uso (`withAuth`): una
 * Server Action es un endpoint HTTP público y cualquiera que conozca su
 * id la puede invocar sin pasar por esta pantalla.
 */

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function registrarPagoFormAction(
  _prev: EstadoPago,
  formData: FormData,
): Promise<EstadoPago> {
  const resultado = await registrarPagoAction({
    studentId: texto(formData, "studentId"),
    fechaPago: texto(formData, "fechaPago"),
    modalidad: texto(formData, "modalidad") as "MES_COMPLETO" | "MEDIO_MES",
    cubreDesde: texto(formData, "cubreDesde"),
    monto: texto(formData, "monto"),
    metodo: texto(formData, "metodo") as "EFECTIVO",
    nota: texto(formData, "nota"),
    idempotencyKey: texto(formData, "idempotencyKey"),
    confirmarSuperposicion: formData.get("confirmarSuperposicion") === "1",
  });

  if (resultado.ok) {
    // La cobertura cambió: el panel, el listado de alumnos y la ficha
    // muestran situación derivada de estos datos.
    revalidatePath("/dashboard");
    revalidatePath("/pagos");
    revalidatePath("/alumnos");
    revalidatePath(`/alumnos/${resultado.data.studentId}`);
    return { ok: true, registrado: resultado.data };
  }

  switch (resultado.kind) {
    case "VALIDATION": {
      const errores: Record<string, string> = {};
      for (const issue of resultado.issues) {
        if (!errores[issue.path]) errores[issue.path] = issue.message;
      }
      return { ok: false, errores, mensaje: "Revisá los datos marcados." };
    }
    case "CONFIRMACION_REQUERIDA":
      return { ok: false, superposicion: resultado.confirmacion };
    case "CONFLICT":
      return { ok: false, mensaje: resultado.message };
    case "NOT_FOUND":
      return { ok: false, mensaje: "No encontramos ese alumno." };
    case "FORBIDDEN":
      return { ok: false, mensaje: "No tenés permiso para hacer esto, o tu sesión venció." };
  }
}
