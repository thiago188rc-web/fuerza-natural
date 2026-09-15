import type { SegmentoEdadGenero } from "@/domain/metricas/demografia";
import { cn } from "@/lib/utils";

/** Color FIJO por género (no cíclico por posición): así "Femenino" es
 *  siempre el mismo color en todos los rangos etarios, no cambia según
 *  qué género aparezca primero en cada bucket. */
const COLOR_POR_GENERO: Record<string, string> = {
  FEMENINO: "bg-cubierto",
  MASCULINO: "bg-revisar",
  SIN_DATO: "bg-muted-foreground/30",
};

/**
 * Género DENTRO de cada rango etario — una barra apilada por edad, no dos
 * listas separadas. Mismo lenguaje de barras que `Distribucion`, pero cada
 * fila es un rango de edad y el color adentro es el género.
 */
export function DistribucionEdadGenero({
  titulo,
  segmentos,
}: {
  titulo: string;
  segmentos: SegmentoEdadGenero[];
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
      <ul className="mt-3 space-y-3.5">
        {segmentos.map((s) => (
          <li key={s.bucket}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{s.etiqueta}</span>
              <span className="tabular text-xs text-muted-foreground">{s.total}</span>
            </div>
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${s.etiqueta}: ${s.porGenero.map((g) => `${g.etiqueta} ${g.porcentaje}%`).join(", ")}`}
            >
              {s.porGenero.map((g) => (
                <div
                  key={g.clave}
                  className={cn("h-full", COLOR_POR_GENERO[g.clave] ?? "bg-muted-foreground/30")}
                  style={{ width: `${g.porcentaje}%` }}
                />
              ))}
            </div>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {s.porGenero.map((g) => `${g.etiqueta} ${g.porcentaje}%`).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
