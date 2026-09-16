import type { PuntoDeHistorial } from "@/use-cases/metricas/consultas";
import { cn } from "@/lib/utils";

const ANCHO_POR_PUNTO = 58;
const ALTO = 132;
const ALTO_BARRAS = 78;
const TOPE_BARRAS_Y = 34;
const BASE_BARRAS_Y = TOPE_BARRAS_Y + ALTO_BARRAS;
const ANCHO_BARRA = 26;

/**
 * BARRAS + LÍNEA DE TENDENCIA — el mismo tipo de lectura que ya usaba el
 * dueño en su Excel (una curva suave encima de las barras, para ver la
 * tendencia sin perder el número exacto de cada mes), redibujado con la
 * paleta del producto en vez del amarillo/verde vivo de la planilla — la
 * misma decisión ya tomada para el semáforo de cobertura
 * (docs/DECISIONES.md, 2026-09-08).
 *
 * Todo en un solo SVG a mano (sin librería de gráficos, mismo criterio que
 * `GraficoDeFacturacion`/`ComparacionMensual`): así el número de cada barra
 * y el punto de la curva quedan exactamente alineados, sin sincronizar dos
 * sistemas de coordenadas distintos.
 *
 * Los meses sin dato real (antes de que el sistema tuviera historia) se
 * dibujan aparte — una barra punteada y "s/d" en vez de un 0 que
 * parecería un mes flojo cuando en realidad es un mes que nadie cargó.
 */
export function BarraConTendencia({
  puntos,
  formatearValor,
  colorBarra = "fill-verde",
  colorLinea = "stroke-revisar",
  colorPunto = "fill-revisar",
}: {
  puntos: PuntoDeHistorial[];
  formatearValor: (valor: number) => string;
  /** Clase Tailwind `fill-*` de la barra — literal, nunca armada en runtime (Tailwind no detecta clases dinámicas). */
  colorBarra?: string;
  /** Clase Tailwind `stroke-*` de la curva. */
  colorLinea?: string;
  /** Clase Tailwind `fill-*` de los puntos sobre la curva — mismo color que `colorLinea`, pasado aparte porque Tailwind no permite derivarla con un `.replace()`. */
  colorPunto?: string;
}) {
  const ancho = puntos.length * ANCHO_POR_PUNTO;
  const maximo = Math.max(1, ...puntos.map((p) => p.valor));

  const puntosConDato = puntos.filter((p) => p.real);
  const yDe = (valor: number) => BASE_BARRAS_Y - (valor / maximo) * ALTO_BARRAS;
  const xDe = (i: number) => i * ANCHO_POR_PUNTO + ANCHO_POR_PUNTO / 2;

  const lineaPuntos = puntos
    .map((p, i) => (p.real ? `${xDe(i).toFixed(1)},${yDe(p.valor).toFixed(1)}` : null))
    .filter((v): v is string => v !== null)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${ancho} ${ALTO}`}
      className="w-full"
      style={{ minWidth: `${Math.max(ancho, 320)}px` }}
      role="img"
      aria-label={puntos
        .map((p) => `${p.etiqueta}: ${p.real ? formatearValor(p.valor) : "sin dato"}`)
        .join(", ")}
    >
      {puntos.map((punto, i) => {
        const x = xDe(i) - ANCHO_BARRA / 2;
        const alturaBarra = punto.real ? (punto.valor / maximo) * ALTO_BARRAS : 4;
        const yBarra = BASE_BARRAS_Y - Math.max(alturaBarra, punto.valor > 0 ? 3 : 0);

        return (
          <g key={punto.mes}>
            <rect
              x={x}
              y={punto.real ? yBarra : BASE_BARRAS_Y - 4}
              width={ANCHO_BARRA}
              height={punto.real ? Math.max(alturaBarra, punto.valor > 0 ? 3 : 0.5) : 4}
              rx={2}
              className={cn(punto.real ? colorBarra : "fill-muted-foreground/25")}
            />
            <text
              x={xDe(i)}
              y={(punto.real ? yBarra : BASE_BARRAS_Y - 4) - 6}
              textAnchor="middle"
              className={cn(
                "tabular font-mono text-[9px]",
                punto.real ? "fill-foreground" : "fill-muted-foreground/60",
              )}
            >
              {punto.real ? formatearValor(punto.valor) : "s/d"}
            </text>
            <text
              x={xDe(i)}
              y={BASE_BARRAS_Y + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] capitalize"
            >
              {punto.etiqueta}
            </text>
          </g>
        );
      })}

      {puntosConDato.length >= 2 ? (
        <polyline
          points={lineaPuntos}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={colorLinea}
        />
      ) : null}
      {puntosConDato.map((p) => (
        <circle
          key={p.mes}
          cx={xDe(puntos.indexOf(p))}
          cy={yDe(p.valor)}
          r={2.5}
          className={colorPunto}
        />
      ))}
    </svg>
  );
}
