import { z } from "zod";

/**
 * Un `<input>` vacío llega como `""`, no como `undefined`. Sin esta
 * conversión, todo campo opcional del formulario fallaría la validación de
 * formato (un email vacío no es un email válido) en vez de quedar
 * simplemente sin valor. Se aplica en el borde, del lado del servidor.
 */
export function opcional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
    schema.optional(),
  );
}
