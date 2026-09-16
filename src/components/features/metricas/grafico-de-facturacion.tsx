"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { PuntoDeFacturacion } from "@/use-cases/metricas/consultas";
import type { AlumnoQuePago, ComparacionMismoDia } from "@/use-cases/metricas/pagos-del-periodo";
import { pagosDelPeriodoAction } from "@/app/(app)/metricas/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { ETIQUETA_METODO, METODOS_PAGO } from "@/schemas/payment";
import { importe, numero, fechaCompleta } from "@/lib/formato";
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
 *
 * Color = información (ver globals.css): cada barra usa el mismo semáforo
 * verde/ámbar/rojo que el resto del producto, según qué tan alto facturó
 * ese período contra el mejor de los que se están mostrando — no es
 * decoración, es "este período estuvo bien / regular / flojo" de un
 * vistazo.
 *
 * Cada barra es un botón: al apoyarse, el título nativo suma cuántos pagos
 * la componen; al tocarla, un popover trae quién pagó y, si la barra es de
 * un día puntual, cuánto se había facturado ese mismo número de día el mes
 * anterior — bajo demanda, no precargado (`pagosDelPeriodoAction`), porque
 * en la vista "año" cada barra es un mes entero y nadie necesita el
 * detalle de los doce a la vez.
 */
function colorDeBarra(proporcion: number): string {
  if (proporcion >= 2 / 3) return "bg-cubierto";
  if (proporcion >= 1 / 3) return "bg-revisar";
  return "bg-descubierto";
}

interface DetalleCargado {
  pagos: AlumnoQuePago[];
  comparacionMesAnterior: ComparacionMismoDia | null;
}

type EstadoDelDetalle = "cargando" | "error" | DetalleCargado;

