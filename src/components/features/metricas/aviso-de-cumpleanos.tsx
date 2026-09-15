import type { AlumnoConCumpleanos } from "@/domain/alumnos/cumpleanos";
import { etiquetaDeMes } from "@/domain/fechas/calendario";
import { cn } from "@/lib/utils";

/**
 * Cumpleaños de ESTE mes calendario, sin importar la vista de Métricas
 * elegida (semana/mes/año) — "este mes" siempre significa el mes en curso
 * según el reloj del gimnasio, no el rango que se esté mirando.
 */
export function AvisoDeCumpleanos({
  alumnos,
  hoy,
}: {
  alumnos: AlumnoConCumpleanos[];
  hoy: string;
}) {
  const etiquetaMes = etiquetaDeMes(hoy, { conAnio: false });

  return (
    <div>
      <p className="t-rotulo">Cumpleaños · {etiquetaMes}</p>
      {alumnos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nadie cumple años este mes (con la fecha de nacimiento cargada).
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {alumnos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className={cn(a.esHoy && "font-semibold")}>
                {a.nombre} {a.apellido}
              </span>
              <span
                className={cn(
                  "tabular text-xs",
                  a.esHoy ? "font-medium text-verde" : "text-muted-foreground",
                )}
              >
                {a.esHoy ? "¡Hoy!" : `día ${a.dia}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
