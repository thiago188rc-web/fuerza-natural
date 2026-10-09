"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { captacionDelMesAction } from "@/app/(app)/metricas/actions";
import type { CaptacionDelMesResultado } from "@/use-cases/metricas/consultas";
import { TortaDeCanales } from "@/components/features/metricas/captacion";
import { sumarMeses } from "@/domain/fechas/calendario";

/**
 * La misma torta de "Cómo nos conocieron", pero de un mes puntual — el
 * porcentaje se lee mejor en el anillo que en la barra apilada de "En qué
 * mes empiezan" (pedido del dueño). Reusa `TortaDeCanales` entero: es el
 * mismo dibujo, con otro título y otros datos.
 *
 * Mismo patrón que `ActivosPorMes`: estado propio, sin tocar la URL ni
 * recargar la página al cambiar de mes.
 */
export function CaptacionDelMes({ inicial }: { inicial: CaptacionDelMesResultado }) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function moverMes(delta: 1 | -1) {
    const mes = sumarMeses(datos.mesReferencia, delta);
    iniciar(async () => {
      const resultado = await captacionDelMesAction(mes);
      if (resultado.ok) {
        setDatos(resultado);
        setError(null);
      } else {
        setError(resultado.mensaje);
      }
    });
  }

  const flechas = (
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
  );

  return (
    <div aria-busy={pendiente}>
      <TortaDeCanales
        captacion={datos.captacion}
        titulo={`Cómo nos conocieron · ${datos.etiqueta}`}
        subtitulo="Quienes se dieron de alta ese mes"
        vacio="Nadie se dio de alta este mes."
        extraDelEncabezado={flechas}
      />
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
