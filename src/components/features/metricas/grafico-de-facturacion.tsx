"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PuntoDeFacturacion } from "@/use-cases/metricas/consultas";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { importe, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Facturación por período (día, semana o mes según la vista elegida), como
 * barras verticales simples — CSS puro, sin librería de gráficos. Sin eje
 * ni grilla decorativa: cada barra lleva su propio importe arriba.
 *
 * Con 8 a 14 barras (vistas mes/semana) puede no entrar cómodo en 375px:
 * en vez de achicar el texto hasta ilegible, el riel scrollea
 * horizontalmente y cada barra tiene un ancho mínimo — mismo criterio que
 * `TablaDePagos`. El ancho mínimo se aplica SIEMPRE (no solo con muchas
 * barras): sin él, los flex-item se niegan a encoger más allá del ancho
 * de su propio contenido (`white-space: nowrap` en las etiquetas), y el
 * riel termina más ancho que su caja igual, sin que se note por qué.
 */
export function GraficoDeFacturacion({
  puntos,
  moneda,
}: {
  puntos: PuntoDeFacturacion[];
  moneda: string;
}) {
  const quieto = useReducedMotion();
  const maximo = Math.max(1, ...puntos.map((p) => p.total));

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div
        className="flex items-end gap-3 sm:gap-5"
        style={{ minWidth: `${Math.max(puntos.length * 2.75, 16)}rem` }}
      >
        {puntos.map((punto, i) => {
          const proporcion = punto.total / maximo;
          return (
            <div key={punto.periodo} className="flex flex-1 flex-col items-center gap-2">
              <span className="tabular text-[0.7rem] whitespace-nowrap text-muted-foreground">
                {punto.total > 0 ? numero(punto.total) : "—"}
              </span>
              <div className="flex h-28 w-full items-end sm:h-36">
                <motion.div
                  title={`${punto.etiqueta}: ${importe(punto.total, moneda)}`}
                  initial={quieto ? { scaleY: proporcion } : { scaleY: 0 }}
                  animate={{ scaleY: Math.max(proporcion, punto.total > 0 ? 0.03 : 0) }}
                  transition={{
                    duration: DURACION.pausado,
                    ease: SALIDA,
                    delay: quieto ? 0 : i * 0.04,
                  }}
                  className={cn(
                    "w-full origin-bottom rounded-t-[3px]",
                    i === puntos.length - 1 ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                />
              </div>
              <span className="text-[0.7rem] whitespace-nowrap text-muted-foreground capitalize">
                {punto.etiqueta}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
