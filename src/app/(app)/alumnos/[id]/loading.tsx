import { Card, CardContent } from "@/components/ui/card";

/**
 * Sin este archivo, la ficha heredaba el `loading.tsx` del listado y
 * mostraba durante un instante un esqueleto con forma de tabla — que no se
 * parece en nada a lo que va a aparecer. Un esqueleto que miente sobre la
 * forma del contenido es peor que no tener ninguno.
 */
export default function CargandoFicha() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la ficha del alumno…</span>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-6 w-56 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3 py-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
