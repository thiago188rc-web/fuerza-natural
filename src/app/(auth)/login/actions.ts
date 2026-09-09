"use server";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled } from "@/lib/auth/config";
import { buscarAppUserPorAuthId, type AppUser } from "@/lib/auth/app-user";
import { MENSAJES_LOGIN, resolverDestinoLogin, type InfoAal } from "@/lib/auth/flujo-login";

export interface LoginState {
  error?: string;
  redirectTo?: string;
}

/**
 * Server Action del formulario de login. A propósito NO pasa por
 * withAuth()/withTenantTx() como los casos de uso de negocio: esto es
 * autenticación pura, la capa que existe *antes* de que exista un
 * AuthContext — todavía no hay gymId ni rol que autorizar.
 *
 * El orden es: contraseña contra Supabase Auth → fila en app_users → nivel
 * de MFA → destino. Cada paso que falla devuelve un mensaje concreto, y
 * cuando el usuario quedó autenticado pero no puede usar el sistema se le
 * cierra la sesión: dejarla abierta lo mandaba al layout protegido, que lo
 * rebotaba a /login sin decir nada (era exactamente el síntoma de "pongo mi
 * contraseña y no pasa nada").
 *
 * De la contraseña nunca devolvemos el detalle real del error de Supabase
 * (credenciales inválidas, usuario inexistente, rate limit): siempre el
 * mismo mensaje, para no filtrar ni siquiera si un email está registrado.
 * De lo que pasa DESPUÉS sí: quien ya demostró ser dueño de la credencial
 * merece saber por qué no entra, y esa información no le sirve a un
 * atacante que no pasó la contraseña.
 */
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return { error: MENSAJES_LOGIN.credenciales };
    }

    // Sesión simulada de desarrollo. `isDevMockAuthEnabled()` ya exige
    // NODE_ENV != production Y que no haya Supabase real configurado — no
    // agregar acá un atajo por email/contraseña fija: eso sería una puerta
    // de acceso sin validar credencial, activa también en producción.
    if (isDevMockAuthEnabled()) {
      const cookieStore = await cookies();
      cookieStore.set(DEV_MOCK_AUTH_COOKIE, "00000000-0000-0000-0000-000000000001", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 días
        secure: false,
      });
      return { redirectTo: "/dashboard" };
    }

    let supabase;
    try {
      supabase = await createSupabaseServerClient();
    } catch {
      return { error: MENSAJES_LOGIN.credenciales };
    }

    const { data: sesion, error: errorDeIngreso } = await Promise.race([
      supabase.auth.signInWithPassword({
        email,
        password,
      }),
      new Promise<{ data: null; error: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 6000),
      ),
    ]).catch(() => ({ data: null, error: true }));

    if (errorDeIngreso || !sesion?.user) {
      return { error: MENSAJES_LOGIN.credenciales };
    }

    // El puente Supabase Auth → sistema.
    let appUser: AppUser | null;
    try {
      appUser = await buscarAppUserPorAuthId(sesion.user.id);
    } catch (err) {
      console.error("[login] no se pudo leer app_users:", err);
      await supabase.auth.signOut();
      return { error: MENSAJES_LOGIN.baseDeDatos };
    }

    let aal: InfoAal | null = null;
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data) aal = { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
    } catch (err) {
      console.error("[login] no se pudo leer el nivel de MFA:", err);
    }

    const decision = resolverDestinoLogin(appUser, aal);
    if (decision.clase === "error") {
      await supabase.auth.signOut();
      return { error: decision.mensaje };
    }

    return { redirectTo: decision.a };
  } catch (err) {
    console.error("[login] error inesperado en Server Action:", err);
    return { error: MENSAJES_LOGIN.credenciales };
  }
}
