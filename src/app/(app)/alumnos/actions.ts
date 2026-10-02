"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearAlumnoAction } from "@/use-cases/alumnos/crear-alumno";
import { editarAlumnoAction } from "@/use-cases/alumnos/editar-alumno";
import { cambiarVinculoAction } from "@/use-cases/alumnos/cambiar-vinculo";
import { asignarGeneroAction } from "@/use-cases/alumnos/asignar-genero";
import type { Result } from "@/use-cases/_kernel/result";
// El tipo y el estado inicial viven aparte: un módulo "use server" solo
// puede exportar funciones async (ver estado-formulario.ts).
import type { EstadoFormulario } from "./estado-formulario";

/**
 * La frontera entre las pantallas y los casos de uso. Estas funciones son
 * deliberadamente finas: traducen `FormData` a input y `Result` a algo que
 * un formulario de React puede mostrar. Ninguna regla de negocio vive acá
 * — si aparece un `if` de negocio en este archivo, va en `src/domain/` o
 * en el caso de uso.
 *
 * Toda la autorización ocurre adentro del caso de uso (`withAuth`), no
 * acá: una Server Action es un endpoint HTTP público, y cualquiera que
 * conozca su id la puede invocar sin pasar por la pantalla.
 */

/**
 * Nunca se le muestra al usuario el error técnico. `withAuth()` ya
 * convierte cualquier excepción en un CONFLICT con mensaje genérico y deja
 * el detalle real en los logs del servidor.
 */
function aEstadoFormulario(resultado: Result<unknown, unknown>): EstadoFormulario {
  if (resultado.ok) return { ok: true };

  switch (resultado.kind) {
    case "VALIDATION": {
      const errores: Record<string, string> = {};
      for (const issue of resultado.issues) {
        // El primer error de cada campo es el que se muestra.
        if (!errores[issue.path]) errores[issue.path] = issue.message;
      }
      return { ok: false, errores, mensaje: "Revisá los datos marcados." };
    }
    case "CONFLICT":
      return { ok: false, mensaje: resultado.message };
    case "NOT_FOUND":
      return { ok: false, mensaje: "No encontramos ese alumno." };
    case "FORBIDDEN":
      return { ok: false, mensaje: "No tenés permiso para hacer esto, o tu sesión venció." };
    case "CONFIRMACION_REQUERIDA":
      return { ok: false, mensaje: "Esta operación necesita una confirmación." };
  }
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Lo que llegó en el formulario, para devolvérselo si el guardado falla. */
function valoresEnviados(formData: FormData): Record<string, string | string[]> {
  const valores: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    if (clave.startsWith("$")) continue; // metadatos internos de React
    const todos = formData.getAll(clave).filter((v): v is string => typeof v === "string");
    valores[clave] = clave === "comoConocio" ? todos : (todos[0] ?? "");
  }
  return valores;
}

/** Los checkboxes con el mismo nombre llegan como varios valores. */
function lista(formData: FormData, campo: string): string[] {
  return formData.getAll(campo).filter((v): v is string => typeof v === "string");
}

export async function crearAlumnoFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await crearAlumnoAction({
    nombre: texto(formData, "nombre"),
    apellido: texto(formData, "apellido"),
    telefono: texto(formData, "telefono"),
    planId: texto(formData, "planId"),
    fechaAltaOriginal: texto(formData, "fechaAltaOriginal"),
    notas: texto(formData, "notas"),
    genero: texto(formData, "genero"),
    fechaNacimiento: texto(formData, "fechaNacimiento"),
    disciplina: texto(formData, "disciplina"),
    documento: texto(formData, "documento"),
    direccion: texto(formData, "direccion"),
    comoConocio: lista(formData, "comoConocio"),
    // El schema de Zod ignora cualquier otro campo que llegue: `gymId` no
    // existe en la forma de entrada, así que no hay manera de mandarlo.
  });

  if (!resultado.ok) {
    return { ...aEstadoFormulario(resultado), valores: valoresEnviados(formData), intento: Date.now() };
  }

  revalidatePath("/alumnos");
  redirect(`/alumnos/${resultado.data.id}?alta=1`);
}

export async function editarAlumnoFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = texto(formData, "id");
  const resultado = await editarAlumnoAction({
    id,
    nombre: texto(formData, "nombre"),
    apellido: texto(formData, "apellido"),
    telefono: texto(formData, "telefono"),
    planId: texto(formData, "planId"),
    fechaAltaOriginal: texto(formData, "fechaAltaOriginal"),
    notas: texto(formData, "notas"),
    genero: texto(formData, "genero"),
    fechaNacimiento: texto(formData, "fechaNacimiento"),
    disciplina: texto(formData, "disciplina"),
    documento: texto(formData, "documento"),
    direccion: texto(formData, "direccion"),
    comoConocio: lista(formData, "comoConocio"),
  });

  if (!resultado.ok) {
    return { ...aEstadoFormulario(resultado), valores: valoresEnviados(formData), intento: Date.now() };
  }

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${id}`);
  redirect(`/alumnos/${id}?guardado=1`);
}

export async function cambiarVinculoFormAction(
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = texto(formData, "id");
  const resultado = await cambiarVinculoAction({
    id,
    vinculo: texto(formData, "vinculo"),
    pausaHasta: texto(formData, "pausaHasta"),
    nota: texto(formData, "nota"),
    motivoCodigo: texto(formData, "motivoCodigo"),
  });

  if (!resultado.ok) return aEstadoFormulario(resultado);

  revalidatePath("/alumnos");
  revalidatePath("/bajas");
  revalidatePath("/actividad");
  revalidatePath("/dashboard");
  revalidatePath(`/alumnos/${id}`);
  return { ok: true, mensaje: "Estado actualizado.", vinculoAplicado: resultado.data.vinculo };
}

/**
 * El atajo de "completar género": un toque por alumno, sin pasar por la
 * edición completa de la ficha. Devuelve el resultado en vez de redirigir:
 * la pantalla sigue con el próximo.
 */
export async function asignarGeneroAccion(id: string, genero: string): Promise<EstadoFormulario> {
  const resultado = await asignarGeneroAction({ id, genero });
  if (!resultado.ok) return aEstadoFormulario(resultado);
  revalidatePath("/metricas");
  revalidatePath(`/alumnos/${id}`);
  return { ok: true };
}
