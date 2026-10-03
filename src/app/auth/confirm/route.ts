import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { destinoSeguro } from "@/lib/auth/flujo-contrasena";
import { registrarError } from "@/lib/registro-seguro";

/**
 * A donde vuelve el enlace de recuperación del email. Acepta las dos
 * formas que usa Supabase:
 *
 *   · `token_hash` + `type=recovery` — la recomendada para SSR. Funciona
 *     aunque el email se abra en otro dispositivo. Requiere ajustar la
 *     plantilla "Reset Password" en Supabase (ver docs/RUNBOOK.md).
 *   · `code` (PKCE) — la de la plantilla por defecto. Solo funciona en el
 *     mismo navegador donde se pidió el enlace.
 *
 * Si sale bien, la sesión queda abierta y redirige a elegir la contraseña;
 * si no, vuelve a /recuperar con el aviso. Ni el token ni la URL van al
 * log. `next` solo puede ser un destino de la lista (destinoSeguro).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const destino = destinoSeguro(params.get("next"));
  const tokenHash = params.get("token_hash");
  const tipo = params.get("type");
  const codigo = params.get("code");

  if (!isSupabaseConfigured()) redirect("/recuperar?error=enlace");

  const supabase = await createSupabaseServerClient();
  let error: unknown = null;
  if (tokenHash && tipo === "recovery") {
    ({ error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash }));
  } else if (codigo) {
    ({ error } = await supabase.auth.exchangeCodeForSession(codigo));
  } else {
    redirect("/recuperar?error=enlace");
  }

  if (error) {
    registrarError("[recuperar] el enlace no se pudo validar:", error);
    redirect("/recuperar?error=enlace");
  }
  redirect(destino);
}
