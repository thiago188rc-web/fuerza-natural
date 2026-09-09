"use client";

import { useRouter } from "next/navigation";
import { Segmentado } from "@/components/segmentado";
import { VISTAS_METRICAS, type VistaMetricas } from "@/domain/metricas/vista";

const ETIQUETAS: Record<VistaMetricas, string> = {
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};

/**
 * La vista vive en la URL (`?vista=`), no en estado de React — mismo
 * criterio que el mes de `/pagos`: se puede compartir el enlace, volver
 * atrás con el navegador y recargar sin perder dónde estabas.
 */
export function SelectorDeVista({ vista }: { vista: VistaMetricas }) {
  const router = useRouter();

  return (
    <Segmentado
      nombre="vista"
      valor={vista}
      onCambio={(v) => router.push(`?vista=${v}`, { scroll: false })}
      opciones={VISTAS_METRICAS.map((v) => ({ valor: v, etiqueta: ETIQUETAS[v] }))}
      className="w-fit"
    />
  );
}
