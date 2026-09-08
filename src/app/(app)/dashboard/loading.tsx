import { Bloque, Cargando, EsqueletoDeLista } from "@/components/esqueleto";

/**
 * El esqueleto del panel copia su composición real: primero el instrumento
 * del mes (un bloque ancho y bajo), después la bandeja y la columna de
 * contexto. Así el contenido aterriza donde ya estaba el hueco, sin saltos.
 */
export default function CargandoPanel() {
  return (
    <Cargando texto="Armando el panel…">
      <div className="space-y-2">
        <Bloque className="h-3 w-48" />
        <Bloque className="h-7 w-72 max-w-full" />
      </div>

      <div className="superficie space-y-6 px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Bloque className="h-3 w-28" />
            <Bloque className="h-8 w-56" />
          </div>
          <Bloque className="h-10 w-24" />
        </div>
        <Bloque className="h-3.5 w-full rounded-full" />
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Bloque className="h-3 w-24" />
              <Bloque className="h-7 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start">
        <EsqueletoDeLista filas={6} />
        <div className="space-y-5">
          <Bloque className="h-28 w-full rounded-xl" />
          <Bloque className="h-44 w-full rounded-xl" />
          <Bloque className="h-72 w-full rounded-xl" />
        </div>
      </div>
    </Cargando>
  );
}
