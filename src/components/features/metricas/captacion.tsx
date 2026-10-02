"use client";

import { useState } from "react";
import type { CaptacionPorCanal, ClaveDeCanal, IniciosPorMes } from "@/domain/metricas/captacion";
import { etiquetaClaveDeCanal } from "@/domain/metricas/captacion";
import { cn } from "@/lib/utils";

/**
 * CAPTACIÓN en Métricas: cómo llegó la gente (la torta que pidió el
 * dueño) y en qué época del año empieza, abierto por ese mismo canal —
 * para ver si hay meses mejores y si cada canal tiene su temporada.
 *
 * Colores: series CATEGÓRICAS (`--serie-*` en globals.css), en orden fijo
 * por canal — el mismo canal tiene el mismo color en los dos gráficos.
 * Nunca el semáforo verde/ámbar/rojo: un canal no es un estado. Como tres
 * de esos colores quedan bajo 3:1 sobre blanco, cada porción lleva su
 * número escrito y hay una tabla con todo.
 */

type ClaveConSinDato = ClaveDeCanal | "SIN_DATO";

const COLOR: Record<ClaveConSinDato, { fill: string; stroke: string; bg: string }> = {
  RECOMENDACION: { fill: "fill-serie-1", stroke: "stroke-serie-1", bg: "bg-serie-1" },
  VIVE_CERCA: { fill: "fill-serie-2", stroke: "stroke-serie-2", bg: "bg-serie-2" },
  REDES_SOCIALES: { fill: "fill-serie-3", stroke: "stroke-serie-3", bg: "bg-serie-3" },
  YA_VENIA: { fill: "fill-serie-4", stroke: "stroke-serie-4", bg: "bg-serie-4" },
  VARIOS: { fill: "fill-serie-5", stroke: "stroke-serie-5", bg: "bg-serie-5" },
  OTRO: { fill: "fill-serie-neutra", stroke: "stroke-serie-neutra", bg: "bg-serie-neutra" },
  SIN_DATO: { fill: "fill-muted-foreground/25", stroke: "stroke-muted-foreground/25", bg: "bg-muted-foreground/25" },
};

function etiqueta(clave: ClaveConSinDato): string {
  return clave === "SIN_DATO" ? "Sin dato" : etiquetaClaveDeCanal(clave);
}

const TAMANO = 132;
const GROSOR = 18;
const RADIO = (TAMANO - GROSOR) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
/** Separación entre porciones: el color del fondo, no un borde. */
const HUECO = 2;

