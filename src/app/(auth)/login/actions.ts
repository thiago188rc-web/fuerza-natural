"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled } from "@/lib/auth/config";

export interface LoginState {
  error?: string;
}

const MENSAJE_ERROR_GENERICO = "Email o contraseña incorrectos.";

/**
 * Server Action del formulario de login. A propósito NO pasa por
 * withAuth()/withTenantTx() como los casos de uso de negocio (ver
 * src/use-cases/alumnos/crear-alumno.ts): esto es autenticación pura
 * contra Supabase Auth, la capa que existe *antes* de que exista un
 * AuthContext — todavía no hay gymId ni rol que autorizar.
 *
 * Nunca devolvemos el detalle interno del error de Supabase (credenciales
 * inválidas, usuario no existe, rate limit, etc.) — siempre el mismo
 * mensaje genérico, para no filtrar ni siquiera si un email está
 * registrado.
 */
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: MENSAJE_ERROR_GENERICO };
  }

  // Sesión simulada de desarrollo. La condición vive en un solo lugar
  // (isDevMockAuthEnabled) y exige NODE_ENV != production ADEMÁS de que no
  // haya Supabase configurado — ver la nota de seguridad en
  // src/lib/auth/config.ts. Un build de producción nunca entra acá.
  if (isDevMockAuthEnabled()) {
    const cookieStore = await cookies();
    cookieStore.set(DEV_MOCK_AUTH_COOKIE, "00000000-0000-0000-0000-000000000001", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 días
      secure: process.env.NODE_ENV === "production",
    });
    redirect("/dashboard");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: MENSAJE_ERROR_GENERICO };
  }

  // El usuario ya autenticó con contraseña (aal1). Si tiene un factor MFA
  // enrolado pero todavía no lo verificó en esta sesión, Supabase reporta
  // currentLevel: 'aal1' y nextLevel: 'aal2' — ahí hace falta pasar por
  // /mfa antes de soltarlo en el dashboard. Si no tiene ningún factor
  // enrolado, nextLevel también es 'aal1' y no hace falta desafío ahora.
  // (La exigencia dura de aal2 para DUENO en cada request vive en
  // requiresAal2()/withAuth, no acá — esto es solo el paso conveniente de
  // login.)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
    redirect("/mfa");
  }

  redirect("/dashboard");
}
