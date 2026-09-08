import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus, SearchX, Users } from "lucide-react";
import { padronQuery } from "@/use-cases/alumnos/padron";
import { ControlesDelPadron } from "@/components/features/alumnos/controles-del-padron";
import { ListaDelPadron } from "@/components/features/alumnos/lista-del-padron";
import { Aparece } from "@/components/motion/primitivas";
import { BotonLink } from "@/components/boton-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ESTADO_FILTRO_TODOS, filtrosAlumnosSchema } from "@/schemas/student";

export const metadata: Metadata = { title: "Alumnos" };

type ParametrosBusqueda = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * EL PADRÓN — la pantalla donde el dueño va a pasar la mayor parte del
 * tiempo.
 *
 * Todo el estado de la vista (búsqueda, filtro, página) vive en la URL, no
 * en React: es lo que hace que "volver atrás" funcione y que un link a
 * "los pausados" se pueda compartir o guardar.
 *
 * Los datos NUNCA se consultan desde el navegador: esto es un Server
 * Component, la consulta pasa por `withAuth` + RLS, y al cliente solo
 * llegan las filas que este gimnasio puede ver.
 */
export default async function AlumnosPage({
  searchParams,
}: {
  searchParams: ParametrosBusqueda;
}) {
  const params = await searchParams;
  // `.catch()` en el schema: un `?estado=BASURA` en la URL no rompe la
  // pantalla, cae al valor por defecto. Es una URL, la puede editar
  // cualquiera.
  const filtros = filtrosAlumnosSchema.parse({
    q: params.q,
    estado: params.estado,
    pagina: params.pagina,
  });

  const resultado = await padronQuery(filtros);
  if (!resultado.ok) {
    if (resultado.kind === "FORBIDDEN") redirect("/login");
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar los alumnos</AlertTitle>
        <AlertDescription>
          Recargá la página; si sigue fallando, hay un problema con la base de datos.
        </AlertDescription>
      </Alert>
    );
  }

  const padron = resultado.data;
  const totalPaginas = Math.max(1, Math.ceil(padron.total / padron.porPagina));
  const hayFiltros = Boolean(filtros.q) || filtros.estado !== ESTADO_FILTRO_TODOS;
  const totalDelPadron = Object.values(padron.conteoPorVinculo).reduce((a, b) => a + b, 0);

  function href(nuevaPagina: number) {
    const p = new URLSearchParams();
    if (filtros.q) p.set("q", filtros.q);
    if (filtros.estado !== ESTADO_FILTRO_TODOS) p.set("estado", filtros.estado);
    if (nuevaPagina > 1) p.set("pagina", String(nuevaPagina));
    const query = p.toString();
    return query ? `/alumnos?${query}` : "/alumnos";
  }

  return (
    <div className="space-y-5">
      <Aparece>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo">
              Padrón · cobertura de {padron.etiquetaMes}
            </p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
              Alumnos
            </h1>
          </div>
          <BotonLink href="/alumnos/nuevo" size="lg">
            <Plus />
            Nuevo alumno
          </BotonLink>
        </div>
      </Aparece>

      <Aparece retraso={0.04}>
        <ControlesDelPadron
          q={filtros.q ?? ""}
          estado={filtros.estado}
          conteo={padron.conteoPorVinculo}
          total={totalDelPadron}
        />
      </Aparece>

      <Aparece retraso={0.08}>
        {padron.filas.length === 0 ? (
          <section className="superficie flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              {hayFiltros ? (
                <SearchX className="size-5" strokeWidth={1.75} />
              ) : (
                <Users className="size-5" strokeWidth={1.75} />
              )}
            </span>
            <h2 className="mt-4 t-seccion">
              {hayFiltros
                ? filtros.q
                  ? `Sin resultados para “${filtros.q}”`
                  : "No hay alumnos en este estado"
                : "El padrón está vacío"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {hayFiltros
                ? "Probá con otro término o quitá el filtro de estado."
                : "Todavía no cargaste a nadie. Podés darlos de alta de a uno o importarlos de una planilla."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {hayFiltros ? (
                <BotonLink href="/alumnos" variant="outline">
                  Limpiar filtros
                </BotonLink>
              ) : (
                <>
                  <BotonLink href="/alumnos/nuevo">Dar de alta al primero</BotonLink>
                  <BotonLink href="/importar" variant="outline">
                    Importar una planilla
                  </BotonLink>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="superficie overflow-hidden">
            <ListaDelPadron
              filas={padron.filas}
              posicionDeHoy={padron.posicionDeHoy}
              hoy={padron.hoy}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 hundido border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              <span>
                <span className="tabular">{padron.total}</span>{" "}
                {padron.total === 1 ? "alumno" : "alumnos"}
                {totalPaginas > 1 ? (
                  <>
                    {" · página "}
                    <span className="tabular">{padron.pagina}</span> de{" "}
                    <span className="tabular">{totalPaginas}</span>
                  </>
                ) : null}
              </span>

              {totalPaginas > 1 ? (
                <div className="flex gap-2">
                  <BotonLink
                    href={href(padron.pagina - 1)}
                    variant="outline"
                    size="sm"
                    deshabilitado={padron.pagina <= 1}
                  >
                    Anterior
                  </BotonLink>
                  <BotonLink
                    href={href(padron.pagina + 1)}
                    variant="outline"
                    size="sm"
                    deshabilitado={padron.pagina >= totalPaginas}
                  >
                    Siguiente
                  </BotonLink>
                </div>
              ) : null}
            </div>
          </section>
        )}
      </Aparece>
    </div>
  );
}
