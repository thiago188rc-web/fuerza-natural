import { z } from "zod";
import { normalizarTelefono, normalizarTexto, telefonoArgentino } from "@/domain/alumnos/identidad";
import { CANALES, ordenarCanales } from "@/domain/alumnos/como-conocio";
import { VINCULOS } from "@/domain/alumnos/vinculo";
import { GENEROS } from "@/domain/alumnos/genero";
import { DISCIPLINAS } from "@/domain/alumnos/disciplina";
import { opcional } from "./_helpers";

/**
 * Forma de los datos en el borde (SPEC V1 §12): tipos, largos y formatos.
 * Las invariantes de negocio (¿esta transición de estado es válida?, ¿esta
 * fecha es coherente con el historial?) NO viven acá — viven en
 * `src/domain/alumnos/`, y se evalúan en el caso de uso.
 *
 * Todo esto corre SIEMPRE del lado del servidor. El navegador puede validar
 * lo mismo para dar feedback rápido, pero esa corrida no cuenta para nada.
 */

const nombre = z
  .string({ error: "Ingresá un nombre." })
  .transform(normalizarTexto)
  .pipe(
    z
      .string()
      .min(1, "El nombre es obligatorio.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
  );

const apellido = z
  .string({ error: "Ingresá un apellido." })
  .transform(normalizarTexto)
  .pipe(
    z
      .string()
      .min(1, "El apellido es obligatorio.")
      .max(80, "El apellido no puede superar los 80 caracteres."),
  );

/**
 * Opcional desde Fase 1. Se GUARDA siempre en E.164 — el mismo formato
 * que el CHECK de la base, para que la app y Postgres nunca discrepen.
 *
 * Se ACEPTA también como se escribe en Argentina ("280 400 1234"): el
 * sistema es para gimnasios de acá, y un número local de 10 dígitos tiene
 * una sola lectura (+549…, ver `telefonoArgentino`). Lo ambiguo (un dígito
 * de menos, el 15 en el medio) se sigue rechazando: no se completa a ciegas.
 */
const telefono = z
  .string()
  .transform((valor) => {
    const limpio = normalizarTelefono(valor);
    if (limpio.startsWith("+")) return limpio;
    return telefonoArgentino(limpio) ?? limpio;
  })
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        "Teléfono inválido. Escribilo con característica, ej: 280 400 1234 o +54 9 280 400 1234.",
      ),
  );

/** DNI: se guardan solo los dígitos ("30.123.456" → "30123456"), que es como se busca. */
const documento = z
  .string()
  .transform((valor) => valor.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(/^[0-9A-Za-z]{5,15}$/, "DNI inválido."));

const direccion = z
  .string()
  .transform(normalizarTexto)
  .pipe(z.string().max(200, "La dirección no puede superar los 200 caracteres."));

/**
 * "¿Cómo conoció el gimnasio?" — una o más opciones del catálogo. Llega
 * como lista (checkboxes); una lista vacía es "sin dato" y se guarda NULL.
 */
const comoConocio = z
  .array(z.string())
  .max(CANALES.length)
  .refine((lista) => lista.every((c) => (CANALES as readonly string[]).includes(c)), "Opción inválida.")
  .transform((lista) => {
    const ordenada = ordenarCanales(lista);
    return ordenada.length > 0 ? ordenada : null;
  });

const notas = z
  .string()
  .transform(normalizarTexto)
  .pipe(z.string().max(1000, "Las observaciones no pueden superar los 1000 caracteres."));

const planId = z.string().uuid("Elegí un plan.");
const fechaCivil = z.string().date("Fecha inválida. Usá el formato AAAA-MM-DD.");
const genero = z.string({ error: "Género inválido." }).pipe(z.enum(GENEROS, { error: "Género inválido." }));
const disciplina = z
  .string({ error: "Disciplina inválida." })
  .pipe(z.enum(DISCIPLINAS, { error: "Disciplina inválida." }));

/** Alta. Estado inicial ACTIVO — no se pide ni se acepta del cliente. */
export const crearAlumnoSchema = z.object({
  nombre,
  apellido,
  telefono: opcional(telefono),
  planId,
  /** Si no viene, el caso de uso usa "hoy" en la TZ del gimnasio. */
  fechaAltaOriginal: opcional(fechaCivil),
  notas: opcional(notas),
  email: opcional(z.string().trim().email("Email inválido.")),
  documento: opcional(documento),
  fechaNacimiento: opcional(fechaCivil),
  genero: opcional(genero),
  disciplina: opcional(disciplina),
  direccion: opcional(direccion),
  comoConocio: comoConocio.optional(),
});

/** Lo que sale de validar (normalizado). Lo consume el caso de uso. */
export type CrearAlumnoInput = z.infer<typeof crearAlumnoSchema>;
/** Lo que entra desde el formulario, sin normalizar. Es lo que recibe la Server Action. */
export type CrearAlumnoRaw = z.input<typeof crearAlumnoSchema>;

/**
 * Edición. Cambiar el ESTADO no se hace por acá a propósito: es otra
 * operación de negocio, con otras reglas y otro registro en el historial
 * (ver `cambiarVinculoSchema`). Mezclarlas haría que un formulario de
 * datos personales pudiera dar de baja a alguien sin decirlo.
 */
export const editarAlumnoSchema = z.object({
  id: z.string().uuid(),
  nombre,
  apellido,
  telefono: opcional(telefono),
  planId,
  fechaAltaOriginal: fechaCivil,
  notas: opcional(notas),
  genero: opcional(genero),
  fechaNacimiento: opcional(fechaCivil),
  disciplina: opcional(disciplina),
  documento: opcional(documento),
  direccion: opcional(direccion),
  comoConocio: comoConocio.optional(),
});

export type EditarAlumnoInput = z.infer<typeof editarAlumnoSchema>;
export type EditarAlumnoRaw = z.input<typeof editarAlumnoSchema>;

export const cambiarVinculoSchema = z.object({
  id: z.string().uuid(),
  // `.pipe()` en vez de un enum pelado: así el tipo de ENTRADA es `string`,
  // que es lo que realmente llega de un formulario HTTP. El tipo de salida
  // sigue siendo `Vinculo`, y un valor inventado se rechaza acá.
  vinculo: z
    .string({ error: "Estado inválido." })
    .pipe(z.enum(VINCULOS, { error: "Estado inválido." })),
  pausaHasta: opcional(fechaCivil),
  nota: opcional(
    z.string().transform(normalizarTexto).pipe(z.string().max(300, "La nota no puede superar los 300 caracteres.")),
  ),
  /**
   * Código del motivo de baja, del catálogo del gimnasio. Solo el CÓDIGO:
   * la etiqueta la resuelve el servidor contra su propio catálogo, porque
   * es lo que queda guardado para siempre en el registro de la baja.
   */
  motivoCodigo: opcional(z.string().trim().max(40)),
});

export type CambiarVinculoInput = z.infer<typeof cambiarVinculoSchema>;
export type CambiarVinculoRaw = z.input<typeof cambiarVinculoSchema>;

/** Filtros del listado. Llegan de la URL, así que todo es string o nada. */
export const ESTADO_FILTRO_TODOS = "TODOS" as const;

export const filtrosAlumnosSchema = z.object({
  q: opcional(z.string().trim().max(80)),
  estado: z.enum([ESTADO_FILTRO_TODOS, ...VINCULOS]).catch(ESTADO_FILTRO_TODOS),
  pagina: z.coerce.number().int().min(1).catch(1),
});

export type FiltrosAlumnos = z.infer<typeof filtrosAlumnosSchema>;
