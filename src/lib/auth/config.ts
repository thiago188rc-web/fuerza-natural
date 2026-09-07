/**
 * Configuración de Supabase Auth y la puerta de desarrollo, en UN solo
 * lugar. Antes esta lógica estaba duplicada en tres archivos
 * (supabase-server.ts, proxy.ts, login/actions.ts) con tres criterios
 * ligeramente distintos de "¿hay Supabase?" — y esa divergencia es
 * exactamente lo que hacía posible el bypass de autenticación descrito
 * abajo.
 */

export const SUPABASE_URL_PLACEHOLDER = "https://placeholder.supabase.co";
export const SUPABASE_ANON_KEY_PLACEHOLDER = "placeholder-key";

/** Nombre de la cookie de sesión simulada de desarrollo. */
export const DEV_MOCK_AUTH_COOKIE = "dev_mock_auth_id";

/** `true` solo si hay un proyecto Supabase real configurado (no el placeholder). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(
    url && url !== SUPABASE_URL_PLACEHOLDER && key && key !== SUPABASE_ANON_KEY_PLACEHOLDER,
  );
}

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SUPABASE_URL_PLACEHOLDER;
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || SUPABASE_ANON_KEY_PLACEHOLDER;
}

/**
 * ¿Está habilitada la sesión simulada de desarrollo?
 *
 * SEGURIDAD — leer antes de tocar esta función. Fase 0 introdujo una
 * cookie `dev_mock_auth_id` para poder ver las pantallas sin un proyecto
 * Supabase real: `getAuthContext()` la aceptaba como identidad si
 * `supabase.auth.getUser()` no devolvía usuario. El problema es que NO
 * estaba condicionada a nada: en producción, cualquiera que enviara esa
 * cookie con un `auth_user_id` válido entraba como ese usuario, con
 * `aal2` regalado (saltándose el MFA que el sistema exige para DUENO).
 * `httpOnly` no protege de esto — impide que el JavaScript de la página
 * lea la cookie, no que un atacante la mande a mano con curl.
 *
 * Ahora tiene dos condiciones independientes, y las dos deben cumplirse:
 *
 *   1. NODE_ENV distinto de "production" — un build de producción nunca
 *      la habilita, aunque alguien se olvide de configurar Supabase.
 *   2. No hay proyecto Supabase configurado — si hay auth real, no hay
 *      ninguna razón legítima para una identidad simulada.
 *
 * Ver tests/security/dev-mock-auth.test.ts.
 */
export function isDevMockAuthEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return !isSupabaseConfigured();
}
