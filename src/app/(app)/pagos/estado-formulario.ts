import type { PagoRegistrado, SuperposicionDeCobertura } from "@/use-cases/pagos/registrar-pago";

/**
 * El contrato entre la Server Action de pagos y el formulario de cobro.
 *
 * Archivo aparte por la misma restricción de Next.js que en alumnos: un
 * módulo `"use server"` solo puede exportar funciones async, así que los
 * tipos y el estado inicial no pueden vivir ahí.
 */
export interface EstadoPago {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  /**
   * El pago pisa una cobertura que ya existe. No es un error: el
   * formulario muestra qué se superpone y deja decidir. Puede ser
   * perfectamente legítimo (dos medios meses seguidos, un ajuste).
   */
  superposicion?: SuperposicionDeCobertura;
  /** El comprobante de lo que se acaba de registrar. */
  registrado?: PagoRegistrado;
}

export const ESTADO_PAGO_INICIAL: EstadoPago = { ok: false };

/** El contrato entre la anulación de un pago y su diálogo. */
export interface EstadoAnulacion {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  /** El pago que quedó anulado: el diálogo lo usa para saber que ya terminó. */
  anulado?: string;
}

export const ESTADO_ANULACION_INICIAL: EstadoAnulacion = { ok: false };

/** El contrato entre "Cambiar días" de un pago y su diálogo. */
export interface EstadoCambioDeDias {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  /** El pago viejo, ya anulado: el diálogo lo usa para saber que terminó. */
  anulado?: string;
}

export const ESTADO_CAMBIO_DE_DIAS_INICIAL: EstadoCambioDeDias = { ok: false };
