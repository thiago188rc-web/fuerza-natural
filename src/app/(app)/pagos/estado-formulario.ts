import type { SuperposicionDeCobertura } from "@/use-cases/pagos/registrar-pago";

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
  registrado?: {
    alumno: string;
    studentId: string;
    telefono: string | null;
    planNombre: string;
    monto: number;
    cubreDesde: string;
    cubreHasta: string;
    modalidad: string;
  };
}

export const ESTADO_PAGO_INICIAL: EstadoPago = { ok: false };
