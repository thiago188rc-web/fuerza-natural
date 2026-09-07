import { getAuthContext, requiresAal2, type AuthContext, type Rol } from "@/lib/auth/context";
import { forbidden, type Result } from "./result";

/**
 * Envuelve TODA Server Action de escritura (y las de lectura sensibles).
 * Las Server Actions de Next.js son endpoints HTTP públicos — cualquiera
 * puede invocarlas conociendo su ID, sin que el botón esté oculto en la UI
 * cambie nada. Esta secuencia es la única barrera real, y corre siempre en
 * este orden (SPEC V1 §3.15):
 *
 *   1. Sesión válida (getAuthContext → getUser, nunca getSession)
 *   2. Usuario activo en app_users
 *   3. AAL suficiente para el rol (DUENO exige aal2 siempre)
 *   4. Rol autorizado para esta operación puntual
 *
 * Un test de arquitectura recorre las Server Actions exportadas y falla
 * si alguna no está envuelta acá — ver tests/security/.
 *
 * NOTA: por ahora esto no distingue "no hay sesión" de "sesión insuficiente"
 * a nivel de Result (ambos devuelven FORBIDDEN) — la distinción de a dónde
 * redirigir (login vs. desafío MFA) es responsabilidad de la capa de UI,
 * no de este kernel.
 */
export function withAuth<TInput, TData, TConfirmacion = unknown>(
  rolesPermitidos: readonly Rol[],
  handler: (ctx: AuthContext, input: TInput) => Promise<Result<TData, TConfirmacion>>,
) {
  return async (input: TInput): Promise<Result<TData, TConfirmacion>> => {
    const ctx = await getAuthContext();
    if (!ctx) return forbidden();
    if (requiresAal2(ctx.rol) && ctx.aal !== "aal2") return forbidden();
    if (!rolesPermitidos.includes(ctx.rol)) return forbidden();

    try {
      return await handler(ctx, input);
    } catch (err) {
      // Nunca filtrar el error interno (stack trace, SQL) al cliente.
      console.error("[use-case] error inesperado:", err);
      return { ok: false, kind: "CONFLICT", message: "Ocurrió un error inesperado. Intentá de nuevo." };
    }
  };
}
