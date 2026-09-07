/**
 * EL ESTADO DE LA RELACIÓN CON EL GIMNASIO — y nada más.
 *
 * Esto NO es "situación de pago". Un alumno puede estar ACTIVO sin tener
 * un solo pago registrado en el sistema nuevo, y eso es correcto: la
 * situación de pago se DERIVA de `payments` en Fase 2 y nunca se persiste
 * (SPEC V1 §5, §9). No existen ni existirán acá los valores MOROSO,
 * VENCIDO, PERDIDO ni INACTIVO.
 *
 * Nombres en español (ACTIVO/PAUSADO/BAJA) y no en inglés: son los valores
 * que Fase 0 ya escribió en el CHECK de `app.students.vinculo` y en la
 * fila de todos los datos existentes. Cambiarlos a ACTIVE/PAUSED sería una
 * migración de datos y de constraint a cambio de nada.
 */
export const VINCULOS = ["ACTIVO", "PAUSADO", "BAJA"] as const;

export type Vinculo = (typeof VINCULOS)[number];

export function esVinculo(valor: unknown): valor is Vinculo {
  return typeof valor === "string" && (VINCULOS as readonly string[]).includes(valor);
}

const ETIQUETAS: Record<Vinculo, string> = {
  ACTIVO: "Activo",
  PAUSADO: "Pausado",
  BAJA: "Baja",
};

/** Etiqueta en español. Vive en el dominio porque también la usa la auditoría. */
export function etiquetaVinculo(vinculo: Vinculo): string {
  return ETIQUETAS[vinculo];
}

/**
 * Transiciones permitidas. Ninguna ocurre automáticamente: todas nacen de
 * una acción humana explícita (principio "el sistema detecta, el dueño
 * decide"). En particular, NO existe una transición automática a BAJA por
 * falta de pago ni por falta de asistencia.
 *
 * BAJA → PAUSADO no está permitida a propósito: pausar a alguien que ya
 * se dio de baja no significa nada; el camino es reactivar y después
 * pausar, y así queda registrado en el historial como los dos hechos que
 * realmente son.
 */
const TRANSICIONES: Record<Vinculo, readonly Vinculo[]> = {
  ACTIVO: ["PAUSADO", "BAJA"],
  PAUSADO: ["ACTIVO", "BAJA"],
  BAJA: ["ACTIVO"],
};

export function transicionesPermitidas(desde: Vinculo): readonly Vinculo[] {
  return TRANSICIONES[desde];
}

export function esTransicionPermitida(desde: Vinculo, hacia: Vinculo): boolean {
  return TRANSICIONES[desde].includes(hacia);
}
