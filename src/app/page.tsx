import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";

/**
 * La raíz nunca se renderiza: solo decide a dónde mandar según haya o no
 * una sesión válida (SPEC V1 §3.4 — getAuthContext es la única fuente de
 * verdad para eso, nunca una cookie leída a mano acá).
 */
export default async function Home() {
  const ctx = await getAuthContext();
  redirect(ctx ? "/dashboard" : "/login");
}
