"use client";

import { motion, useReducedMotion } from "motion/react";
import type { MesDeFacturacion } from "@/use-cases/metricas/consultas";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { importe, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Facturación por mes, como barras verticales simples — CSS puro, sin
 * librería de gráficos. No hay eje ni grilla decorativa: cada barra lleva
 * su propio importe arriba, que es el dato que importa, no la escala.
 */
export function GraficoDeFacturacion({
  meses,
  moneda,
}: {
  meses: MesDeFacturacion[];
  moneda: string;
}) {
  const quieto = useReducedMotion();
  const maximo = Math.max(1, ...meses.map((m) => m.total));

  return (
    <div className="flex items-end gap-3 sm:gap-5">
      {meses.map((mes, i) => {
        const proporcion = mes.total / maximo;
        return (
          <div key={mes.mes} className="flex flex-1 flex-col items-center gap-2">
            <span className="tabular text-[0.7rem] whitespace-nowrap text-muted-foreground">
              {mes.total > 0 ? numero(mes.total) : "—"}
            </span>
            <div className="flex h-28 w-full items-end sm:h-36">
              <motion.div
                title={`${mes.etiqueta}: ${importe(mes.total, moneda)}`}
                initial={quieto ? { scaleY: proporcion } : { scaleY: 0 }}
                animate={{ scaleY: Math.max(proporcion, mes.total > 0 ? 0.03 : 0) }}
                transition={{ duration: DURACION.pausado, ease: SALIDA, delay: quieto ? 0 : i * 0.05 }}
                className={cn(
                  "w-full origin-bottom rounded-t-[3px]",
                  i === meses.length - 1 ? "bg-foreground" : "bg-muted-foreground/30",
                )}
              />
            </div>
            <span className="text-[0.7rem] text-muted-foreground capitalize">{mes.etiqueta}</span>
          </div>
        );
      })}
    </div>
  );
}
