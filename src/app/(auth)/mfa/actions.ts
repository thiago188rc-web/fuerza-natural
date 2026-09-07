"use server";

/**
 * TODO (fase posterior): reemplazar este no-op por
 * supabase.auth.mfa.challengeAndVerify({ factorId, code }) real, con el
 * factorId obtenido de supabase.auth.mfa.listFactors() y el código de 6
 * dígitos ingresado por el usuario. El objetivo de Fase 0 es únicamente
 * que la ruta /mfa exista y se vea — no el flujo TOTP completo.
 */
export async function verifyMfaCode(): Promise<void> {
  // Intencionalmente vacío por ahora.
}
