/**
 * El tipo de retorno de TODO caso de uso de escritura. En vez de lanzar
 * excepciones para casos de negocio esperables, el caso de uso devuelve
 * esta unión discriminada — incluyendo `CONFIRMACION_REQUERIDA`, que le
 * permite pedir confirmación humana (cambio de plan, pago duplicado,
 * alumno duplicado) SIN escribir nada, en vez de adivinar. SPEC V1 §6.4.
 */
export type Result<TData, TConfirmacion = unknown> =
  | { ok: true; data: TData }
  | { ok: false; kind: "VALIDATION"; issues: ValidationIssue[] }
  | { ok: false; kind: "CONFIRMACION_REQUERIDA"; confirmacion: TConfirmacion }
  | { ok: false; kind: "CONFLICT"; message: string }
  | { ok: false; kind: "NOT_FOUND" }
  | { ok: false; kind: "FORBIDDEN" };

export interface ValidationIssue {
  path: string;
  message: string;
}

export function ok<TData>(data: TData): Result<TData, never> {
  return { ok: true, data };
}

export function validationError<TData, TConfirmacion = unknown>(
  issues: ValidationIssue[],
): Result<TData, TConfirmacion> {
  return { ok: false, kind: "VALIDATION", issues };
}

export function confirmacionRequerida<TData, TConfirmacion>(
  confirmacion: TConfirmacion,
): Result<TData, TConfirmacion> {
  return { ok: false, kind: "CONFIRMACION_REQUERIDA", confirmacion };
}

export function conflict<TData, TConfirmacion = unknown>(
  message: string,
): Result<TData, TConfirmacion> {
  return { ok: false, kind: "CONFLICT", message };
}

export function notFound<TData, TConfirmacion = unknown>(): Result<TData, TConfirmacion> {
  return { ok: false, kind: "NOT_FOUND" };
}

export function forbidden<TData, TConfirmacion = unknown>(): Result<TData, TConfirmacion> {
  return { ok: false, kind: "FORBIDDEN" };
}
