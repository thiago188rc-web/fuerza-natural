import { esTransicionPermitida, etiquetaVinculo, type Vinculo } from "./vinculo";

/**
 * El corazón del cambio de estado, como función PURA: recibe el estado
 * actual y el destino, devuelve exactamente qué columnas deben quedar
 * escritas. No toca la base, no lee el reloj (recibe `hoy`), no sabe qué
 * es una transacción. Por eso se puede testear exhaustivamente sin
 * Postgres — que es todo el punto de tener `src/domain/` separado.
 *
 * Devuelve el conjunto COMPLETO de columnas de estado, incluidas las que
 * hay que limpiar. Esto no es un detalle estético: `app.students` tiene
 * CHECKs de coherencia (SPEC V1 §4.5) que rechazan, por ejemplo, un alumno
 * ACTIVO que conserve `baja_fecha` de una baja anterior. Devolver el
 * conjunto entero hace imposible olvidarse de limpiar un campo.
 */

export const MOTIVO_BAJA_SIN_ESPECIFICAR = "SIN_ESPECIFICAR";
export const ETIQUETA_BAJA_SIN_ESPECIFICAR = "Sin especificar";

/** Tipos de `app.student_events.tipo` que puede producir un cambio de estado. */
export type EventoDeVinculo = "BAJA" | "REACTIVACION" | "PAUSA" | "REANUDACION";

export interface EstadoActualDelVinculo {
  vinculo: Vinculo;
  fechaAltaOriginal: string;
}

export interface DatosDelCambio {
  /** Solo se usa al pausar. Fecha civil ISO (YYYY-MM-DD). */
  pausaHasta?: string | null;
  /** Nota corta y opcional. Al pausar cubre el CHECK de coherencia. */
  nota?: string | null;
}

/** Las columnas de estado de `students`, completas. */
export interface CambioDeVinculo {
  vinculo: Vinculo;
  vinculoDesde: string;
  pausaHasta: string | null;
  pausaNota: string | null;
  bajaFecha: string | null;
  bajaMotivoCodigo: string | null;
  bajaMotivoEtiqueta: string | null;
  bajaObservacion: string | null;
}

export type MotivoRechazo =
  | "MISMO_ESTADO"
  | "TRANSICION_INVALIDA"
  | "PAUSA_SIN_DATOS"
  | "PAUSA_HASTA_EN_EL_PASADO"
  | "FECHA_ANTERIOR_AL_ALTA";

export type ResultadoCambioDeVinculo =
  | { ok: true; cambio: CambioDeVinculo; evento: EventoDeVinculo; resumen: string }
  | { ok: false; motivo: MotivoRechazo };

const SIN_PAUSA = { pausaHasta: null, pausaNota: null } as const;
const SIN_BAJA = {
  bajaFecha: null,
  bajaMotivoCodigo: null,
  bajaMotivoEtiqueta: null,
  bajaObservacion: null,
} as const;

export function mensajeDeRechazo(motivo: MotivoRechazo): string {
  switch (motivo) {
    case "MISMO_ESTADO":
      return "El alumno ya está en ese estado.";
    case "TRANSICION_INVALIDA":
      return "Ese cambio de estado no está permitido.";
    case "PAUSA_SIN_DATOS":
      return "Para pausar hace falta indicar una fecha de reanudación o un motivo.";
    case "PAUSA_HASTA_EN_EL_PASADO":
      return "La fecha de reanudación no puede ser anterior a hoy.";
    case "FECHA_ANTERIOR_AL_ALTA":
      return "El alumno tiene una fecha de alta posterior a hoy; corregila antes de cambiar el estado.";
  }
}

/**
 * `hoy` llega siempre como parámetro (calculado con `hoyISO()` en la TZ del
 * gimnasio, del lado del servidor) — nunca `new Date()` acá adentro.
 */
