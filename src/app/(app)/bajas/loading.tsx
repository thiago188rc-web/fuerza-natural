import { Bloque, Cargando, EsqueletoDeLista } from "@/components/esqueleto";

export default function CargandoBajas() {
  return (
    <Cargando texto="Cargando las bajas…">
      <div className="space-y-2">
        <Bloque className="h-3 w-24" />
        <Bloque className="h-7 w-32" />
        <Bloque className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start">
        <EsqueletoDeLista filas={7} />
        <div className="space-y-5">
          <Bloque className="h-28 w-full rounded-xl" />
          <Bloque className="h-56 w-full rounded-xl" />
        </div>
      </div>
    </Cargando>
  );
}
