import type { SegmentoImporte } from "@/domain/metricas/facturacion";
import { importe } from "@/lib/formato";

const TAMANO = 104;
const GROSOR = 14;
const RADIO = (TAMANO - GROSOR) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Tonos monocromos (mismo `foreground`, distinta opacidad) — no se inventa
 *  una paleta de colores nueva para categorías que no tienen un significado
 *  semántico fijo (a diferencia de "cubierto"/"revisar", que sí lo tienen). */
const OPACIDADES = [1, 0.6, 0.35, 0.18, 0.1];

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
    Array<SegmentoImporte & { offset: number; largo: number; opacidad: number }>
  >((acc, s, i) => {
    const anterior = acc.at(-1);
    const offset = anterior ? anterior.offset + anterior.largo : 0;
    const largo = (s.porcentaje / 100) * CIRCUNFERENCIA;
    acc.push({ ...s, offset, largo, opacidad: OPACIDADES[i % OPACIDADES.length] });
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
              className="stroke-foreground transition-[stroke-dasharray] duration-500"
              style={{ opacity: a.opacidad }}
            />
          ))}
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {arcos.map((a) => (
            <li key={a.clave} className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[2px] bg-foreground"
                  style={{ opacity: a.opacidad }}
                />
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
