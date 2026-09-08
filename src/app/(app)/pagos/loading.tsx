import { Bloque, Cargando, EsqueletoDeEncabezado } from "@/components/esqueleto";

export default function CargandoPagos() {
  return (
    <Cargando texto="Cargando los pagos…">
      <EsqueletoDeEncabezado />

      <div className="superficie flex flex-wrap items-end gap-8 px-5 py-4">
        <div className="space-y-2">
          <Bloque className="h-3 w-24" />
          <Bloque className="h-7 w-36" />
        </div>
        <div className="space-y-2">
          <Bloque className="h-3 w-28" />
          <Bloque className="h-7 w-12" />
        </div>
      </div>

      <div className="superficie divide-y divide-border">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Bloque className="h-3 w-12 shrink-0" />
            <Bloque className="h-3.5 w-44 max-w-full" />
            <Bloque className="ml-auto h-3.5 w-20" />
          </div>
        ))}
      </div>
    </Cargando>
  );
}
