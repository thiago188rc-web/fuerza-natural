"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { DEV_MOCK_AUTH_COOKIE } from "@/lib/auth/config";

/**
 * Server Action de logout, usada desde el nav de src/app/(app)/layout.tsx.
 * No pasa por withAuth(): cerrar tu propia sesión no requiere estar
 * autorizado para ninguna operación de negocio puntual, solo tener (o
 * haber tenido) una sesión — signOut() no falla si ya no hay ninguna.
 */
export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(DEV_MOCK_AUTH_COOKIE);
  redirect("/login");
}
