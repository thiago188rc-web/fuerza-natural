import {
  ArrowRightLeft,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

/**
 * Cómo se LEE cada hecho de negocio.
 *
 * Los verbos están en pasado y en tercera persona porque la línea de
 * actividad cuenta lo que ya ocurrió: "se dio de alta", no "alta". Un
 * historial escrito con sustantivos sueltos ("ALTA · 7 sep · Ana Gómez")
 * obliga a traducir mentalmente cada fila; uno escrito con frases se lee
 * de corrido.
 */

export interface FormaDeEvento {
  verbo: string;
  icono: LucideIcon;
  /** Clase de color del ícono. Neutro salvo que el hecho lo justifique. */
  tono: string;
}

export const FORMA_DE_EVENTO: Record<string, FormaDeEvento> = {
  ALTA: { verbo: "se dio de alta", icono: LogIn, tono: "text-cubierto" },
  BAJA: { verbo: "se dio de baja", icono: LogOut, tono: "text-descubierto" },
  REACTIVACION: { verbo: "volvió", icono: RotateCcw, tono: "text-cubierto" },
  PAUSA: { verbo: "pausó su membresía", icono: Pause, tono: "text-revisar" },
  REANUDACION: { verbo: "reanudó su membresía", icono: Play, tono: "text-cubierto" },
  CAMBIO_PLAN: { verbo: "cambió de plan", icono: ArrowRightLeft, tono: "text-muted-foreground" },
  CONTACTO: { verbo: "fue contactado", icono: MessageSquare, tono: "text-muted-foreground" },
  NOTA: { verbo: "recibió una nota", icono: FileText, tono: "text-muted-foreground" },
};

export function formaDeEvento(tipo: string): FormaDeEvento {
  return FORMA_DE_EVENTO[tipo] ?? { verbo: tipo.toLowerCase(), icono: FileText, tono: "text-muted-foreground" };
}

/**
 * El detalle en una línea, cuando el evento lo trae. Nunca inventa: si
 * `datos` no tiene nada útil, devuelve null y la fila queda con el verbo
 * solo — que ya dice lo esencial.
 */
export function detalleDeEvento(tipo: string, datos: Record<string, unknown>): string | null {
  const texto = (clave: string): string | null => {
    const valor = datos[clave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : null;
  };

  if (tipo === "BAJA") {
    const motivo = texto("motivoEtiqueta") ?? texto("motivo");
    const observacion = texto("observacion");
    if (motivo && observacion) return `${motivo} — ${observacion}`;
    return motivo ?? observacion;
  }
  if (tipo === "PAUSA") {
    const hasta = texto("pausaHasta");
    const nota = texto("nota") ?? texto("pausaNota");
    if (hasta && nota) return `hasta el ${hasta} — ${nota}`;
    return hasta ? `hasta el ${hasta}` : nota;
  }
  if (tipo === "CAMBIO_PLAN") {
    const desde = texto("planAnterior");
    const hasta = texto("planNuevo");
    if (desde && hasta) return `${desde} → ${hasta}`;
    return hasta;
  }
  return texto("resumen") ?? texto("nota") ?? texto("observacion");
}
