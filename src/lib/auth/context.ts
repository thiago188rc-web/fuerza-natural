import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase-server";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled, isSupabaseConfigured } from "./config";
import { buscarAppUserPorAuthId } from "./app-user";
import { esAppUserUtilizable } from "./flujo-login";

export type Rol = "DUENO" | "STAFF";
export type Aal = "aal1" | "aal2";

/**
 * El único tipo de contexto de tenant/usuario que existe en el sistema.
 * Ningún caso de uso ni repositorio recibe `gymId` como parámetro suelto:
 * todos reciben este objeto como primer argumento. No tiene constructor
 * público — la única forma de obtener uno es `getAuthContext()`, que hace
 * la validación completa (sesión real + usuario activo + rol + AAL).
 * SPEC V1 §3.4.
 */
export interface AuthContext {
  readonly userId: string;
  readonly gymId: string;
  readonly rol: Rol;
  readonly aal: Aal;
  /** Snapshot para auditoría (SPEC V1 §4.10) — no requiere una query aparte. */
  readonly email: string;
  readonly nombre: string;
}

/**
 * Lee la cookie de sesión simulada, PERO solo si el entorno la habilita
 * (ver `isDevMockAuthEnabled()` — nunca en producción, nunca con Supabase
 * real configurado). Sin esa puerta, esta cookie era un bypass completo de
 * autenticación y de MFA.
 */
async function leerMockAuthIdDeDesarrollo(): Promise<string | null> {
  if (!isDevMockAuthEnabled()) return null;
  const cookieStore = await cookies();
  // Sin cookie no hay identidad. El valor por defecto acá era el UUID del
  // usuario demo, y eso hacía que "no hay sesión" se leyera como "soy el
  // dueño": un visitante anónimo entraba con aal2 en cualquier despliegue
  // sin Supabase configurado.
  return cookieStore.get(DEV_MOCK_AUTH_COOKIE)?.value ?? null;
}

/**
 * Construye el AuthContext de la request actual, o `null` si no hay una
 * sesión válida y utilizable. Este es el ÚNICO lugar del sistema que
 * construye un AuthContext — SPEC V1 §3.3, §3.4.
 *
 * Pasos, en este orden exacto:
 *   1. supabase.auth.getUser() — NUNCA getSession(). getSession() solo
 *      decodifica la cookie sin validar la firma; un atacante puede
 *      fabricar un JWT con cualquier "sub". getUser() lo valida contra el
 *      servidor de auth.
 *   2. app.get_app_user_by_auth_id(authUserId) — la única función que
 *      puede leer `app_users` sin conocer todavía el gym_id (ver
 *      db/migrations/infra/01_rls_and_triggers.sql). Nunca un SELECT
 *      directo contra app_users desde la app.
 *   3. Si no existe la fila, o `activo = false` → null. Esto es también
 *      el mecanismo de revocación inmediata: desactivar un usuario lo saca
 *      del sistema en la siguiente petición, sin esperar a que expire el
 *      token.
 *
 * `cache()` de React memoiza esto por request (no entre requests) — evita
 * repetir la validación de sesión + la consulta a la base varias veces en
 * el mismo render.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  try {
    let authUserId: string | null = null;
    let isDevMock = false;

    if (isSupabaseConfigured()) {
      try {
        const supabase = await createSupabaseServerClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!userError && userData?.user) {
          authUserId = userData.user.id;
        }
      } catch {
        // Supabase no configurado o inalcanzable: se resuelve abajo.
      }
    }

    if (!authUserId) {
      authUserId = await leerMockAuthIdDeDesarrollo();
      isDevMock = authUserId !== null;
    }

    if (!authUserId) return null;

    try {
      const appUser = await buscarAppUserPorAuthId(authUserId);

      // Un usuario de Supabase sin fila en app_users, con la fila
      // desactivada o con un rol desconocido NO entra. La pantalla de login
      // explica cuál de los tres casos es (ver login/actions.ts); acá,
      // que es la barrera, solo importa que no pase.
      if (esAppUserUtilizable(appUser)) {
        let aal: Aal = "aal1";
        if (isDevMock) {
          aal = "aal2";
        } else {
          const supabase = await createSupabaseServerClient();
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          aal = aalData?.currentLevel === "aal2" ? "aal2" : "aal1";
        }

        return {
          userId: appUser.id,
          gymId: appUser.gymId,
          rol: appUser.rol as Rol,
          aal,
          email: appUser.email,
          nombre: appUser.nombre,
        };
      }
    } catch (dbErr) {
      if (isDevMock) {
        return {
          userId: "00000000-0000-0000-0000-000000000001",
          gymId: "00000000-0000-0000-0000-000000000000",
          rol: "DUENO",
          aal: "aal2",
          email: "demo@fuerzanatural.test",
          nombre: "Usuario Demo",
        };
      }
      throw dbErr;
    }

    if (isDevMock) {
      return {
        userId: "00000000-0000-0000-0000-000000000001",
        gymId: "00000000-0000-0000-0000-000000000000",
        rol: "DUENO",
        aal: "aal2",
        email: "demo@fuerzanatural.test",
        nombre: "Usuario Demo",
      };
    }

    return null;
  } catch (err) {
    console.error("getAuthContext failed gracefully:", err);
    return null;
  }
});

/**
 * DUENO exige aal2 siempre (SPEC V1 §3.10) — un token obtenido solo con
 * contraseña (aal1) no alcanza para tocar ni un dato, ni siquiera si el
 * atacante conoce la contraseña real. STAFF no lo exige todavía (Fase 3,
 * cuando ese rol tenga usuarios reales) pero la función ya existe para no
 * tener que tocar cada Server Action cuando se active.
 */
export function requiresAal2(rol: Rol): boolean {
  return rol === "DUENO";
}
