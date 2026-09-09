import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { modoMfa } from "@/lib/auth/flujo-login";
import { DesafioMfa } from "./desafio-mfa";
import { EnrolarMfa } from "./enrolar-mfa";

/**
 * El segundo paso del ingreso. Decide en el servidor qué corresponde:
 *
 *   - sin sesión           → al login (acá no se llega sin contraseña)
 *   - ya en aal2           → al dashboard (no hay nada que verificar)
 *   - con factor verificado→ pedir el código
 *   - sin factor           → configurar uno
 *
 * Sin Supabase configurado esta pantalla no forma parte del flujo (la
 * sesión simulada de desarrollo entra directo al dashboard), así que
 * redirige en vez de mostrar un formulario que no podría funcionar.
 */
export default async function MfaPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createSupabaseServerClient();

  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario?.user) redirect("/login");

  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factores } = await supabase.auth.mfa.listFactors();

  const verificados = factores?.totp ?? [];
  const aal = nivel ? { currentLevel: nivel.currentLevel, nextLevel: nivel.nextLevel } : null;
  const modo = modoMfa(verificados, aal);

  if (modo === "listo") redirect("/dashboard");
  if (modo === "challenge") return <DesafioMfa factorId={verificados[0]!.id} />;

  return <EnrolarMfa />;
}
