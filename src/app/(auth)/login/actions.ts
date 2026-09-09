"use server";

import { redirect } from "next/navigation";
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: MENSAJES_LOGIN.credenciales };
  }

  // Sesión simulada de desarrollo. La condición vive en un solo lugar
  // (isDevMockAuthEnabled) y exige que NO haya Supabase configurado — ver la
  // nota de seguridad en src/lib/auth/config.ts. Con Supabase real, como en
  // producción, esta rama no se ejecuta nunca.
  if (isDevMockAuthEnabled()) {
    const cookieStore = await cookies();
    cookieStore.set(DEV_MOCK_AUTH_COOKIE, "00000000-0000-0000-0000-000000000001", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 días
      secure: process.env.NODE_ENV === "production",
    });
    return { redirectTo: "/dashboard" };
  }

  const supabase = await createSupabaseServerClient();

  const { data: sesion, error: errorDeIngreso } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (errorDeIngreso || !sesion?.user) {
    return { error: MENSAJES_LOGIN.credenciales };
  }

  // El puente Supabase Auth → sistema. Si esto falla es un problema de
  // infraestructura (base inalcanzable, migraciones sin aplicar), no del
  // usuario: no lo dejamos con una sesión a medias.
  let appUser: AppUser | null;
  try {
    appUser = await buscarAppUserPorAuthId(sesion.user.id);
  } catch (err) {
    console.error("[login] no se pudo leer app_users:", err);
    await supabase.auth.signOut();
    return { error: MENSAJES_LOGIN.baseDeDatos };
  }

  // Si el nivel de MFA no se puede leer, seguimos como si fuera aal1: eso
  // manda a /mfa a quien exige aal2 en vez de dejarlo pasar. Falla cerrado.
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
}
