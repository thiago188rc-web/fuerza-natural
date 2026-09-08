import { cn } from "@/lib/utils";

/**
 * Las piezas de los estados de carga.
 *
 * Un esqueleto tiene que tener la FORMA de lo que viene, no ser un
 * rectángulo genérico: si el bloque que aparece después ocupa otro lugar,
 * la página salta y la espera se siente peor que con una pantalla en
 * blanco. Por eso cada `loading.tsx` arma su propia composición con estas
 * piezas en lugar de reusar un esqueleto único.
 *
 * `animate-pulse` y no un barrido con gradiente: el pulso es una sola
 * animación de opacidad que la GPU compone sin repintar nada.
 */
export function Bloque({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** El encabezado de página: eyebrow, título y acción. */
export function EsqueletoDeEncabezado({ conAccion = true }: { conAccion?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Bloque className="h-3 w-40" />
        <Bloque className="h-7 w-52" />
      </div>
      {conAccion ? <Bloque className="h-9 w-36 rounded-lg" /> : null}
    </div>
  );
}

/** Una lista de filas dentro de una superficie. */
export function EsqueletoDeLista({
  filas = 6,
  className,
}: {
  filas?: number;
  className?: string;
}) {
  return (
    <div className={cn("superficie divide-y divide-border", className)}>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Bloque className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bloque className="h-3.5 w-40 max-w-full" />
            <Bloque className="h-3 w-28 max-w-full" />
          </div>
          <Bloque className="hidden h-1.5 w-48 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * El envoltorio accesible. `aria-busy` + un texto solo para lectores
 * anuncia la espera; sin eso, quien usa un lector de pantalla escucha
 * silencio y no sabe si la aplicación se colgó.
 */
export function Cargando({
  texto,
  children,
}: {
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">{texto}</span>
      {children}
    </div>
  );
}