export function resolverCambioDeVinculo(
  actual: EstadoActualDelVinculo,
  destino: Vinculo,
  hoy: string,
  datos: DatosDelCambio = {},
): ResultadoCambioDeVinculo {
  if (actual.vinculo === destino) return { ok: false, motivo: "MISMO_ESTADO" };
  if (!esTransicionPermitida(actual.vinculo, destino)) {
    return { ok: false, motivo: "TRANSICION_INVALIDA" };
  }
  // `vinculo_desde` pasa a ser hoy, y la base exige vinculo_desde >=
  // fecha_alta_original. Un alta con fecha futura (solo posible por un dato
  // mal cargado) haría fallar el INSERT con un error de constraint crudo —
  // preferimos un mensaje que diga qué arreglar.
  if (hoy < actual.fechaAltaOriginal) {
    return { ok: false, motivo: "FECHA_ANTERIOR_AL_ALTA" };
  }

  const nota = normalizarNota(datos.nota);

  if (destino === "PAUSADO") {
    const pausaHasta = datos.pausaHasta?.trim() ? datos.pausaHasta.trim() : null;
    // Espeja el CHECK `students_pausa_coherencia_check`: una pausa sin
    // fecha de vuelta NI motivo es un dato que nadie va a poder interpretar
    // dentro de tres meses.
    if (!pausaHasta && !nota) return { ok: false, motivo: "PAUSA_SIN_DATOS" };
    if (pausaHasta && pausaHasta < hoy) {
      return { ok: false, motivo: "PAUSA_HASTA_EN_EL_PASADO" };
    }

    return {
      ok: true,
      evento: "PAUSA",
      resumen: pausaHasta ? `Pausado hasta ${pausaHasta}` : "Pausado",
      cambio: {
        vinculo: "PAUSADO",
        vinculoDesde: hoy,
        pausaHasta,
        pausaNota: nota,
        ...SIN_BAJA,
      },
    };
  }

  if (destino === "BAJA") {
    // Fase 1 registra el HECHO de la baja con lo mínimo que la base exige
    // (fecha + código de motivo). El workflow completo — catálogo de
    // motivos del gimnasio, fecha efectiva distinta de hoy, métricas — es
    // Fase 3. El código SIN_ESPECIFICAR es deliberadamente distinto de
    // "OTRO": deja a Fase 3 poder encontrar exactamente estas bajas y
    // pedirle al dueño el motivo real, en vez de fingir que ya lo eligió.
    return {
      ok: true,
      evento: "BAJA",
      resumen: "Baja registrada",
      cambio: {
        vinculo: "BAJA",
        vinculoDesde: hoy,
        ...SIN_PAUSA,
        bajaFecha: hoy,
        bajaMotivoCodigo: MOTIVO_BAJA_SIN_ESPECIFICAR,
        bajaMotivoEtiqueta: ETIQUETA_BAJA_SIN_ESPECIFICAR,
        bajaObservacion: nota,
      },
    };
  }

  // destino === "ACTIVO": reactivación (desde BAJA) o reanudación (desde
  // PAUSADO). En los dos casos se limpian TODAS las columnas del estado
  // anterior — si quedara `baja_fecha` colgada, el CHECK de coherencia de
  // la base rechazaría la fila.
  const evento: EventoDeVinculo = actual.vinculo === "BAJA" ? "REACTIVACION" : "REANUDACION";
  return {
    ok: true,
    evento,
    resumen: evento === "REACTIVACION" ? "Reactivado" : "Reanudado",
    cambio: {
      vinculo: "ACTIVO",
      vinculoDesde: hoy,
      ...SIN_PAUSA,
      ...SIN_BAJA,
    },
  };
}

/** Resumen legible para auditoría e historial. */
export function resumenDeCambio(desde: Vinculo, hacia: Vinculo, detalle: string): string {
  return `Estado: ${etiquetaVinculo(desde)} → ${etiquetaVinculo(hacia)}. ${detalle}.`;
}

function normalizarNota(nota: string | null | undefined): string | null {
  if (typeof nota !== "string") return null;
  const limpia = nota.trim().replace(/\s+/g, " ");
  return limpia.length > 0 ? limpia : null;
}
