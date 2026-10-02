import type { SegmentoDistribucion } from "@/domain/metricas/demografia";
import { BarraProgreso } from "@/components/motion/primitivas";

/** Un solo color para todas las franjas: cada barra ya tiene su nombre
 *  escrito, y el largo es lo que se compara. El semáforo verde/ámbar/rojo
 *  queda para los estados de pago — una franja de edad en rojo se leía
 *  como una alarma. "Sin dato" va aparte, en gris: no es una categoría
 *  real, es la ausencia de una. */
const COLOR = "bg-verde";

/**
 * Una distribución (edad, género) como lista de barras horizontales
 * proporcionales — el mismo lenguaje que el resto del producto (bandas,
 * réglas), no una torta ni una librería de gráficos. "Sin dato" se
 * muestra igual que cualquier otro segmento, nunca se esconde.
 */
export function Distribucion({
  titulo,
  segmentos,
}: {
  titulo: string;
  segmentos: SegmentoDistribucion[];
}) {
  if (segmentos.length === 0) {
    return (
      <div>
        <p className="t-rotulo">{titulo}</p>
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay alumnos activos.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="t-rotulo">{titulo}</p>
      <ul className="mt-3 space-y-3">
        {segmentos.map((s, i) => {
          const colorClassName = s.clave === "SIN_DATO" ? "bg-muted-foreground/30" : COLOR;
          return (
            <li key={s.clave}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className={s.clave === "SIN_DATO" ? "text-muted-foreground" : "font-medium"}>
                  {s.etiqueta}
                </span>
                <span className="tabular text-xs text-muted-foreground">
                  {s.porcentaje}% · {s.cantidad}
                </span>
              </div>
              <BarraProgreso
                porcentaje={s.porcentaje}
                colorClassName={colorClassName}
                retraso={i * 0.04}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
