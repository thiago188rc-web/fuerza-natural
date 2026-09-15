import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { metricasQuery } from "@/use-cases/metricas/consultas";
import { esVistaMetricas } from "@/domain/metricas/vista";
import { etiquetaDeMes, sumarMeses } from "@/domain/fechas/calendario";
import { GraficoDeFacturacion } from "@/components/features/metricas/grafico-de-facturacion";
import { ComparacionMensual } from "@/components/features/metricas/comparacion-mensual";
import { Distribucion } from "@/components/features/metricas/distribucion";
import { DistribucionEdadGenero } from "@/components/features/metricas/distribucion-edad-genero";
import { AvisoDeCumpleanos } from "@/components/features/metricas/aviso-de-cumpleanos";
import { Rueda } from "@/components/features/metricas/rueda";
import { MovimientoDelPeriodo } from "@/components/features/metricas/movimiento-del-periodo";
import { SelectorDeVista } from "@/components/features/metricas/selector-de-vista";
import { Aparece, NumeroAnimado } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Importe } from "@/components/importe";

export const metadata: Metadata = { title: "Métricas" };

const MES_REGEX = /^\d{4}-\d{2}$/;

/**
 * MÉTRICAS DEL NEGOCIO. La vista (semana/mes/año) vive en la URL y decide
 * dos cosas a la vez: el rango del resumen y la granularidad del gráfico
 * de tendencia — ver `src/use-cases/metricas/consultas.ts`. Con la vista
 * "mes" también vive en la URL el mes que se está mirando (`?mes=`), para
 * poder navegar a meses anteriores o posteriores sin perder el lugar al
 * recargar o compartir el enlace.
 *
 * Nada de porcentajes inventados ni comparaciones contra un período
 * anterior que el sistema no calcula: cada bloque muestra lo que se puede
 * afirmar con los datos que hay.
 */
export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; mes?: string }>;
}) {
  const { vista: vistaCruda, mes: mesCrudo } = await searchParams;
  const vista = esVistaMetricas(vistaCruda) ? vistaCruda : "mes";
  const mesPedido = mesCrudo && MES_REGEX.test(mesCrudo) ? `${mesCrudo}-01` : undefined;

  const resultado = await metricasQuery({ vista, mes: mesPedido });

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
  // El mes que se está viendo de verdad, resuelto por el servidor (no lo
  // que vino crudo de la URL): así el mes por defecto (sin `?mes=`) sigue
  // navegando bien.
  const mesActivo = m.rango.desde;
  const mesAnteriorHref = `?vista=mes&mes=${sumarMeses(mesActivo, -1).slice(0, 7)}`;
  const mesSiguienteHref = `?vista=mes&mes=${sumarMeses(mesActivo, 1).slice(0, 7)}`;

  return (
    <div className="space-y-6">
      <Aparece>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo">Negocio</p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Métricas</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {vista === "mes" ? (
              <div className="flex items-center gap-1">
                <Link
                  href={mesAnteriorHref}
                  aria-label="Mes anterior"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </Link>
                <span className="tabular min-w-[7rem] text-center text-sm font-medium capitalize">
                  {etiquetaDeMes(mesActivo, { conAnio: true })}
                </span>
                <Link
                  href={mesSiguienteHref}
                  aria-label="Mes siguiente"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </Link>
              </div>
            ) : null}
            <SelectorDeVista vista={vista} />
          </div>
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
            <GraficoDeFacturacion
              puntos={m.facturacion.tendencia}
              moneda={m.moneda}
              indiceDeHoy={m.facturacion.indiceDeHoy}
            />
          </div>
        </section>
      </Aparece>

      {m.comparacionMensual ? (
        <Aparece retraso={0.06}>
          <section className="superficie p-5">
            <ComparacionMensual
              mesActual={m.comparacionMensual.mesActual}
              mesAnterior={m.comparacionMensual.mesAnterior}
              moneda={m.moneda}
              indiceDeHoy={m.facturacion.indiceDeHoy}
            />
          </section>
        </Aparece>
      ) : null}

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

      <Aparece retraso={0.17}>
        <section className="superficie p-5">
          <DistribucionEdadGenero titulo="Edad y género" segmentos={m.porEdadYGenero} />
        </section>
      </Aparece>

      <div className="grid gap-5 sm:grid-cols-2">
        <Aparece retraso={0.18} className="min-w-0">
          <section className="superficie h-full p-5">
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

        <Aparece retraso={0.2} className="min-w-0">
          <section className="superficie h-full p-5">
            <AvisoDeCumpleanos alumnos={m.cumpleanos} hoy={m.hoy} />
          </section>
        </Aparece>
      </div>
    </div>
  );
}
