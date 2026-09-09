import type { SegmentoImporte } from "@/domain/metricas/facturacion";
import { importe } from "@/lib/formato";
import { cn } from "@/lib/utils";

const TAMANO = 104;
const GROSOR = 14;
const RADIO = (TAMANO - GROSOR) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Mismo semáforo verde/ámbar/rojo del resto del producto (globals.css),
 *  no colores inventados — se cicla en el orden fijo de cada categoría
 *  (`METODOS_PAGO`/`MODALIDADES_PAGO`), así que un método de pago siempre
 *  cae en el mismo color entre una carga y la siguiente. */
const PALETA = [
  { stroke: "stroke-cubierto", bg: "bg-cubierto" },
  { stroke: "stroke-revisar", bg: "bg-revisar" },
  { stroke: "stroke-descubierto", bg: "bg-descubierto" },
];

/**
 * Una "ruedita": distribución de un total en dinero como anillo
 * proporcional, con su leyenda al lado. Mismo lenguaje que `Distribucion`
 * (barras horizontales) pero para cuando la forma circular ayuda a leer
 * "esto es una porción de un todo" — método de pago, modalidad.
 */
export function Rueda({
  titulo,
  segmentos,
  moneda,
}: {
  titulo: string;
  segmentos: SegmentoImporte[];
  moneda: string;
}) {
  if (segmentos.length === 0) {
    return (
      <div>
        <p className="t-rotulo">{titulo}</p>
        <p className="mt-3 text-sm text-muted-foreground">Sin pagos en este período.</p>
      </div>
    );
  }

  const arcos = segmentos.reduce<
    Array<SegmentoImporte & { offset: number; largo: number; color: (typeof PALETA)[number] }>
  >((acc, s, i) => {
    const anterior = acc.at(-1);
    const offset = anterior ? anterior.offset + anterior.largo : 0;
    const largo = (s.porcentaje / 100) * CIRCUNFERENCIA;
    acc.push({ ...s, offset, largo, color: PALETA[i % PALETA.length] });
    return acc;
  }, []);

  return (
    <div>
      <p className="t-rotulo">{titulo}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-4">
        <svg
          width={TAMANO}
          height={TAMANO}
          viewBox={`0 0 ${TAMANO} ${TAMANO}`}
          className="-rotate-90 shrink-0"
          role="img"
          aria-label={`${titulo}: ${segmentos.map((s) => `${s.etiqueta} ${s.porcentaje}%`).join(", ")}`}
        >
          <circle
            cx={TAMANO / 2}
            cy={TAMANO / 2}
            r={RADIO}
            fill="none"
            strokeWidth={GROSOR}
            className="stroke-muted"
          />
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
              className={cn(a.color.stroke, "transition-[stroke-dasharray] duration-500")}
            />
          ))}
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {arcos.map((a) => (
            <li key={a.clave} className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[2px]", a.color.bg)} />
                <span className="truncate">{a.etiqueta}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {a.porcentaje}% · {importe(a.total, moneda)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
