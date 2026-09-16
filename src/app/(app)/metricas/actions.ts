"use server";

import {
  pagosDelPeriodoQuery,
  type DetalleDelPeriodo,
  type PagoDelPeriodoInput,
} from "@/use-cases/metricas/pagos-del-periodo";

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
