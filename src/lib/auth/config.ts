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

/**
 * Opciones de las cookies de sesión de Supabase. El default de
 * `@supabase/ssr` es `httpOnly: false`, pensado para apps que también usan
 * Supabase desde el navegador. Esta no: toda llamada a Supabase sale del
 * servidor (proxy, Server Components, Server Actions), así que el
 * JavaScript de la página no tiene por qué poder leer el token — y si
 * algún día se colara un script, no se lo podría llevar. `secure` en
 * producción: la cookie solo viaja por HTTPS.
 */
export const OPCIONES_COOKIE_DE_SESION = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * La URL pública de la app, para los enlaces que salen por email (la
 * recuperación de contraseña). `APP_URL` si está configurada; si no, el
 * `Origin` del pedido, que en una Server Action Next.js ya verificó contra
 * el Host. Supabase además solo acepta destinos de su lista de "Redirect
 * URLs": esto no es la única barrera.
 */
export function urlDeLaApp(origen: string | null): string {
  const configurada = process.env.APP_URL?.trim();
  const candidata = configurada || origen || "http://localhost:3000";
  try {
    const url = new URL(candidata);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return "http://localhost:3000";
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
}

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
 * La condición 1 se sacó una vez (commits d3a7013/dace90a, "demo en
 * Vercel") y quedó así hasta 2026-10-01: un build de producción sin las
 * env vars de Supabase —o un Preview, que no las tiene— dejaba entrar como
 * DUENO con cualquier email y contraseña. Una demo sin login real se arma
 * con `npm run dev`, nunca en un despliegue.
 *
 * Ver tests/security/dev-mock-auth.test.ts.
 */
export function isDevMockAuthEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return !isSupabaseConfigured();
}
