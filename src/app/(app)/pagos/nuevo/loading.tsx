import { Bloque, Cargando, EsqueletoDeLista } from "@/components/esqueleto";

export default function CargandoCobro() {
  return (
    <Cargando texto="Preparando el cobro…">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <Bloque className="h-7 w-52" />
          <Bloque className="h-4 w-80 max-w-full" />
        </div>
        <Bloque className="h-14 w-full rounded-xl" />
        <EsqueletoDeLista filas={7} />
      </div>
    </Cargando>
  );
}
