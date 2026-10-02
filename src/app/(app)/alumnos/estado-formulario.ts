/**
 * El contrato entre las Server Actions de alumnos y los formularios que
 * las usan.
 *
 * Vive en su propio archivo y no en `actions.ts` por una restricción real
 * de Next.js: un módulo con `"use server"` solo puede exportar funciones
 * async. Exportar desde ahí un objeto (como el estado inicial) rompe el
 * build con "A 'use server' file can only export async functions".
 */
export interface EstadoFormulario {
  ok: boolean;
  /** Mensaje general (conflictos, errores inesperados). */
  mensaje?: string;
  /** Errores por campo, para pintarlos al lado de cada input. */
  errores?: Record<string, string>;
  /**
   * Qué estado quedó aplicado, en el cambio de vínculo. Lo usa la UI para
   * saber que el formulario que el usuario tenía abierto ya se resolvió,
   * sin tener que resetear estado dentro de un efecto.
   */
  vinculoAplicado?: string;
  /**
   * Lo que se mandó, cuando el guardado falló. React 19 vacía el formulario
   * después de cada envío: sin esto, un DNI repetido obligaba a tipear la
   * ficha entera de nuevo. Con `intento` el formulario se rearma con estos
   * valores (ver formulario-alumno.tsx).
   */
  valores?: Record<string, string | string[]>;
  intento?: number;
}

export const ESTADO_FORMULARIO_INICIAL: EstadoFormulario = { ok: false };
