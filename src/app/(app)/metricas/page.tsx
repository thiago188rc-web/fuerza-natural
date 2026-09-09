import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { metricasQuery } from "@/use-cases/metricas/consultas";
import { esVistaMetricas } from "@/domain/metricas/vista";
import { GraficoDeFacturacion } from "@/components/features/metricas/grafico-de-facturacion";
import { Distribucion } from "@/components/features/metricas/distribucion";
import { Rueda } from "@/components/features/metricas/rueda";
import { MovimientoDelPeriodo } from "@/components/features/metricas/movimiento-del-periodo";
import { SelectorDeVista } from "@/components/features/metricas/selector-de-vista";
import { Aparece, NumeroAnimado } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Importe } from "@/components/importe";

export const metadata: Metadata = { title: "Métricas" };

/**
 * MÉTRICAS DEL NEGOCIO. La vista (semana/mes/año) vive en la URL y decide
 * dos cosas a la vez: el rango del resumen y la granularidad del gráfico
 * de tendencia — ver `src/use-cases/metricas/consultas.ts`.
 *
 * Nada de porcentajes inventados ni comparaciones contra un período
 * anterior que el sistema no calcula: cada bloque muestra lo que se puede
 * afirmar con los datos que hay.
 */
export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const { vista: vistaCruda } = await searchParams;
  const vista = esVistaMetricas(vistaCruda) ? vistaCruda : "mes";

  const resultado = await metricasQuery(vista);

  if (!resultado.ok) {
    if (resultado.kind === "FORBIDDEN") redirect("/login");
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar las métricas</AlertTitle>
        <AlertDescription>
          Hubo un problema al leer los datos del gimnasio. Volvé a intentar en un momento.
        </AlertDescription>
      </Alert>
    );
  }

  const m = resultado.data;

  return (
    <div className="space-y-6">
      <Aparece>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo">Negocio</p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Métricas</h1>
          </div>
          <SelectorDeVista vista={vista} />
        </header>
      </Aparece>

      <Aparece retraso={0.04}>
        <section className="superficie p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="t-rotulo">Facturado · {m.etiquetaDelRango.toLowerCase()}</p>
              <p className="t-cifra mt-2 text-[1.75rem]">
                <Importe
                  valor={m.facturacion.totalDelPeriodo}
                  moneda={m.moneda}
                  simboloClassName="text-lg"
                />
              </p>
            </div>
            <div>
              <p className="t-rotulo">Pagos</p>
              <p className="t-cifra mt-2 text-[1.75rem]">
                <NumeroAnimado valor={m.facturacion.cantidadDePagos} />
              </p>
            </div>
            <div>
              <p className="t-rotulo">Ticket promedio</p>
              <p className="t-cifra mt-2 text-[1.75rem]">
                <Importe
                  valor={m.facturacion.ticketPromedio}
                  moneda={m.moneda}
                  simboloClassName="text-lg"
                />
              </p>
            </div>
          </div>
          <div className="mt-6">
            <GraficoDeFacturacion puntos={m.facturacion.tendencia} moneda={m.moneda} />
          </div>
        </section>
      </Aparece>

      {/* `lg:` y no `sm:` a propósito: en el rango intermedio (tablet, o el
          celular apaisado) tres columnas no dejan lugar para el círculo de
          la rueda + su leyenda, y eso es justamente lo que se salía de
          cuadro. Con dos columnas hay aire; el tercer bloque baja solo. */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Aparece retraso={0.08} className="min-w-0">
          <section className="superficie h-full p-5">
            <MovimientoDelPeriodo movimiento={m.movimiento} etiquetaDelRango={m.etiquetaDelRango} />
          </section>
        </Aparece>

        <Aparece retraso={0.1} className="min-w-0">
          <section className="superficie h-full p-5">
            <Rueda titulo="Método de pago" segmentos={m.porMetodo} moneda={m.moneda} />
          </section>
        </Aparece>

        <Aparece retraso={0.12} className="min-w-0">
          <section className="superficie h-full p-5">
            <Rueda titulo="Modalidad" segmentos={m.porModalidad} moneda={m.moneda} />
          </section>
        </Aparece>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Aparece retraso={0.14} className="min-w-0">
          <section className="superficie p-5">
            <Distribucion titulo={`Edad · ${m.totalAlumnosActivos} activos`} segmentos={m.porEdad} />
          </section>
        </Aparece>

        <Aparece retraso={0.16} className="min-w-0">
          <section className="superficie p-5">
            <Distribucion titulo="Género" segmentos={m.porGenero} />
          </section>
        </Aparece>
      </div>

      <Aparece retraso={0.18}>
        <section className="superficie p-5">
          <p className="t-rotulo">Asistencia · {m.etiquetaDelRango.toLowerCase()}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="t-cifra text-[1.75rem]">
              <NumeroAnimado valor={m.asistencia.porcentaje} />%
            </span>
            <span className="text-sm text-muted-foreground">
              {m.asistencia.asistieron} de {m.asistencia.total} alumnos activos vinieron al menos
              una vez
            </span>
          </p>
        </section>
      </Aparece>
    </div>
  );
}
