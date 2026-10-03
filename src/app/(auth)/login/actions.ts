"use server";

import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import {
  LIMITES,
  bloqueadoHasta,
  claveDeIntento,
  ipDelPedido,
  limpiarFallos,
  registrarFallo,
} from "@/lib/auth/limite-de-intentos";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled } from "@/lib/auth/config";
import { buscarAppUserPorAuthId, type AppUser } from "@/lib/auth/app-user";
import {
  MENSAJES_LOGIN,
  esFalloDeInfraestructuraAuth,
  resolverDestinoLogin,
} from "@/lib/auth/flujo-login";
import { registrarError } from "@/lib/registro-seguro";

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
 * El orden es: contraseña contra Supabase Auth → fila en app_users →
 * destino. Sin verificación en dos pasos (ver docs/DECISIONES.md): la
 * contraseña validada alcanza. Cada paso que falla devuelve un mensaje concreto, y
 * cuando el usuario quedó autenticado pero no puede usar el sistema se le
 * cierra la sesión: dejarla abierta lo mandaba al layout protegido, que lo
 * rebotaba a /login sin decir nada (era exactamente el síntoma de "pongo mi
 * contraseña y no pasa nada").
 *
 * De la contraseña nunca devolvemos el detalle real del error de Supabase
 * (credenciales inválidas, usuario inexistente, rate limit): siempre el
 * mismo mensaje, para no filtrar ni siquiera si un email está registrado.
 * La excepción es cuando Supabase no contestó (red, DNS, 5xx, timeout):
 * ahí no sabemos nada de la contraseña, y decir "incorrecta" manda al
 * usuario a dudar de una credencial que está bien. Ese caso no depende del
 * email, así que distinguirlo no filtra nada.
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

    // Límite de intentos: por cuenta+IP (5 en 15 min) y por IP (20 en 15
    // min). Se consulta ANTES de preguntarle a Supabase, para que un
    // bloqueo corte de verdad el intento. El mensaje no dice si la cuenta
    // existe: la clave se arma igual exista o no.
    const ip = ipDelPedido(await headers());
    const claveCuenta = claveDeIntento("login", ip, email);
    const claveIp = claveDeIntento("login-ip", ip);
    if (await bloqueadoHasta([claveCuenta, claveIp])) {
      return { error: MENSAJES_LOGIN.demasiadosIntentos };
    }

    let supabase;
    try {
      supabase = await createSupabaseServerClient();
    } catch {
      return { error: MENSAJES_LOGIN.credenciales };
    }

    let ingreso;
    try {
      ingreso = await Promise.race([
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
      ]);
    } catch (err) {
      registrarError("[login] Supabase Auth no respondió:", err);
      return { error: MENSAJES_LOGIN.sinConexion };
    }
    const { data: sesion, error: errorDeIngreso } = ingreso;

    if (errorDeIngreso && esFalloDeInfraestructuraAuth(errorDeIngreso)) {
      registrarError("[login] Supabase Auth no respondió:", errorDeIngreso);
      return { error: MENSAJES_LOGIN.sinConexion };
    }

    if (errorDeIngreso || !sesion?.user) {
      // Solo cuenta lo que es "contraseña mal" (no las caídas de Supabase,
      // que ya salieron arriba con su propio mensaje).
      await Promise.all([
        registrarFallo(claveCuenta, LIMITES.loginPorCuenta),
        registrarFallo(claveIp, LIMITES.loginPorIp),
      ]);
      return { error: MENSAJES_LOGIN.credenciales };
    }

    await limpiarFallos(claveCuenta);

    // El puente Supabase Auth → sistema.
    let appUser: AppUser | null;
    try {
      appUser = await buscarAppUserPorAuthId(sesion.user.id);
    } catch (err) {
      registrarError("[login] no se pudo leer app_users:", err);
      await supabase.auth.signOut();
      return { error: MENSAJES_LOGIN.sinConexion };
    }

    const decision = resolverDestinoLogin(appUser);
    if (decision.clase === "error") {
      await supabase.auth.signOut();
      return { error: decision.mensaje };
    }

    return { redirectTo: decision.a };
  } catch (err) {
    registrarError("[login] error inesperado en Server Action:", err);
    return { error: MENSAJES_LOGIN.credenciales };
  }
}