export function GraficoDeFacturacion({
  puntos,
  granularidad,
  moneda,
  indiceDeHoy = null,
}: {
  puntos: PuntoDeFacturacion[];
  granularidad: "dia" | "semana" | "mes";
  moneda: string;
  /**
   * Qué barra es "hoy" (el aro de foco). Antes se asumía que siempre era
   * la última — cierto mientras la tendencia terminaba en hoy, falso al
   * navegar a un mes que no es el actual (ahí puede no haber ninguna, o
   * puede no ser la última porque el mes todavía no terminó).
   */
  indiceDeHoy?: number | null;
}) {
  const quieto = useReducedMotion();
  const maximo = Math.max(1, ...puntos.map((p) => p.total));
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, EstadoDelDetalle>>({});

  async function abrir(punto: PuntoDeFacturacion) {
    setAbierto(punto.periodo);
    if (detalle[punto.periodo]) return; // ya cacheado, no se vuelve a pedir
    setDetalle((d) => ({ ...d, [punto.periodo]: "cargando" }));
    const resultado = await pagosDelPeriodoAction({ periodo: punto.periodo, granularidad });
    setDetalle((d) => ({
      ...d,
      [punto.periodo]: resultado.ok
        ? { pagos: resultado.pagos, comparacionMesAnterior: resultado.comparacionMesAnterior }
        : "error",
    }));
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div
        className="flex items-end gap-3 sm:gap-5"
        style={{ minWidth: `${Math.max(puntos.length * 2.75, 16)}rem` }}
      >
        {puntos.map((punto, i) => {
          const proporcion = punto.total / maximo;
          const sinPagos = punto.cantidad === 0;

          return (
            <div key={punto.periodo} className="flex flex-1 flex-col items-center gap-2">
              <span className="tabular text-[0.7rem] whitespace-nowrap text-muted-foreground">
                {punto.total > 0 ? numero(punto.total) : "—"}
              </span>

              <Popover
                open={abierto === punto.periodo}
                onOpenChange={(open) => {
                  if (open) void abrir(punto);
                  else setAbierto(null);
                }}
              >
                <PopoverTrigger
                  disabled={sinPagos}
                  title={
                    sinPagos
                      ? `${punto.etiqueta}: sin pagos`
                      : `${punto.etiqueta}: ${importe(punto.total, moneda)} · ${punto.cantidad} ${punto.cantidad === 1 ? "pago" : "pagos"}`
                  }
                  className="flex h-28 w-full items-end rounded-t-[3px] p-0 disabled:cursor-default sm:h-36"
                >
                  <motion.div
                    initial={quieto ? { scaleY: proporcion } : { scaleY: 0 }}
                    animate={{ scaleY: Math.max(proporcion, punto.total > 0 ? 0.03 : 0) }}
                    transition={{
                      duration: DURACION.pausado,
                      ease: SALIDA,
                      delay: quieto ? 0 : i * 0.04,
                    }}
                    className={cn(
                      "h-full w-full origin-bottom rounded-t-[3px] transition-opacity",
                      colorDeBarra(proporcion),
                      !sinPagos && "hover:opacity-80",
                      i === indiceDeHoy && "ring-2 ring-foreground/30 ring-offset-1",
                    )}
                  />
                </PopoverTrigger>

                <PopoverContent align="center" className="w-72">
                  <DetalleDelPeriodo
                    etiqueta={punto.etiqueta}
                    total={punto.total}
                    cantidad={punto.cantidad}
                    moneda={moneda}
                    estado={detalle[punto.periodo]}
                  />
                </PopoverContent>
              </Popover>

              <span
                className={cn(
                  "text-[0.7rem] whitespace-nowrap capitalize",
                  i === indiceDeHoy ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {punto.etiqueta}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetalleDelPeriodo({
  etiqueta,
  total,
  cantidad,
  moneda,
  estado,
}: {
  etiqueta: string;
  total: number;
  cantidad: number;
  moneda: string;
  estado: EstadoDelDetalle | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground capitalize">
        {etiqueta} · {cantidad} {cantidad === 1 ? "pago" : "pagos"}
      </p>

      {estado === "cargando" || estado === undefined ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          Buscando quién pagó…
        </div>
      ) : estado === "error" ? (
        <p className="py-2 text-xs text-descubierto">No se pudo traer el detalle.</p>
      ) : (
        <>
          <ul className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto">
            {estado.pagos.map((p) => (
              <li
                key={p.studentId}
                className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
              >
                <span className="min-w-0 truncate">
                  {p.nombre} {p.apellido}
                </span>
                <span className="tabular shrink-0 font-mono text-muted-foreground">
                  {importe(p.monto, moneda)}
                  <span className="ml-1 text-[0.7rem]">
                    (
                    {(METODOS_PAGO as readonly string[]).includes(p.metodo)
                      ? ETIQUETA_METODO[p.metodo as (typeof METODOS_PAGO)[number]]
                      : p.metodo}
                    )
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {estado.comparacionMesAnterior ? (
            <ComparacionDelDia
              comparacion={estado.comparacionMesAnterior}
              totalDeHoy={total}
              moneda={moneda}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * "El mismo día, el mes pasado" — no el mes anterior completo (eso ya lo
 * muestra `ComparacionMensual`), sino el punto exacto que permite decir
 * "hoy vamos mejor o peor que a esta altura el mes pasado".
 */
function ComparacionDelDia({
  comparacion,
  totalDeHoy,
  moneda,
}: {
  comparacion: ComparacionMismoDia;
  totalDeHoy: number;
  moneda: string;
}) {
  const diferencia = totalDeHoy - comparacion.total;
  const colorDiferencia =
    diferencia > 0 ? "text-cubierto" : diferencia < 0 ? "text-descubierto" : "text-muted-foreground";

  return (
    <div className="mt-2.5 border-t border-border pt-2.5">
      <p className="text-[0.7rem] text-muted-foreground">
        Mismo día, {fechaCompleta(comparacion.fecha)}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="tabular font-mono">
          {importe(comparacion.total, moneda)}
          <span className="ml-1 text-[0.7rem] text-muted-foreground">
            ({comparacion.cantidad} {comparacion.cantidad === 1 ? "pago" : "pagos"})
          </span>
        </span>
        {comparacion.total > 0 || totalDeHoy > 0 ? (
          <span className={cn("tabular font-mono text-[0.75rem]", colorDiferencia)}>
            {diferencia > 0 ? "+" : ""}
            {importe(diferencia, moneda)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
