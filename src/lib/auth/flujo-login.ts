import { isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Decisiones PURAS del flujo de login — sin llamadas a Supabase, sin base
 * de datos, sin cookies. Todo lo que se puede decidir con datos ya leídos vive acá
 * para poder testearlo de forma determinística (ver
 * tests/security/flujo-login.test.ts). login/actions.ts hace la parte de
 * I/O y delega la decisión en estas funciones.
 *
 * NADA de esto autoriza: la autorización real sigue viviendo en
 * getAuthContext() + withAuth(), evaluados en cada layout de servidor y cada
 * Server Action. Esto solo decide a dónde mandar al usuario y qué mensaje
 * mostrarle — la UX, no la barrera.
 *
 * Sin verificación en dos pasos (ver docs/DECISIONES.md, entrada sobre
 * MFA): con la contraseña validada alcanza, no hay un segundo paso previo
 * al dashboard.
 */

/** Mensajes de la pantalla de login. Concretos, sin filtrar detalle interno. */
export const MENSAJES_LOGIN = {
  credenciales: "Email o contraseña incorrectos.",
  noVinculado:
    "Tu usuario todavía no está habilitado en este gimnasio. Pedile al administrador que te dé acceso.",
  inactivo: "Tu usuario está desactivado. Contactá al administrador del gimnasio.",
  sinConexion: "No pudimos conectar con el sistema. Probá de nuevo en un momento.",
} as const;

/**
 * ¿Este error de Supabase Auth significa "no pudimos preguntar" (red
 * caída, DNS que no resuelve, proyecto Supabase pausado, 5xx) en vez de
 * "la respuesta es no" (sin sesión, token inválido, contraseña incorrecta,
 * rate limit)?
 *
 * Importa porque supabase-js NO lanza ante un fallo de red: `getUser()` y
 * `signInWithPassword()` devuelven `{ error: AuthRetryableFetchError }`
 * igual que devolverían un "no". Tratarlo como un "no" mandaba a /login a
 * un usuario con la sesión válida y le decía "contraseña incorrecta" a
 * quien la había escrito bien.
 */
export function esFalloDeInfraestructuraAuth(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 500;
}

/** El subconjunto de una fila de app_users que estas decisiones usan. */
export interface AppUserMinimo {
  rol: string;
  activo: boolean;
}

export type DecisionLogin =
  | { clase: "error"; mensaje: string }
  | { clase: "destino"; a: "/dashboard" };

/**
 * ¿Esta fila de app_users habilita a usar el sistema? Es la MISMA condición
 * que aplica getAuthContext() como barrera dura — vive acá para no
 * duplicarla y para poder testearla sin base de datos. Un rol desconocido
 * (ni DUENO ni STAFF) nunca entra, aunque exista la fila.
 */
export function esAppUserUtilizable<T extends AppUserMinimo>(
  u: T | null | undefined,
): u is T {
  return Boolean(u && u.activo && (u.rol === "DUENO" || u.rol === "STAFF"));
}

/**
 * Con la contraseña ya validada por Supabase, decide a dónde va el usuario
 * —o qué error mostrarle— según su fila en app_users.
 *
 *   - Sin fila / rol desconocido → error "no vinculado" (jamás entra).
 *   - Fila inactiva              → error "inactivo".
 *   - Activo con rol válido      → dashboard.
 */
export function resolverDestinoLogin(appUser: AppUserMinimo | null): DecisionLogin {
  if (!appUser || (appUser.rol !== "DUENO" && appUser.rol !== "STAFF")) {
    return { clase: "error", mensaje: MENSAJES_LOGIN.noVinculado };
  }
  if (!appUser.activo) {
    return { clase: "error", mensaje: MENSAJES_LOGIN.inactivo };
  }
  return { clase: "destino", a: "/dashboard" };
}
