import { Card, CardContent } from "@/components/ui/card";

/**
 * Estado de carga del listado. Existe para que la navegación a Alumnos no
 * se sienta trabada: Next lo muestra en cuanto empieza la consulta, sin
 * esperar a la base.
 */
export default function CargandoAlumnos() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando alumnos…</span>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
      <Card className="p-0">
        <CardContent className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-md bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
