"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isSupabaseConfigured, urlDeLaApp } from "@/lib/auth/config";
import { esFalloDeInfraestructuraAuth } from "@/lib/auth/flujo-login";
import { MENSAJES_CONTRASENA } from "@/lib/auth/flujo-contrasena";
import {
  LIMITES,
  bloqueadoHasta,
  claveDeIntento,
  ipDelPedido,
  registrarFallo,
} from "@/lib/auth/limite-de-intentos";
import { pedirRecuperacionSchema } from "@/schemas/cuenta";
import { registrarError } from "@/lib/registro-seguro";

export interface EstadoRecuperacion {
  enviado?: boolean;
  error?: string;
}

/**
 * Pedir el enlace para elegir una contraseña nueva. Como el login, existe
 * ANTES de que haya sesión, así que no pasa por withAuth().
 *
 * La respuesta es la misma exista o no la cuenta: decir "ese email no está
 * registrado" le serviría a cualquiera para averiguar quién tiene usuario.
 * La única excepción es cuando Supabase no contestó, que no depende del
 * email. Cada pedido cuenta para el límite por IP (5 por hora): cada uno
 * dispara un email, y sin límite esto sirve para llenarle la casilla a
 * alguien. El email nunca va al log.
 */
export async function pedirRecuperacion(
  _prev: EstadoRecuperacion,
  formData: FormData,
): Promise<EstadoRecuperacion> {
  const parsed = pedirRecuperacionSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Escribí un email válido." };

  if (!isSupabaseConfigured()) return { error: MENSAJES_CONTRASENA.noDisponible };

  const encabezados = await headers();
  const clave = claveDeIntento("recuperar", ipDelPedido(encabezados));
  if (await bloqueadoHasta([clave])) return { error: MENSAJES_CONTRASENA.demasiadosIntentos };
  await registrarFallo(clave, LIMITES.recuperacionPorIp);

  const destino = `${urlDeLaApp(encabezados.get("origin"))}/auth/confirm?next=/cuenta/contrasena`;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await Promise.race([
      supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: destino }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    if (error && esFalloDeInfraestructuraAuth(error)) {
      registrarError("[recuperar] Supabase Auth no respondió:", error);
      return { error: MENSAJES_CONTRASENA.sinConexion };
    }
    // Cualquier otro rechazo (límite de envíos de Supabase, etc.) queda en
    // el log y la pantalla dice lo mismo que siempre.
    if (error) registrarError("[recuperar] Supabase rechazó el pedido:", error);
  } catch (err) {
    registrarError("[recuperar] error al pedir el enlace:", err);
    return { error: MENSAJES_CONTRASENA.sinConexion };
  }

  return { enviado: true };
}