export function TortaDeCanales({ captacion }: { captacion: CaptacionPorCanal }) {
  const { segmentos, conDato, sinDato } = captacion;

  if (conDato === 0) {
    return (
      <div>
        <p className="t-rotulo">Cómo nos conocieron</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Todavía ningún alumno tiene cargado cómo conoció el gimnasio. Se completa en su ficha.
        </p>
      </div>
    );
  }

  // Cada arco arranca donde terminó la suma de los anteriores.
  const arcos = segmentos.map((s, i) => {
    const largoTotal = (s.cantidad / conDato) * CIRCUNFERENCIA;
    const offset = segmentos
      .slice(0, i)
      .reduce((suma, previo) => suma + (previo.cantidad / conDato) * CIRCUNFERENCIA, 0);
    const largo = segmentos.length > 1 ? Math.max(largoTotal - HUECO, 0.5) : largoTotal;
    return { ...s, offset, largo };
  });

  return (
    <div>
      <p className="t-rotulo">Cómo nos conocieron</p>
      <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
        Todos los alumnos que pasaron por el gimnasio
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="relative shrink-0" style={{ width: TAMANO, height: TAMANO }}>
          <svg
            width={TAMANO}
            height={TAMANO}
            viewBox={`0 0 ${TAMANO} ${TAMANO}`}
            className="-rotate-90"
            role="img"
            aria-label={`Cómo nos conocieron: ${segmentos.map((s) => `${s.etiqueta} ${s.porcentaje}%`).join(", ")}`}
          >
            {arcos.map((a) => (
              <circle
                key={a.clave}
                cx={TAMANO / 2}
                cy={TAMANO / 2}
                r={RADIO}
                fill="none"
                strokeWidth={GROSOR}
                strokeDasharray={`${a.largo} ${CIRCUNFERENCIA - a.largo}`}
                strokeDashoffset={-a.offset}
                className={cn(COLOR[a.clave].stroke, "transition-[stroke-dasharray] duration-500")}
              >
                <title>{`${a.etiqueta}: ${a.cantidad} (${a.porcentaje}%)`}</title>
              </circle>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="t-cifra text-xl leading-none">{conDato}</span>
            <span className="mt-1 text-[0.65rem] text-muted-foreground">alumnos</span>
          </div>
        </div>

        <ul className="min-w-[12rem] flex-1 space-y-2 text-sm">
          {arcos.map((a) => (
            <li key={a.clave} className="flex min-w-0 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[2px]", COLOR[a.clave].bg)} />
                <span>{a.etiqueta}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{a.porcentaje}%</span> · {a.cantidad}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {sinDato > 0 ? (
        <p className="mt-3 text-[0.7rem] text-muted-foreground">
          {sinDato} {sinDato === 1 ? "alumno no tiene" : "alumnos no tienen"} el dato cargado y no
          entran en el porcentaje.
        </p>
      ) : null}
    </div>
  );
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const ORDEN: ClaveConSinDato[] = ["RECOMENDACION", "VIVE_CERCA", "REDES_SOCIALES", "YA_VENIA", "VARIOS", "OTRO", "SIN_DATO"];
const ALTURA_PISTA_REM = 10;

export function IniciosPorMesDelAnio({ inicios }: { inicios: IniciosPorMes }) {
  const [activo, setActivo] = useState<number | null>(null);
  const maximo = Math.max(1, ...inicios.meses.map((m) => m.total));
  const presentes = ORDEN.filter((c) => inicios.meses.some((m) => m.porCanal.some((p) => p.clave === c)));
  const mejor = inicios.meses.reduce((a, b) => (b.total > a.total ? b : a), inicios.meses[0]);

  if (inicios.total === 0) {
    return (
      <div>
        <p className="t-rotulo">En qué mes empiezan</p>
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay altas cargadas.</p>
      </div>
    );
  }

  const periodo =
    inicios.desdeAnio === inicios.hastaAnio
      ? `en ${inicios.desdeAnio}`
      : `entre ${inicios.desdeAnio} y ${inicios.hastaAnio}`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="t-rotulo">En qué mes empiezan</p>
        <p className="text-[0.7rem] text-muted-foreground">
          {inicios.total} inicios {periodo}, sumando todos los años · el mes más fuerte:{" "}
          <span className="font-medium text-foreground">{MESES_LARGOS[mejor.mes - 1]}</span>
        </p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {presentes.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-[2px]", COLOR[c].bg)} />
            {etiqueta(c)}
          </li>
        ))}
      </ul>

      {/* El detalle del mes señalado, en un renglón fijo arriba del gráfico
          y no en un globo flotante: el contenedor tiene scroll horizontal y
          un globo se cortaría; además así funciona igual tocando en el
          celular. */}
      <div className="mt-3 min-h-[2.5rem] rounded-lg bg-muted/50 px-3 py-2 text-xs" aria-live="polite">
        {activo !== null && inicios.meses[activo].total > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium capitalize">
              {MESES_LARGOS[inicios.meses[activo].mes - 1]} · {inicios.meses[activo].total}
            </span>
            {ORDEN.map((c) => inicios.meses[activo].porCanal.find((p) => p.clave === c))
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .map((p) => (
                <span key={p.clave} className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className={cn("size-2 rounded-[2px]", COLOR[p.clave].bg)} />
                  {etiqueta(p.clave)} <span className="tabular text-foreground">{p.cantidad}</span>
                </span>
              ))}
          </p>
        ) : (
          <p className="text-muted-foreground">Pasá el mouse o tocá un mes para ver de dónde vino esa gente.</p>
        )}
      </div>

      <div className="-mx-1 mt-3 overflow-x-auto px-1">
        <div className="relative flex items-end gap-2 sm:gap-3" style={{ minWidth: "30rem" }}>
          {inicios.meses.map((m, i) => {
            const alto = (m.total / maximo) * ALTURA_PISTA_REM;
            const orden = ORDEN.map((c) => m.porCanal.find((p) => p.clave === c)).filter(
              (p): p is NonNullable<typeof p> => Boolean(p),
            );
            return (
              <div
                key={m.mes}
                className="relative flex flex-1 flex-col items-center gap-1.5"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onClick={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo(null)}
                tabIndex={0}
                aria-label={`${MESES_LARGOS[m.mes - 1]}: ${m.total} inicios. ${orden
                  .map((p) => `${etiqueta(p.clave)} ${p.cantidad}`)
                  .join(", ")}`}
              >
                <span className="tabular text-[0.72rem] font-medium">{m.total || ""}</span>
                <div
                  className="flex w-full max-w-9 flex-col-reverse items-stretch justify-start gap-[2px]"
                  style={{ height: `${ALTURA_PISTA_REM}rem` }}
                >
                  {m.total === 0 ? (
                    <div className="h-[2px] rounded-full bg-muted" />
                  ) : (
                    orden.map((p, j) => (
                      <div
                        key={p.clave}
                        className={cn(
                          COLOR[p.clave].bg,
                          j === orden.length - 1 && "rounded-t-[4px]",
                          activo !== null && activo !== i && "opacity-45",
                          "transition-opacity duration-150",
                        )}
                        style={{ height: `${(p.cantidad / m.total) * alto}rem`, minHeight: 2 }}
                      />
                    ))
                  )}
                </div>
                <span className="text-[0.7rem] text-muted-foreground">{MESES[m.mes - 1]}</span>

              </div>
            );
          })}
        </div>
      </div>

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Mes</th>
                {presentes.map((c) => (
                  <th key={c} className="py-1 pr-2 text-right font-medium">
                    {etiqueta(c)}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {inicios.meses.map((m) => (
                <tr key={m.mes} className="border-t">
                  <td className="py-1 pr-2 capitalize">{MESES_LARGOS[m.mes - 1]}</td>
                  {presentes.map((c) => (
                    <td key={c} className="py-1 pr-2 text-right">
                      {m.porCanal.find((p) => p.clave === c)?.cantidad ?? 0}
                    </td>
                  ))}
                  <td className="py-1 text-right font-medium">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
