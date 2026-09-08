import {
  Bloque,
  Cargando,
  EsqueletoDeEncabezado,
  EsqueletoDeLista,
} from "@/components/esqueleto";

/**
 * Estado de carga del padrón. Existe para que la navegación a Alumnos no
 * se sienta trabada: Next lo muestra en cuanto empieza la consulta, sin
 * esperar a la base.
 */
export default function CargandoAlumnos() {
  return (
    <Cargando texto="Cargando alumnos…">
      <EsqueletoDeEncabezado />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bloque className="h-9 w-72 rounded-lg" />
        <Bloque className="h-9 w-64 rounded-lg" />
      </div>
      <EsqueletoDeLista filas={8} />
    </Cargando>
  );
}
