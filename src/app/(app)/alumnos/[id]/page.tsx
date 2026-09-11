import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil, Receipt } from "lucide-react";
import { fichaCompletaQuery } from "@/use-cases/alumnos/ficha";
import { contextoDelGimnasio } from "@/use-cases/gimnasio/contexto";
import { TiraDeMeses } from "@/components/features/cobertura/tira-de-meses";
import { Senal, TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import {
  AvisoDeExito,
  EncabezadoDeFicha,
} from "@/components/features/alumnos/encabezado-de-ficha";
import { CambiarEstado } from "@/components/features/alumnos/cambiar-estado";
import { PagosDelAlumno } from "@/components/features/alumnos/pagos-del-alumno";
import { HistorialDelAlumno } from "@/components/features/alumnos/historial-del-alumno";
import { ListaDePestanas, PanelDePestana, Pestanas } from "@/components/pestanas";
import { Aparece } from "@/components/motion/primitivas";
import { BotonLink } from "@/components/boton-link";
import { Importe } from "@/components/importe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { esVinculo, etiquetaVinculo } from "@/domain/alumnos/vinculo";
import { distanciaRelativa } from "@/domain/fechas/calendario";
import { ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";
import { ETIQUETA_METODO } from "@/schemas/payment";
import { fechaCompleta } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ficha" };

/**
 * LA FICHA — el espacio de trabajo de una persona, no su formulario.
 *
 * Al abrirla hay que entender en un segundo QUIÉN es, QUÉ plan tiene,
 * CÓMO viene su cobertura, CUÁNDO pagó, QUÉ pasó últimamente y QUÉ se
 * puede hacer. La pantalla se organiza en tres capas para eso:
 *
 *   1. EL ENCABEZADO: nombre, situación, y las dos acciones del día.
 *   2. LA BANDA DE DATOS: cinco lecturas en una sola línea (vínculo,
 *      plan, cobertura, antigüedad, plata) separadas por hairlines. Es la
 *      ficha entera resumida en una franja.
 *   3. LAS PESTAÑAS: el resumen muestra lo suficiente —la tira del año,
 *      los últimos pagos, los últimos hechos, el estado— y el resto
 *      espera detrás de "Pagos" e "Historial". Todo viene ya cargado:
 *      cambiar de pestaña es instantáneo.
 *
 * La tira de meses es lo que convierte esta pantalla en un lugar donde se
 * ENTIENDE algo: doce columnas dicen de un vistazo si esta persona viene
 * pagando parejo, si tiene huecos o si arrancó hace poco — algo que una
 * lista de pagos ordenada por fecha tiene y no muestra.
 */
export default async function FichaAlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const [query, ficha, contexto] = await Promise.all([
    searchParams,
    fichaCompletaQuery(id),
    contextoDelGimnasio(),
  ]);

  if (!ficha.ok) {
    if (ficha.kind === "FORBIDDEN") redirect("/login");
    if (ficha.kind === "NOT_FOUND") notFound();
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar la ficha</AlertTitle>
        <AlertDescription>Recargá la página e intentá de nuevo.</AlertDescription>
      </Alert>
    );
  }

  const datos = ficha.data;
  const { alumno } = datos;
  const vinculo = esVinculo(alumno.vinculo) ? alumno.vinculo : null;
  const etiqueta = vinculo ? etiquetaVinculo(vinculo) : alumno.vinculo;
  const activo = alumno.vinculo === "ACTIVO";
  const aviso = query.alta
    ? "Alumno dado de alta."
    : query.guardado
      ? "Cambios guardados."
      : null;

  return (
    <div className="space-y-6">
      <Aparece>
        <div className="space-y-4">
          <Link
            href="/alumnos"
            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
          >
            <ArrowLeft className="size-3" strokeWidth={2} />
            Alumnos
          </Link>

          {aviso ? <AvisoDeExito texto={aviso} /> : null}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <EncabezadoDeFicha
              nombre={alumno.nombre}
              apellido={alumno.apellido}
              vinculo={alumno.vinculo}
              etiquetaVinculo={etiqueta}
              estado={datos.estado}
              detalle={datos.detalle}
              plan={alumno.planNombre}
            />

            <div className="flex flex-wrap items-center gap-2">
              <BotonLink href={`/alumnos/${alumno.id}/editar`} variant="outline" size="lg">
                <Pencil />
                Editar
              </BotonLink>
              {alumno.vinculo !== "BAJA" ? (
                <BotonLink href={`/pagos/nuevo?alumno=${alumno.id}`} size="lg">
                  <Receipt />
                  Registrar pago
                </BotonLink>
              ) : null}
            </div>
          </div>
        </div>
      </Aparece>

      {/* LA BANDA DE DATOS. Una grilla con `gap-px` sobre el color del
          hairline: las celdas quedan separadas por líneas de 1px en las
          dos direcciones sin dibujar un solo borde a mano. */}
      <Aparece retraso={0.04}>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          <Celda etiqueta="Vínculo">
            <span className={cn(!activo && "text-foreground")}>{etiqueta}</span>
            {alumno.pausaHasta ? (
              <Detalle>hasta el {fechaCompleta(alumno.pausaHasta)}</Detalle>
            ) : alumno.bajaFecha ? (
              <Detalle>desde el {fechaCompleta(alumno.bajaFecha)}</Detalle>
            ) : (
              <Detalle>desde {distanciaRelativa(datos.hoy, alumno.vinculoDesde)}</Detalle>
            )}
          </Celda>

          <Celda etiqueta="Plan">
            {/* Solo el nombre, sin adornos: es el dato que un pago de
                1/2 mes NUNCA cambia, y conviene poder leerlo tal cual. */}
            {alumno.planNombre}
          </Celda>

          <Celda etiqueta="Cobertura">
            <span className="inline-flex items-center gap-1.5">
              <Senal estado={datos.estado} />
              <span className={TEXTO_DE_ESTADO[datos.estado]}>{datos.detalle}</span>
            </span>
            {datos.cubiertoHasta ? (
              <Detalle>hasta el {fechaCompleta(datos.cubiertoHasta)}</Detalle>
            ) : null}
          </Celda>

          <Celda etiqueta="Alumno desde">
            {fechaCompleta(alumno.fechaAltaOriginal)}
            <Detalle>{distanciaRelativa(datos.hoy, alumno.fechaAltaOriginal)}</Detalle>
          </Celda>

          <Celda etiqueta="Total registrado" className="col-span-2 sm:col-span-1">
            <Importe valor={datos.totalPagado} moneda={datos.moneda} className="font-mono" />
            <Detalle>
              {datos.pagos.length} {datos.pagos.length === 1 ? "pago" : "pagos"}
            </Detalle>
          </Celda>
        </dl>
      </Aparece>

      <Pestanas inicial="resumen">
        <Aparece retraso={0.08}>
          <ListaDePestanas
            etiqueta="Secciones de la ficha"
            pestanas={[
              { clave: "resumen", etiqueta: "Resumen" },
              { clave: "pagos", etiqueta: "Pagos", conteo: datos.pagos.length },
              { clave: "historial", etiqueta: "Historial", conteo: datos.eventos.length },
            ]}
          />
        </Aparece>

        <PanelDePestana clave="resumen" className="mt-5">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0 space-y-5">
              <Aparece retraso={0.1}>
                <section className="superficie px-5 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="t-rotulo">Cobertura de los últimos 12 meses</h2>
                    {datos.cubiertoHasta ? (
                      <p className="text-xs text-muted-foreground">
                        Cubierto hasta el{" "}
                        <span className="tabular text-foreground">
                          {fechaCompleta(datos.cubiertoHasta)}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <TiraDeMeses
                    className="mt-4"
                    tira={datos.tira}
                    posicionDeHoy={datos.posicionDeHoy}
                  />
                </section>
              </Aparece>

              <Aparece retraso={0.14}>
                <PagosDelAlumno
                  pagos={datos.pagos}
                  moneda={datos.moneda}
                  hoy={datos.hoy}
                  total={datos.totalPagado}
                  alumnoId={alumno.id}
                  puedeCobrar={alumno.vinculo !== "BAJA"}
                  resumen
                />
              </Aparece>
            </div>

            <div className="min-w-0 space-y-5">
              <Aparece retraso={0.12}>
                <section className="superficie px-5 py-5">
                  <h2 className="t-rotulo">Datos</h2>
                  <dl className="mt-3 space-y-2.5">
                    <Dato etiqueta="Teléfono" valor={alumno.telefono} tabular />
                    <Dato
                      etiqueta="Fecha de nacimiento"
                      valor={alumno.fechaNacimiento ? fechaCompleta(alumno.fechaNacimiento) : null}
                    />
                    <Dato
                      etiqueta="Forma de pago habitual"
                      valor={
                        alumno.formaPagoHabitual
                          ? ETIQUETA_METODO[alumno.formaPagoHabitual as keyof typeof ETIQUETA_METODO]
                          : null
                      }
                    />
                    <Dato
                      etiqueta="Modalidad habitual"
                      valor={
                        alumno.modalidadHabitual
                          ? ETIQUETA_MODALIDAD[alumno.modalidadHabitual as Modalidad]
                          : null
                      }
                    />
                    <Dato etiqueta="Alta" valor={fechaCompleta(alumno.fechaAltaOriginal)} />
                    <Dato
                      etiqueta={`${etiqueta} desde`}
                      valor={fechaCompleta(alumno.vinculoDesde)}
                    />
                    {alumno.pausaHasta ? (
                      <Dato etiqueta="Pausado hasta" valor={fechaCompleta(alumno.pausaHasta)} />
                    ) : null}
                    {alumno.pausaNota ? (
                      <Dato etiqueta="Motivo de la pausa" valor={alumno.pausaNota} />
                    ) : null}
                    {alumno.bajaFecha ? (
                      <Dato etiqueta="Baja" valor={fechaCompleta(alumno.bajaFecha)} />
                    ) : null}
                    {alumno.bajaMotivoEtiqueta ? (
                      <Dato etiqueta="Motivo de la baja" valor={alumno.bajaMotivoEtiqueta} />
                    ) : null}
                    {alumno.bajaObservacion ? (
                      <Dato etiqueta="Observación" valor={alumno.bajaObservacion} />
                    ) : null}
                    {alumno.notas ? <Dato etiqueta="Observaciones" valor={alumno.notas} /> : null}
                  </dl>
                </section>
              </Aparece>

              <Aparece retraso={0.16}>
                <section className="superficie px-5 py-5">
                  <h2 className="t-rotulo">Estado del vínculo</h2>
                  <p className="mt-2 mb-3.5 text-xs text-muted-foreground">
                    Ningún estado cambia solo. No pagar no da de baja a nadie, y pagar no
                    reactiva a nadie.
                  </p>
                  {vinculo ? (
                    <CambiarEstado
                      alumnoId={alumno.id}
                      vinculoActual={vinculo}
                      hoy={datos.hoy}
                      motivosBaja={contexto.ok ? contexto.data.motivosBaja : []}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este alumno tiene un estado que el sistema no reconoce.
                    </p>
                  )}
                </section>
              </Aparece>

              <Aparece retraso={0.2}>
                <HistorialDelAlumno eventos={datos.eventos} hoy={datos.hoy} limite={3} />
              </Aparece>
            </div>
          </div>
        </PanelDePestana>

        <PanelDePestana clave="pagos" className="mt-5">
          <PagosDelAlumno
            pagos={datos.pagos}
            moneda={datos.moneda}
            hoy={datos.hoy}
            total={datos.totalPagado}
            alumnoId={alumno.id}
            puedeCobrar={alumno.vinculo !== "BAJA"}
          />
        </PanelDePestana>

        <PanelDePestana clave="historial" className="mt-5">
          <div className="mx-auto max-w-2xl">
            <HistorialDelAlumno eventos={datos.eventos} hoy={datos.hoy} />
          </div>
        </PanelDePestana>
      </Pestanas>
    </div>
  );
}

function Celda({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card px-4 py-3.5", className)}>
      <dt className="t-rotulo">{etiqueta}</dt>
      <dd className="mt-1.5 text-sm">{children}</dd>
    </div>
  );
}

function Detalle({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-xs text-muted-foreground">{children}</span>;
}

function Dato({
  etiqueta,
  valor,
  tabular,
}: {
  etiqueta: string;
  valor: string | null;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("text-right text-sm", tabular && "tabular font-mono text-[0.8125rem]")}>
        {valor?.trim() ? valor : "—"}
      </dd>
    </div>
  );
}
