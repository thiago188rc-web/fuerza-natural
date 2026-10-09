import type { SerieMensual } from "@/use-cases/metricas/consultas";
import { importe } from "@/lib/formato";
import { cn } from "@/lib/utils";

const ANCHO = 300;
const ALTO = 90;
const MARGEN_Y = 6;

function puntoSvg(
  valor: number,
  indice: number,
  maxDias: number,
  maxValor: number,
): { x: number; y: number } {
  const x = maxDias <= 1 ? 0 : (indice / (maxDias - 1)) * ANCHO;
  const y = ALTO - MARGEN_Y - (valor / maxValor) * (ALTO - MARGEN_Y * 2);
  return { x, y };
}

function puntosSvg(serie: readonly number[], maxDias: number, maxValor: number): string {
  return serie
    .map((v, i) => {
      const { x, y } = puntoSvg(v, i, maxDias, maxValor);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Cuánto llevamos cobrado, día a día, contra el mismo tramo del mes
 * anterior — no el total del mes, la CURVA: sirve para ver si vamos más
 * atrasados o adelantados, no solo cuánto entró hasta ahora. SVG a mano,
 * mismo criterio que `Rueda`: sin librería de gráficos.
 *
 * Las dos series se ubican en el mismo eje por DÍA DEL MES, no por fecha
 * absoluta — es lo que hace comparable un 15 de septiembre con un 15 de
 * agosto. Un mes de menos días simplemente termina antes.
 */
export function ComparacionMensual({
  mesActual,
  mesAnterior,
  moneda,
  indiceDeHoy,
}: {
  mesActual: SerieMensual;
  mesAnterior: SerieMensual;
  moneda: string;
  /** Día de "hoy" dentro de `mesActual.acumulado`, si el mes que se ve es el actual. */
  indiceDeHoy: number | null;
}) {
  const maxDias = Math.max(mesActual.acumulado.length, mesAnterior.acumulado.length);
  const maxValor = Math.max(1, ...mesActual.acumulado, ...mesAnterior.acumulado);

  const indiceComparacion = indiceDeHoy ?? mesActual.acumulado.length - 1;
  const totalActualAHoy = mesActual.acumulado.at(indiceDeHoy ?? -1) ?? 0;
  const totalAnteriorAlMismoDia = mesAnterior.acumulado[indiceComparacion] ?? mesAnterior.acumulado.at(-1) ?? 0;
  const diferencia = totalActualAHoy - totalAnteriorAlMismoDia;

  // Un punto marcado en cada curva, a la misma altura del mes: no uno por
  // día (con 30 puntos la curva se ensucia), sino justo los dos números
  // que se están comparando — es la pregunta que responde este gráfico.
  const indiceFinActual = indiceDeHoy ?? mesActual.acumulado.length - 1;
  const puntoActual = puntoSvg(totalActualAHoy, indiceFinActual, maxDias, maxValor);
  const puntoAnterior = puntoSvg(totalAnteriorAlMismoDia, indiceComparacion, maxDias, maxValor);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="t-rotulo">
          {mesActual.etiqueta} vs. {mesAnterior.etiqueta}
        </p>
        {indiceDeHoy !== null && totalAnteriorAlMismoDia > 0 ? (
          <p
            className={cn(
              "tabular text-xs font-medium",
              diferencia >= 0 ? "text-cubierto" : "text-descubierto",
            )}
          >
            {diferencia >= 0 ? "+" : "−"}
            {importe(Math.abs(diferencia), moneda)} a esta altura del mes
          </p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="mt-3 h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Facturación acumulada: ${mesActual.etiqueta} ${importe(totalActualAHoy, moneda)}, ${mesAnterior.etiqueta} ${importe(totalAnteriorAlMismoDia, moneda)} a la misma altura`}
      >
        <polyline
          points={puntosSvg(mesAnterior.acumulado, maxDias, maxValor)}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-serie-1"
        />
        <polyline
          points={puntosSvg(mesActual.acumulado, maxDias, maxValor)}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-verde"
        />

        {/* Halo del color de la tarjeta debajo de cada punto, mismo truco
            que `BarraConTendencia`: sin él, el punto se pierde donde la
            curva cruza a la otra. */}
        <circle cx={puntoAnterior.x} cy={puntoAnterior.y} r={4} className="fill-card" />
        <circle cx={puntoAnterior.x} cy={puntoAnterior.y} r={2.75} className="fill-serie-1" />
        <circle cx={puntoActual.x} cy={puntoActual.y} r={4} className="fill-card" />
        <circle cx={puntoActual.x} cy={puntoActual.y} r={2.75} className="fill-verde" />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-verde" />
          {mesActual.etiqueta}: {importe(totalActualAHoy, moneda)}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-serie-1" />
          {mesAnterior.etiqueta}: {importe(totalAnteriorAlMismoDia, moneda)}
        </span>
      </div>
    </div>
  );
}
