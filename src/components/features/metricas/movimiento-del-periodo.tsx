import { NumeroAnimado } from "@/components/motion/primitivas";

const LINEAS = [
  { clave: "nuevos", etiqueta: "Alumnos nuevos", signo: "+" },
  { clave: "volvieron", etiqueta: "Volvieron", signo: "+" },
  { clave: "pausaron", etiqueta: "Pausaron", signo: "" },
  { clave: "dejaron", etiqueta: "Dejaron", signo: "−" },
] as const;

/**
 * "Cuánto se hizo de clientes nuevos, cuánto de gente que volvió" — el
 * mismo `contarMovimientoDelPadron` que ya usa el Panel (`student_events`
 * reales, ALTA vs REACTIVACION), no una cuenta aparte.
 */
export function MovimientoDelPeriodo({
  movimiento,
  etiquetaDelRango,
}: {
  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };
  etiquetaDelRango: string;
}) {
  return (
    <div>
      <p className="t-rotulo">Movimiento · {etiquetaDelRango.toLowerCase()}</p>
      <dl className="mt-3 space-y-2">
        {LINEAS.map((linea) => {
          const valor = movimiento[linea.clave];
          return (
            <div key={linea.clave} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="tabular font-mono">
                {valor === 0 ? (
                  <span className="text-muted-foreground/50">0</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">{linea.signo}</span>
                    <NumeroAnimado valor={valor} />
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
