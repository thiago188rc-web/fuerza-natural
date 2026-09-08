import { Bloque, Cargando, EsqueletoDeEncabezado } from "@/components/esqueleto";

export default function CargandoConfiguracion() {
  return (
    <Cargando texto="Cargando la configuración…">
      <div className="mx-auto max-w-4xl space-y-6">
        <EsqueletoDeEncabezado conAccion={false} />
        <div className="superficie divide-y divide-border">
          <div className="space-y-2 px-5 py-4">
            <Bloque className="h-4 w-24" />
            <Bloque className="h-3.5 w-full max-w-xl" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 space-y-2">
                <Bloque className="h-3.5 w-24" />
                <Bloque className="h-3 w-48 max-w-full" />
              </div>
              <Bloque className="h-9 w-36 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
        <Bloque className="h-72 w-full rounded-xl" />
      </div>
    </Cargando>
  );
}
