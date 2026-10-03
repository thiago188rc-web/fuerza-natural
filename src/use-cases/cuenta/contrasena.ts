import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { conflict, forbidden, ok, validationError } from "@/use-cases/_kernel/result";
import { cambiarContrasenaSchema, type CambiarContrasenaRaw } from "@/schemas/cuenta";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { esFalloDeInfraestructuraAuth } from "@/lib/auth/flujo-login";
import {
  MENSAJES_CONTRASENA,
  exigeContrasenaActual,
  mensajeDeErrorAlCambiar,
} from "@/lib/auth/flujo-contrasena";
import {
  LIMITES,
  bloqueadoHasta,
  claveDeIntento,
  limpiarFallos,
  registrarFallo,
} from "@/lib/auth/limite-de-intentos";
import { registrarError } from "@/lib/registro-seguro";

/**
 * CAMBIAR LA CONTRASEÑA, con la sesión abierta.
 *
 * La contraseña la guarda Supabase Auth, no esta base: acá solo se decide
 * quién puede cambiarla y cómo. Reglas:
 *
 *   · Hace falta la contraseña actual, salvo que la sesión venga del enlace
 *     de recuperación de los últimos 15 minutos (ver
 *     `exigeContrasenaActual`). La actual se verifica contra Supabase, con
 *     el mismo límite de intentos que el login.
 *   · La nueva: 10 a 72 caracteres (Supabase acepta 6; acá se pide más).
 *   · Al cambiarla se cierran las OTRAS sesiones abiertas: si alguien tenía
 *     la contraseña vieja y estaba adentro, queda afuera.
 *   · Queda en la actividad que la cambió, nunca la contraseña.
 */

export interface RequisitosDeContrasena {
  /** false en desarrollo sin Supabase: no hay contraseña real que cambiar. */
  disponible: boolean;
  pideActual: boolean;
}

function ahoraEnSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

export const requisitosDeContrasenaQuery = withAuth<void, RequisitosDeContrasena>(
  ["DUENO", "STAFF"],
  async () => {
    if (!isSupabaseConfigured()) return ok({ disponible: false, pideActual: true });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error && esFalloDeInfraestructuraAuth(error)) return conflict(MENSAJES_CONTRASENA.sinConexion);
    if (error || !data?.claims) return forbidden();
    return ok({ disponible: true, pideActual: exigeContrasenaActual(data.claims.amr, ahoraEnSegundos()) });
  },
);

export interface ContrasenaCambiada {
  /** Si se pudieron cerrar las demás sesiones. */
  otrasSesionesCerradas: boolean;
}

export const cambiarContrasenaAction = withAuth<CambiarContrasenaRaw, ContrasenaCambiada>(
  ["DUENO", "STAFF"],
  async (ctx, rawInput) => {
    const parsed = parseInput(cambiarContrasenaSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const { actual, nueva } = parsed.data;

    if (!isSupabaseConfigured()) return conflict(MENSAJES_CONTRASENA.noDisponible);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.getClaims();
    if (error && esFalloDeInfraestructuraAuth(error)) return conflict(MENSAJES_CONTRASENA.sinConexion);
    if (error || !data?.claims) return forbidden();
    const email = typeof data.claims.email === "string" ? data.claims.email : null;

    if (exigeContrasenaActual(data.claims.amr, ahoraEnSegundos())) {
      if (!actual) return validationError([{ path: "actual", message: "Escribí tu contraseña actual." }]);
      if (!email) return conflict(MENSAJES_CONTRASENA.reautenticar);

      const clave = claveDeIntento("contrasena-actual", ctx.userId);
      if (await bloqueadoHasta([clave])) return conflict(MENSAJES_CONTRASENA.demasiadosIntentos);

      const verificacion = await supabase.auth.signInWithPassword({ email, password: actual });
      if (verificacion.error) {
        if (esFalloDeInfraestructuraAuth(verificacion.error)) {
          registrarError("[contraseña] Supabase Auth no respondió:", verificacion.error);
          return conflict(MENSAJES_CONTRASENA.sinConexion);
        }
        await registrarFallo(clave, LIMITES.contrasenaActual);
        return validationError([{ path: "actual", message: MENSAJES_CONTRASENA.actualIncorrecta }]);
      }
      await limpiarFallos(clave);
    }

    const cambio = await supabase.auth.updateUser({ password: nueva });
    if (cambio.error) {
      if (esFalloDeInfraestructuraAuth(cambio.error)) {
        registrarError("[contraseña] Supabase Auth no respondió:", cambio.error);
        return conflict(MENSAJES_CONTRASENA.sinConexion);
      }
      const mensaje = mensajeDeErrorAlCambiar(cambio.error.code);
      if (cambio.error.code === "weak_password" || cambio.error.code === "same_password") {
        return validationError([{ path: "nueva", message: mensaje }]);
      }
      registrarError("[contraseña] Supabase rechazó el cambio:", cambio.error);
      return conflict(mensaje);
    }

    const salida = await supabase.auth.signOut({ scope: "others" });
    if (salida.error) registrarError("[contraseña] no se cerraron las otras sesiones:", salida.error);

    await withTenantTx(ctx, (tx) =>
      logActivity(tx, ctx, {
        accion: "user.password_changed",
        entidad: "app_user",
        entidadId: ctx.userId,
        resumen: `${ctx.nombre} cambió su contraseña`,
      }),
    );

    return ok({ otrasSesionesCerradas: !salida.error });
  },
);
