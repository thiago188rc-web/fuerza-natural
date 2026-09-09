import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { metricasQuery } from "@/use-cases/metricas/consultas";
import { GraficoDeFacturacion } from "@/components/features/metricas/grafico-de-facturacion";
import { Distribucion } from "@/components/features/metricas/distribucion";
import { Aparece, NumeroAnimado } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Importe } from "@/components/importe";

export const metadata: Metadata = { title: "Métricas" };

/**
 * MÉTRICAS DEL NEGOCIO. Tres bloques, cada uno con lo que realmente se
 * puede afirmar con los datos que hay — nada de porcentajes inventados
 * (ver `src/use-cases/metricas/consultas.ts`).
 */
export default async function MetricasPage() {
  const resultado = await metricasQuery();

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
        <header>
          <p className="t-rotulo">Negocio</p>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Métricas</h1>
        </header>
      </Aparece>

      <Aparece retraso={0.04}>
        <section className="superficie p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="t-rotulo">Facturación · mes actual</p>
              <p className="t-cifra mt-2 text-[1.75rem]">
                <Importe valor={m.totalFacturadoMesActual} moneda={m.moneda} simboloClassName="text-lg" />
              </p>
            </div>
          </div>
          <div className="mt-6">
            <GraficoDeFacturacion meses={m.facturacion} moneda={m.moneda} />
          </div>
        </section>
      </Aparece>

      <div className="grid gap-5 sm:grid-cols-2">
        <Aparece retraso={0.08}>
          <section className="superficie p-5">
            <Distribucion titulo={`Edad · ${m.totalAlumnosActivos} activos`} segmentos={m.porEdad} />
          </section>
        </Aparece>

        <Aparece retraso={0.12}>
          <section className="superficie p-5">
            <Distribucion titulo="Género" segmentos={m.porGenero} />
          </section>
        </Aparece>
      </div>

      <Aparece retraso={0.16}>
        <section className="superficie p-5">
          <p className="t-rotulo">Asistencia · últimos 30 días</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="t-cifra text-[1.75rem]">
              <NumeroAnimado valor={m.asistenciaUltimos30Dias.porcentaje} />%
            </span>
            <span className="text-sm text-muted-foreground">
              {m.asistenciaUltimos30Dias.asistieron} de {m.asistenciaUltimos30Dias.total} alumnos
              activos vinieron al menos una vez
            </span>
          </p>
        </section>
      </Aparece>
    </div>
  );
}
