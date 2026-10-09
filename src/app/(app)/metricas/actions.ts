"use server";

import {
  pagosDelPeriodoQuery,
  type DetalleDelPeriodo,
  type PagoDelPeriodoInput,
} from "@/use-cases/metricas/pagos-del-periodo";
import {
  activosPorMesQuery,
  captacionDelMesQuery,
  type CaptacionDelMesResultado,
  type Metricas,
} from "@/use-cases/metricas/consultas";

/**
 * La frontera entre el gráfico de tendencia (Client Component) y el caso
 * de uso. Se llama directo desde `onClick`, no desde un `<form>`: acá no
 * hay `FormData` que traducir, así que la Server Action pasa el input tal
 * cual y solo aplana el `Result` a algo simple de mostrar.
 */
export async function pagosDelPeriodoAction(
  input: PagoDelPeriodoInput,
): Promise<({ ok: true } & DetalleDelPeriodo) | { ok: false; mensaje: string }> {
  const resultado = await pagosDelPeriodoQuery(input);
  if (resultado.ok) return { ok: true, ...resultado.data };

  return {
    ok: false,
    mensaje:
      resultado.kind === "FORBIDDEN"
        ? "No tenés permiso para ver esto, o tu sesión venció."
        : "No pudimos traer los pagos de ese día.",
  };
}

/**
 * Las flechas de "Alumnos activos por mes" llaman esto directo, sin pasar
 * por la URL ni recargar la página: solo este gráfico se actualiza.
 */
export async function activosPorMesAction(
  mes: string,
): Promise<({ ok: true } & Metricas["activosPorMesNavegable"]) | { ok: false; mensaje: string }> {
  const resultado = await activosPorMesQuery({ mes });
  if (resultado.ok) return { ok: true, ...resultado.data };

  return {
    ok: false,
    mensaje:
      resultado.kind === "FORBIDDEN"
        ? "No tenés permiso para ver esto, o tu sesión venció."
        : "No pudimos traer los alumnos activos de ese mes.",
  };
}

/** Las flechas de la torta "Cómo nos conocieron" por mes llaman esto directo. */
export async function captacionDelMesAction(
  mes: string,
): Promise<({ ok: true } & CaptacionDelMesResultado) | { ok: false; mensaje: string }> {
  const resultado = await captacionDelMesQuery({ mes });
  if (resultado.ok) return { ok: true, ...resultado.data };

  return {
    ok: false,
    mensaje:
      resultado.kind === "FORBIDDEN"
        ? "No tenés permiso para ver esto, o tu sesión venció."
        : "No pudimos traer cómo conocieron ese mes.",
  };
}
