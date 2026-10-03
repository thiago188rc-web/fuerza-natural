import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, SECURITY_HEADERS } from "@/lib/security/headers";
import {
  DEV_MOCK_AUTH_COOKIE,
  OPCIONES_COOKIE_DE_SESION,
  isDevMockAuthEnabled,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/auth/config";
import { esFalloDeInfraestructuraAuth } from "@/lib/auth/flujo-login";
import { esRutaPublica } from "@/lib/auth/rutas-publicas";

/**
 * DOS responsabilidades, y ninguna de las dos es autorizar (SPEC V1 §3.15):
 *
 *   1. Refrescar la sesión de Supabase. Los Server Components pueden LEER
 *      cookies pero no ESCRIBIRLAS — sin este paso, un token que vence en
 *      medio de una sesión larga nunca se renueva y el usuario queda
 *      desconectado sin aviso. Este es el único lugar del sistema donde
 *      se escribe la cookie de sesión refrescada.
 *   2. Headers de seguridad + CSP con nonce fresco por request.
 *
 * PROHIBIDO usar esto para autorizar. Next.js tuvo una vulnerabilidad real
 * de bypass de middleware (CVE-2025-29927, un header que lo salteaba
 * entero). La autorización real vive en cada layout de servidor y en cada
 * Server Action, vía withAuth()/getAuthContext() — nunca acá. Lo único
 * que este middleware hace "para el usuario" es una redirección de
 * conveniencia cuando SABE que no hay sesión — nunca la decisión final.
 *
 * Por qué existe esa redirección: sin ella, una ruta privada pedida sin
 * sesión respondía 200 (el layout redirige dentro del streaming, después
 * de que el `loading.tsx` raíz ya mandó la respuesta), y un monitor por
 * código HTTP no podía distinguir "anda" de "no deja entrar". Ahora
 * responde 307 a /login. Si Supabase no contestó, no se sabe si hay
 * sesión: no se redirige y decide el layout, como siempre.
 */
export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  const csp = buildCsp(nonce, rawSupabaseUrl);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Acá NO se entrega ninguna identidad. Hubo una versión de este archivo
  // que, cuando no había Supabase configurado, le seteaba la cookie de
  // sesión simulada a cualquier visitante: eso convertía a todo el que
  // abriera la URL en DUENO con aal2, sin contraseña y sin pasar por
  // /login. La sesión simulada la entrega únicamente el formulario de
  // login (src/app/(auth)/login/actions.ts), y solo cuando el entorno la
  // habilita.

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: OPCIONES_COOKIE_DE_SESION,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Dispara el refresh solo si Supabase está configurado realmente.
  // El timeout es necesario además del catch: un fetch que nunca resuelve
  // ni rechaza (Supabase caído a medias, red cortada) no lo agarra un
  // try/catch — sin esto, TODA página (el middleware corre en cada
  // request) se queda cargando hasta que Vercel corte la función.
  // `sinSesion` es true solo si SABEMOS que no hay sesión: un timeout o
  // una caída de Supabase dejan la decisión al layout.
  let sinSesion = false;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
      sinSesion = !data?.user && !(error && esFalloDeInfraestructuraAuth(error));
    } catch {
      // Ignorar si Supabase falla, no responde, o tarda demasiado.
    }
  } else if (isDevMockAuthEnabled()) {
    sinSesion = !request.cookies.get(DEV_MOCK_AUTH_COOKIE)?.value;
  }

  const esNavegacion =
    (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  if (sinSesion && esNavegacion && !esRutaPublica(request.nextUrl.pathname)) {
    const redireccion = NextResponse.redirect(new URL("/login", request.url));
    // Si Supabase limpió una cookie vencida, la limpieza viaja igual.
    for (const cookie of response.cookies.getAll()) redireccion.cookies.set(cookie);
    for (const [key, value] of SECURITY_HEADERS) redireccion.headers.set(key, value);
    redireccion.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return redireccion;
  }

  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of SECURITY_HEADERS) response.headers.set(key, value);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  return response;
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas salvo assets estáticos e imágenes — no
     * tiene sentido refrescar sesión ni setear CSP para un .png.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
