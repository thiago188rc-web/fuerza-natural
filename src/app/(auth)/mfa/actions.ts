"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { MENSAJES_MFA } from "@/lib/auth/flujo-login";

/**
 * Verificación en dos pasos con TOTP real de Supabase Auth.
 *
 * Estas acciones existen en el hueco entre "ya validé la contraseña" (aal1)
 * y "puedo operar" (aal2). Por eso NO pasan por withAuth(): withAuth exige
 * aal2 para DUENO, y pedirlo acá sería circular — no habría forma de
 * alcanzar aal2 nunca. La barrera que protegen los datos sigue siendo la
 * misma de siempre: getAuthContext() + withAuth() en cada layout y cada
 * caso de uso. Lo único que estas acciones pueden hacer es elevar el nivel
 * de MFA de la sesión que el usuario YA demostró tener con su contraseña.
 *
 * Ninguna de las dos acepta un usuario, un gimnasio ni un rol desde el
 * cliente: todo sale de la sesión de Supabase leída en el servidor.
 */

export interface EnrolarState {
  /** Id del factor recién creado, necesario para verificarlo. */
  factorId?: string;
  /** QR listo para mostrar (SVG en data URI, lo genera Supabase). */
  qr?: string;
  /** El mismo secreto en texto, para cargarlo a mano si el QR no se puede escanear. */
  secret?: string;
  error?: string;
}

/**
 * Crea un factor TOTP nuevo y devuelve el QR y el secreto para configurarlo.
 * El factor nace "unverified": no sirve para nada hasta que el usuario
 * confirme un código con `verificarMfa`. Antes de crear uno, limpia los
 * factores sin verificar que hayan quedado de intentos abandonados — si no,
 * se acumulan y Supabase rechaza el enrolamiento por nombre repetido.
 */
export async function enrolarMfa(): Promise<EnrolarState> {
  if (!isSupabaseConfigured()) return { error: MENSAJES_MFA.configuracion };

  const supabase = await createSupabaseServerClient();

  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario?.user) return { error: MENSAJES_MFA.sesion };

  const { data: factores } = await supabase.auth.mfa.listFactors();
  const abandonados = (factores?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status !== "verified",
  );
  for (const factor of abandonados) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Nexa ${new Date().toISOString()}`,
  });
  if (error || !data) {
    console.error("[mfa] no se pudo enrolar el factor:", error);
    return { error: MENSAJES_MFA.enrolar };
  }

  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export interface VerificarState {
  error?: string;
}

/**
 * Verifica un código de 6 dígitos contra el factor TOTP y, si es correcto,
 * eleva la sesión a aal2. Sirve para los dos casos: confirmar un factor
 * recién enrolado y responder el desafío de un factor ya verificado —
 * `challengeAndVerify` hace las dos cosas.
 *
 * El `factorId` viaja en el formulario, pero no es un dato sensible ni una
 * decisión de autorización: pertenece a la sesión del propio usuario, y
 * Supabase rechaza cualquier id que no sea suyo. Si viene vacío, se resuelve
 * desde los factores verificados de la sesión.
 */
export async function verificarMfa(
  _prevState: VerificarState,
  formData: FormData,
): Promise<VerificarState> {
  if (!isSupabaseConfigured()) return { error: MENSAJES_MFA.configuracion };

  const supabase = await createSupabaseServerClient();

  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario?.user) return { error: MENSAJES_MFA.sesion };

  const codigo = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(codigo)) {
    return { error: MENSAJES_MFA.codigo };
  }

  let factorId = String(formData.get("factorId") ?? "").trim();
  if (!factorId) {
    const { data: factores } = await supabase.auth.mfa.listFactors();
    const verificado = factores?.totp?.[0];
    if (!verificado) return { error: MENSAJES_MFA.sinFactor };
    factorId = verificado.id;
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
  if (error) {
    // Sin console.error: un código equivocado es lo más normal del mundo y
    // no es una anomalía que valga la pena registrar en cada intento.
    return { error: MENSAJES_MFA.codigo };
  }

  redirect("/dashboard");
}
