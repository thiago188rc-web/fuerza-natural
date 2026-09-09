import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase-server";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled, isSupabaseConfigured } from "./config";
import { buscarAppUserPorAuthId } from "./app-user";
import { esAppUserUtilizable } from "./flujo-login";

export type Rol = "DUENO" | "STAFF";

/**
 * El único tipo de contexto de tenant/usuario que existe en el sistema.
 * Ningún caso de uso ni repositorio recibe `gymId` como parámetro suelto:
 * todos reciben este objeto como primer argumento. No tiene constructor
 * público — la única forma de obtener uno es `getAuthContext()`, que hace
 * la validación completa (sesión real + usuario activo + rol).
 *
 * Sin verificación en dos pasos (ver docs/DECISIONES.md): la contraseña
 * validada por Supabase alcanza, no hay un nivel de AAL que revisar acá.
 */
export interface AuthContext {
  readonly userId: string;
  readonly gymId: string;
  readonly rol: Rol;
  /** Snapshot para auditoría (SPEC V1 §4.10) — no requiere una query aparte. */
  readonly email: string;
  readonly nombre: string;
}

/**
 * Marca un error como "no sabemos si hay sesión" (red lenta, Supabase no
 * respondió a tiempo), a diferencia de "sabemos que no hay sesión" (sin
 * cookie, token inválido). La diferencia importa: la primera NUNCA debe
 * tratarse como "no hay sesión" — eso es lo que hacía que una demora de
 * red momentánea expulsara a un usuario con una sesión perfectamente
 * válida de vuelta a /login, sistemáticamente, cada vez que Supabase
 * tardaba un poco más de la cuenta.
 */
class ErrorDeInfraestructura extends Error {}

/** `ms` en vez de esperar para siempre — pero un timeout ACÁ significa
 *  "no lo sabemos", nunca "no hay sesión": ver `ErrorDeInfraestructura`. */
function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ErrorDeInfraestructura(`timeout: ${etiqueta}`)), ms),
    ),
  ]);
}

/**
 * Lee la cookie de sesión simulada, PERO solo si el entorno la habilita
 * (ver `isDevMockAuthEnabled()` — nunca en producción, nunca con Supabase
 * real configurado). Sin esa puerta, esta cookie era un bypass completo de
 * autenticación.
 */
async function leerMockAuthIdDeDesarrollo(): Promise<string | null> {
  if (!isDevMockAuthEnabled()) return null;
  const cookieStore = await cookies();
  // Sin cookie no hay identidad. El valor por defecto acá era el UUID del
  // usuario demo, y eso hacía que "no hay sesión" se leyera como "soy el
  // dueño": un visitante anónimo entraba como tal en cualquier despliegue
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
      const supabase = await createSupabaseServerClient();
      // Sin catch acá: si esto tira, es porque conTimeout() venció o la red
      // falló de verdad — un ErrorDeInfraestructura, no una ausencia de
      // sesión. Lo atrapa el catch de más abajo, que sabe distinguir los
      // dos casos (ver su comentario).
      const { data: userData, error: userError } = await conTimeout(
        supabase.auth.getUser(),
        8000,
        "getUser",
      );

      if (!userError && userData?.user) {
        authUserId = userData.user.id;
      }
    }

    if (!authUserId) {
      authUserId = await leerMockAuthIdDeDesarrollo();
      isDevMock = authUserId !== null;
    }

    if (!authUserId) return null;

    let appUser;
    try {
      appUser = await buscarAppUserPorAuthId(authUserId);
    } catch (dbErr) {
      if (isDevMock) {
        return {
          userId: "00000000-0000-0000-0000-000000000001",
          gymId: "00000000-0000-0000-0000-000000000000",
          rol: "DUENO",
          email: "demo@fuerzanatural.test",
          nombre: "Usuario Demo",
        };
      }
      // Si la DB falló con un error de infraestructura, no tragarlo como
      // "sin sesión" — eso es lo que causaba que el usuario cayera en un
      // bucle de redirección a /login cada vez que algo tardaba de más.
      throw dbErr;
    }

    // Un usuario de Supabase sin fila en app_users, con la fila
    // desactivada o con un rol desconocido NO entra. La pantalla de login
    // explica cuál de los tres casos es (ver login/actions.ts); acá,
    // que es la barrera, solo importa que no pase.
    if (esAppUserUtilizable(appUser)) {
      return {
        userId: appUser.id,
        gymId: appUser.gymId,
        rol: appUser.rol as Rol,
        email: appUser.email,
        nombre: appUser.nombre,
      };
    }

    if (isDevMock) {
      return {
        userId: "00000000-0000-0000-0000-000000000001",
        gymId: "00000000-0000-0000-0000-000000000000",
        rol: "DUENO",
        email: "demo@fuerzanatural.test",
        nombre: "Usuario Demo",
      };
    }

    return null;
  } catch (err) {
    // Relanzar los errores de infraestructura (DB, o un timeout de
    // getUser() marcado como tal) para que el Error Boundary muestre una
    // pantalla de error — nunca silenciarlos como "sin sesión": eso es lo
    // que rebotaba a un usuario ya logueado de vuelta a /login cada vez
    // que algo tardaba.
    if (err instanceof ErrorDeInfraestructura) throw err;
    if (err && typeof err === "object" && ("code" in err || "severity" in err || err.constructor?.name === "PostgresError")) {
      throw err;
    }
    console.error("getAuthContext failed gracefully:", err);
    return null;
  }
});
