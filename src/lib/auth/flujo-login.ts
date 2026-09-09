/**
 * Decisiones PURAS del flujo de login y MFA — sin Supabase, sin base de
 * datos, sin cookies. Todo lo que se puede decidir con datos ya leídos vive
 * acá para poder testearlo de forma determinística (ver
 * tests/security/flujo-login.test.ts). Las acciones de servidor
 * (login/actions.ts, mfa/actions.ts) hacen la parte de I/O y delegan la
 * decisión en estas funciones.
 *
 * NADA de esto autoriza: la autorización real sigue viviendo en
 * getAuthContext() + withAuth(), evaluados en cada layout de servidor y cada
 * Server Action. Esto solo decide a dónde mandar al usuario y qué mensaje
 * mostrarle — la UX, no la barrera.
 */

/** Mensajes de la pantalla de login. Concretos, sin filtrar detalle interno. */
export const MENSAJES_LOGIN = {
  credenciales: "Email o contraseña incorrectos.",
  noVinculado:
    "Tu usuario todavía no está habilitado en este gimnasio. Pedile al administrador que te dé acceso.",
  inactivo: "Tu usuario está desactivado. Contactá al administrador del gimnasio.",
  baseDeDatos: "No pudimos conectar con el sistema. Probá de nuevo en un momento.",
} as const;

/** Mensajes de la pantalla de verificación en dos pasos. */
export const MENSAJES_MFA = {
  configuracion: "La verificación en dos pasos no está disponible en este entorno.",
  sesion: "Tu sesión expiró. Ingresá de nuevo.",
  codigo: "El código no es válido o venció. Generá uno nuevo en tu app y probá otra vez.",
  enrolar: "No pudimos generar el código de configuración. Probá de nuevo.",
  sinFactor: "No encontramos un segundo factor configurado. Configuralo primero.",
} as const;

/** El subconjunto de la info de AAL de Supabase que estas decisiones usan. */
export interface InfoAal {
  currentLevel: string | null;
  nextLevel: string | null;
}

/** El subconjunto de una fila de app_users que estas decisiones usan. */
export interface AppUserMinimo {
  rol: string;
  activo: boolean;
}

export type DecisionLogin =
  | { clase: "error"; mensaje: string }
  | { clase: "destino"; a: "/dashboard" | "/mfa" };

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
 * —o qué error mostrarle— según su fila en app_users y su nivel de AAL.
 *
 *   - Sin fila / rol desconocido → error "no vinculado" (jamás entra).
 *   - Fila inactiva              → error "inactivo".
 *   - Ya está en aal2            → dashboard.
 *   - Tiene un factor verificado (nextLevel aal2) → /mfa (a hacer challenge).
 *   - DUENO sin factor           → /mfa (a enrolar; DUENO exige aal2 siempre).
 *   - STAFF sin factor           → dashboard (STAFF no exige aal2 todavía).
 */
export function resolverDestinoLogin(
  appUser: AppUserMinimo | null,
  aal: InfoAal | null,
): DecisionLogin {
  if (!appUser || (appUser.rol !== "DUENO" && appUser.rol !== "STAFF")) {
    return { clase: "error", mensaje: MENSAJES_LOGIN.noVinculado };
  }
  if (!appUser.activo) {
    return { clase: "error", mensaje: MENSAJES_LOGIN.inactivo };
  }

  const actual = aal?.currentLevel ?? "aal1";
  const proximo = aal?.nextLevel ?? "aal1";

  if (actual === "aal2") return { clase: "destino", a: "/dashboard" };
  if (proximo === "aal2") return { clase: "destino", a: "/mfa" };
  if (appUser.rol === "DUENO") return { clase: "destino", a: "/mfa" };
  return { clase: "destino", a: "/dashboard" };
}

export type ModoMfa = "listo" | "challenge" | "enroll";

/**
 * Qué tiene que hacer la pantalla /mfa: si ya está en aal2 no hay nada que
 * hacer ("listo" → dashboard); si hay un factor TOTP verificado, pedir el
 * código ("challenge"); si no hay ninguno, enrolar uno nuevo ("enroll").
 */
export function modoMfa(
  factoresVerificados: readonly { id: string }[],
  aal: InfoAal | null,
): ModoMfa {
  if ((aal?.currentLevel ?? "aal1") === "aal2") return "listo";
  if (factoresVerificados.length > 0) return "challenge";
  return "enroll";
}
