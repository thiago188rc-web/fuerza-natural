import type { EstadoDeCobertura } from "@/domain/pagos/cobertura";
import { cn } from "@/lib/utils";

/**
 * La señal de estado: un cuadradito de 8px.
 *
 * Cuadrado y no círculo. Un círculo de color es el "badge de estado" que
 * tiene cualquier panel; un cuadrado alineado a una grilla se lee como la
 * marca de un instrumento, que es la dirección del producto. Es un detalle
 * mínimo y es exactamente donde se decide si algo parece plantilla.
 *
 * El color NUNCA viaja solo: siempre va acompañado de texto. Un 8% de los
 * hombres no distingue rojo de verde, y "quién debe" no puede depender de
 * eso.
 */

export const COLOR_DE_ESTADO: Record<EstadoDeCobertura, string> = {
  CUBIERTO: "bg-cubierto",
  REVISAR: "bg-revisar",
  DESCUBIERTO: "bg-descubierto",
  NO_APLICA: "bg-muted-foreground/40",
};

export const TEXTO_DE_ESTADO: Record<EstadoDeCobertura, string> = {
  CUBIERTO: "text-cubierto",
  REVISAR: "text-revisar",
  DESCUBIERTO: "text-descubierto",
  NO_APLICA: "text-muted-foreground",
};

export const ETIQUETA_DE_ESTADO: Record<EstadoDeCobertura, string> = {
  CUBIERTO: "Cubierto",
  REVISAR: "Para revisar",
  DESCUBIERTO: "Sin cubrir",
  NO_APLICA: "No aplica",
};

export function Senal({
  estado,
  className,
}: {
  estado: EstadoDeCobertura;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("block size-2 shrink-0 rounded-[2px]", COLOR_DE_ESTADO[estado], className)}
    />
  );
}
