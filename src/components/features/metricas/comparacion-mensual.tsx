import type { SerieMensual } from "@/use-cases/metricas/consultas";
import { importe } from "@/lib/formato";
import { cn } from "@/lib/utils";

const ANCHO = 300;
const ALTO = 90;
const MARGEN_Y = 6;

function puntosSvg(serie: readonly number[], maxDias: number, maxValor: number): string {
  return serie
    .map((v, i) => {
      const x = maxDias <= 1 ? 0 : (i / (maxDias - 1)) * ANCHO;
      const y = ALTO - MARGEN_Y - (v / maxValor) * (ALTO - MARGEN_Y * 2);
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
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-muted-foreground/60"
        />
        <polyline
          points={puntosSvg(mesActual.acumulado, maxDias, maxValor)}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-verde"
        />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-verde" />
          {mesActual.etiqueta}: {importe(totalActualAHoy, moneda)}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-muted-foreground/60" />
          {mesAnterior.etiqueta}: {importe(totalAnteriorAlMismoDia, moneda)}
        </span>
      </div>
    </div>
  );
}
