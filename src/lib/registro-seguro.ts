/**
 * Qué se escribe en los logs del servidor cuando algo falla — y qué no.
 *
 * Los logs de Vercel los lee cualquiera con acceso al proyecto y se
 * conservan fuera de la base, así que no pueden llevar datos de los
 * alumnos. El caso que lo motivó: `withAuth` hacía `console.error(err)`, y
 * un error de Drizzle trae la consulta Y SUS PARÁMETROS (nombre, teléfono,
 * DNI, dirección) en el mensaje y en propiedades propias. Un alta fallida
 * por un DNI repetido dejaba la ficha entera en el log.
 *
 * Lo que sí queda alcanza para diagnosticar: el tipo de error, el código
 * de Postgres (23505 = duplicado, 22P02 = formato inválido…), la
 * restricción, la tabla, la columna y la rutina interna. Nunca el mensaje
 * de Postgres (puede citar el valor: `invalid input syntax for type uuid:
 * "…"`), nunca `detail` (cita la fila), nunca la consulta ni sus
 * parámetros, nunca cookies ni tokens.
 */

export interface ResumenDeError {
  tipo: string;
  codigo?: string;
  estado?: number;
  restriccion?: string;
  tabla?: string;
  columna?: string;
  rutina?: string;
  mensaje?: string;
  digest?: string;
  causa?: ResumenDeError;
}

type Registro = Record<string, unknown>;

function comoRegistro(valor: unknown): Registro | null {
  return valor !== null && typeof valor === "object" ? (valor as Registro) : null;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

/** Un error de Postgres (postgres.js): código SQLSTATE de 5 caracteres + severidad. */
function esErrorDePostgres(e: Registro): boolean {
  return typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.severity === "string";
}

/**
 * Borra de un texto libre lo que puede identificar a una persona: emails,
 * corridas de 6 o más dígitos (teléfonos, DNI), tokens largos. Los UUID
 * quedan: son identificadores internos, no datos personales, y sin ellos
 * no se puede seguir un error.
 */
export function redactar(mensaje: string): string {
  const uuids: string[] = [];
  return mensaje
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (u) => {
      uuids.push(u);
      return `\u0000${uuids.length - 1}\u0000`;
    })
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\b(?:sbp|sb|eyJ)[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]+)*/g, "<token>")
    .replace(/\+?\d[\d\s.-]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "<número>" : m))
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => uuids[Number(i)] ?? "")
    .slice(0, 300);
}

/** El resumen apto para un log. Recorre la cadena de `cause` (hasta 4 niveles). */
export function resumirError(err: unknown, profundidad = 0): ResumenDeError {
  const e = comoRegistro(err);
  if (!e) return { tipo: typeof err };

  const tipo = texto(e.name) ?? texto((e.constructor as { name?: unknown } | undefined)?.name) ?? "Error";
  const causa = profundidad < 4 && e.cause !== undefined ? resumirError(e.cause, profundidad + 1) : undefined;

  if (esErrorDePostgres(e)) {
    return {
      tipo: "PostgresError",
      codigo: e.code as string,
      restriccion: texto(e.constraint_name),
      tabla: texto(e.table_name),
      columna: texto(e.column_name),
      rutina: texto(e.routine),
    };
  }

  // Drizzle envuelve el error de Postgres y pone la consulta y los
  // parámetros en el mensaje ("Failed query: … params: …"). Lo útil está
  // en la causa.
  const mensajeCrudo = texto(e.message);
  const esConsultaFallida =
    tipo === "DrizzleQueryError" || (mensajeCrudo?.startsWith("Failed query") ?? false) || "params" in e;
  if (esConsultaFallida) {
    return { tipo, mensaje: "Falló una consulta (detalle omitido)", causa };
  }

  return {
    tipo,
    codigo: texto(e.code),
    estado: typeof e.status === "number" ? e.status : undefined,
    mensaje: mensajeCrudo ? redactar(mensajeCrudo) : undefined,
    digest: texto(e.digest),
    causa,
  };
}

/** `console.error` con el resumen en una línea, sin datos personales. */
export function registrarError(etiqueta: string, err: unknown): void {
  console.error(etiqueta, JSON.stringify(resumirError(err)));
}
