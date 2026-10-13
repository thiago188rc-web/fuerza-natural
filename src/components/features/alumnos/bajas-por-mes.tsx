"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BajaRegistrada } from "@/use-cases/alumnos/bajas";
import { etiquetaDeMes, primerDiaDelMes, sumarMeses } from "@/domain/fechas/calendario";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Las bajas, mes a mes — con flechas, mismo lenguaje que los gráficos
 * navegables de Métricas. Todo sale de `filas`, que la página ya trajo
 * entera (hasta 200 bajas): agrupar por mes es aritmética de cliente, no
 * hace falta otra consulta al servidor ni recargar la página al navegar.
 */
export function BajasPorMes({ filas, hoy }: { filas: readonly BajaRegistrada[]; hoy: string }) {
  const mesDeHoy = primerDiaDelMes(hoy);
  const [mes, setMes] = useState(mesDeHoy);

  const deEsteMes = useMemo(
    () =>
      filas
        .filter((f) => f.bajaFecha !== null && primerDiaDelMes(f.bajaFecha) === mes)
        .sort((a, b) => a.apellido.localeCompare(b.apellido)),
    [filas, mes],
  );

  return (
    <section className="superficie px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="t-rotulo">Bajas por mes</p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Un mes antes"
            onClick={() => setMes(sumarMeses(mes, -1))}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
          >
            <ChevronLeft className="size-3.5" strokeWidth={2} />
          </button>
          <span className="tabular min-w-[6rem] text-center text-xs font-medium capitalize">
            {etiquetaDeMes(mes, { conAnio: true })}
          </span>
          <button
            type="button"
            aria-label="Un mes después"
            disabled={mes >= mesDeHoy}
            onClick={() => setMes(sumarMeses(mes, 1))}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <p className="t-cifra mt-2.5 text-[1.75rem]">{deEsteMes.length}</p>

      {deEsteMes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nadie se dio de baja este mes.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {deEsteMes.map((f) => (
            <li key={f.id}>
              <Link
                href={`/alumnos/${f.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 text-sm",
                  "transition-colors duration-150 hover:bg-muted",
                )}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.6rem] text-muted-foreground ring-1 ring-border">
                  {iniciales(f.nombre, f.apellido)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {f.apellido}, {f.nombre}
                </span>
                {f.bajaMotivoEtiqueta ? (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {f.bajaMotivoEtiqueta}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
