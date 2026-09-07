import { Card, CardContent } from "@/components/ui/card";

/** Mismo motivo que en `[id]/loading.tsx`: un formulario no es una tabla. */
export default function CargandoFormulario() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el formulario…</span>
      <div className="flex flex-col gap-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
      <Card>
        <CardContent className="grid gap-5 py-6 sm:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
          <div className="h-20 animate-pulse rounded-md bg-muted sm:col-span-2" />
        </CardContent>
      </Card>
    </div>
  );
}
