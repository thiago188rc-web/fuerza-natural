import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Cliente de Supabase Auth para Server Components / Server Actions.
 * Se crea UNA VEZ POR REQUEST (nunca a nivel de módulo/singleton) — es el
 * patrón correcto de @supabase/ssr en Next.js, y de paso evita que este
 * archivo intente leer cookies() fuera de un contexto de request.
 *
 * Si las env vars no están configuradas (Supabase real todavía no
 * conectado), devolvemos un cliente igual — createServerClient no valida
 * la URL en el momento de construcción, así que esto no rompe `next build`
 * ni el render de páginas públicas. Falla recién si algo intenta usarlo
 * de verdad (login), con el error propio de supabase-js, no un crash de
 * Next.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components no pueden setear cookies — el refresh de
          // sesión se maneja en middleware/Server Actions. No es un error.
        }
      },
    },
  });
}
