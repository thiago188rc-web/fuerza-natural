import { Bloque, Cargando } from "@/components/esqueleto";

export default function CargandoImportar() {
  return (
    <Cargando texto="Preparando la importación…">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <Bloque className="h-3 w-24" />
          <Bloque className="h-7 w-64" />
          <Bloque className="h-4 w-full max-w-2xl" />
        </div>
        <Bloque className="h-8 w-72 rounded-lg" />
        <Bloque className="h-80 w-full rounded-xl" />
      </div>
    </Cargando>
  );
}
