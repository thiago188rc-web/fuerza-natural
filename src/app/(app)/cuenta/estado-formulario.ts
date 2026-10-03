/**
 * El contrato entre el cambio de contraseña y su formulario. Aparte de
 * actions.ts porque un módulo "use server" solo exporta funciones async.
 */
export interface EstadoContrasena {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  otrasSesionesCerradas?: boolean;
}

export const ESTADO_CONTRASENA_INICIAL: EstadoContrasena = { ok: false };
