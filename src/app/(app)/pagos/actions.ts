"use server";

import { revalidatePath } from "next/cache";
import { registrarPagoAction } from "@/use-cases/pagos/registrar-pago";
import { anularPagoAction } from "@/use-cases/pagos/anular-pago";
import { cambiarDiasDelPagoAction } from "@/use-cases/pagos/cambiar-dias-del-pago";
import type { EstadoAnulacion, EstadoCambioDeDias, EstadoPago } from "./estado-formulario";

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
    // Ausente (una pantalla abierta antes de este cambio) = un mes.
    meses: formData.has("meses") ? texto(formData, "meses") : undefined,
    monto: texto(formData, "monto"),
    // Ausente (una pantalla abierta antes de este cambio) = plan habitual.
    // Presente pero vacío = no eligió cuántos días: lo rechaza el schema.
    planId: formData.has("planId") ? texto(formData, "planId") : undefined,
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
    revalidatePath("/metricas");
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

/**
 * Anular un pago cargado por error. La autorización (solo DUENO), el
 * motivo obligatorio y el "ya estaba anulado" viven en el caso de uso.
 */
export async function anularPagoFormAction(
  _prev: EstadoAnulacion,
  formData: FormData,
): Promise<EstadoAnulacion> {
  const resultado = await anularPagoAction({
    paymentId: texto(formData, "paymentId"),
    motivo: texto(formData, "motivo"),
  });

  if (resultado.ok) {
    // Cambian la cobertura y lo cobrado: todo lo que se deriva de eso.
    revalidatePath("/dashboard");
    revalidatePath("/pagos");
    revalidatePath("/alumnos");
    revalidatePath("/metricas");
    revalidatePath("/actividad");
    revalidatePath(`/alumnos/${resultado.data.studentId}`);
    return { ok: true, anulado: resultado.data.id, mensaje: "Pago anulado." };
  }

  switch (resultado.kind) {
    case "VALIDATION": {
      const errores: Record<string, string> = {};
      for (const issue of resultado.issues) {
        if (!errores[issue.path]) errores[issue.path] = issue.message;
      }
      return { ok: false, errores, mensaje: errores.paymentId ?? "Revisá el motivo." };
    }
    case "CONFLICT":
      return { ok: false, mensaje: resultado.message };
    case "NOT_FOUND":
      return { ok: false, mensaje: "No encontramos ese pago." };
    case "FORBIDDEN":
      return { ok: false, mensaje: "Solo el dueño puede anular pagos, o tu sesión venció." };
    case "CONFIRMACION_REQUERIDA":
      return { ok: false, mensaje: "Esta operación necesita una confirmación." };
  }
}

/**
 * Cambiar los días de un pago ya cargado: anula el viejo y registra uno
 * igual con el plan nuevo, en una sola transacción. La autorización (solo
 * DUENO) y todas las reglas viven en el caso de uso.
 */
export async function cambiarDiasDelPagoFormAction(
  _prev: EstadoCambioDeDias,
  formData: FormData,
): Promise<EstadoCambioDeDias> {
  const resultado = await cambiarDiasDelPagoAction({
    paymentId: texto(formData, "paymentId"),
    planId: texto(formData, "planId"),
    monto: texto(formData, "monto"),
  });

  if (resultado.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/pagos");
    revalidatePath("/alumnos");
    revalidatePath("/metricas");
    revalidatePath("/actividad");
    revalidatePath(`/alumnos/${resultado.data.studentId}`);
    return { ok: true, anulado: resultado.data.anuladoId, mensaje: "Pago actualizado." };
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
    case "NOT_FOUND":
      return { ok: false, mensaje: "No encontramos ese pago." };
    case "FORBIDDEN":
      return { ok: false, mensaje: "Solo el dueño puede cambiar un pago, o tu sesión venció." };
    case "CONFIRMACION_REQUERIDA":
      return { ok: false, mensaje: "Esta operación necesita una confirmación." };
  }
}
