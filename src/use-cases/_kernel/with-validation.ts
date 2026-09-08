import type { ZodType } from "zod";
import { type Result, type ValidationIssue } from "./result";

/**
 * Parsea `raw` contra `schema`. Cualquier caso de uso de escritura empieza
 * con esto — nunca confiar en que el cliente ya validó (SPEC V1 §3.15,
 * §12). Las mismas validaciones existen también en el cliente para UX,
 * pero solo ESTA corrida cuenta.
 */
export function parseInput<T>(
  schema: ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; result: Result<never, never> } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };

  const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { ok: false, result: { ok: false, kind: "VALIDATION", issues } };
}
