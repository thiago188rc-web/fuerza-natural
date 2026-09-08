import { Bloque, Cargando, EsqueletoDeEncabezado } from "@/components/esqueleto";

export default function CargandoActividad() {
  return (
    <Cargando texto="Cargando la actividad…">
      <div className="mx-auto max-w-4xl space-y-6">
        <EsqueletoDeEncabezado conAccion={false} />
        {Array.from({ length: 3 }).map((_, bloque) => (
          <div key={bloque} className="superficie overflow-hidden">
            <div className="hundido border-b border-border px-5 py-2.5">
              <Bloque className="h-3.5 w-40" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <Bloque className="h-3 w-10 shrink-0" />
                  <Bloque className="h-3.5 w-72 max-w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Cargando>
  );
}
