"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "Volver" de verdad: a la pantalla de la que se vino (la ficha del
 * alumno si se llegó con "Cobrar" desde ahí, el buscador si se llegó
 * buscando), no a un destino fijo. Un `<Link href="/pagos/nuevo">` sirve
 * para "elegir otro alumno" cuando se llegó buscando, pero manda a
 * cualquiera que haya llegado desde la ficha de un alumno de vuelta al
 * buscador en vez de a esa ficha — `router.back()` no tiene ese problema
 * porque no asume de dónde se vino, usa el historial real del navegador.
 */
export function VolverAtras({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
    >
      <ArrowLeft className="size-3" strokeWidth={2} />
      {children}
    </button>
  );
}
