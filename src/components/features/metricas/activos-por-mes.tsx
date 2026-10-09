"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { activosPorMesAction } from "@/app/(app)/metricas/actions";
import type { Metricas } from "@/use-cases/metricas/consultas";
import { BarraConTendencia } from "@/components/features/metricas/barra-con-tendencia";
import { etiquetaDeMes, sumarMeses } from "@/domain/fechas/calendario";

/**
 * "Alumnos activos por mes", con flechas — a propósito un Client
 * Component con su propio estado, no un `<Link href="?activosMes=...">`
 * como el resto de la navegación de Métricas: ese patrón recarga TODA la
 * página (la transacción entera de `metricasQuery`, ~15 consultas) para
 * mover solo este gráfico. Acá la flecha llama a `activosPorMesAction`
 * (una consulta suelta y chica) y solo este bloque se actualiza.
 *
 * Arranca con los datos que ya trajo el servidor (`inicial`): el primer
 * vistazo no espera ningún fetch de más.
 */
export function ActivosPorMes({ inicial }: { inicial: Metricas["activosPorMesNavegable"] }) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function moverMes(delta: 1 | -1) {
    const mes = sumarMeses(datos.mesReferencia, delta);
    iniciar(async () => {
      const resultado = await activosPorMesAction(mes);
      if (resultado.ok) {
        setDatos(resultado);
        setError(null);
      } else {
        setError(resultado.mensaje);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="t-rotulo">Alumnos activos por mes</p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">A fin de cada mes</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Un mes antes"
            disabled={pendiente}
            onClick={() => moverMes(-1)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none disabled:opacity-50"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <span className="tabular min-w-[6.5rem] text-center text-sm font-medium capitalize">
            {etiquetaDeMes(datos.mesReferencia, { conAnio: true })}
          </span>
          <button
            type="button"
            aria-label="Un mes después"
            disabled={pendiente}
            onClick={() => moverMes(1)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none disabled:opacity-50"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <div className="mt-2 overflow-x-auto" aria-busy={pendiente}>
        <BarraConTendencia
          puntos={datos.puntos}
          formatearValor={(v) => String(v)}
          colorBarra="fill-verde"
          colorLinea="stroke-revisar"
          colorPunto="fill-revisar"
        />
      </div>
    </div>
  );
}
