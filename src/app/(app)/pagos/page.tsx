import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { historialDePagosQuery } from "@/use-cases/pagos/consultas";
import { TablaDePagos } from "@/components/features/pagos/tabla-de-pagos";
import { NavegadorDeMes } from "@/components/navegador-de-mes";
import { Aparece, NumeroAnimado } from "@/components/motion/primitivas";
import { BotonLink } from "@/components/boton-link";
import { Importe } from "@/components/importe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { primerDiaDelMes, ultimoDiaDelMes } from "@/domain/fechas/calendario";

export const metadata: Metadata = { title: "Pagos" };

/**
 * El historial de pagos, mes por mes.
 *
 * El mes viaja en la URL. Eso no es un detalle técnico: el dueño va a
 * querer mandarle a alguien "mirá septiembre", y con el mes en el estado
 * del cliente eso sería imposible.
 */
export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;

  // 'YYYY-MM' de la URL → primer día del mes. Si viene cualquier cosa, se
  // ignora y se usa el mes actual: un parámetro roto no puede romper la
  // pantalla.
  const mesPedido = /^\d{4}-\d{2}$/.test(mes ?? "") ? `${mes}-01` : null;

  const historial = await historialDePagosQuery(
    mesPedido
      ? { desde: primerDiaDelMes(mesPedido), hasta: ultimoDiaDelMes(mesPedido), pagina: 1 }
      : { pagina: 1 },
  );

  if (!historial.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar los pagos</AlertTitle>
        <AlertDescription>
          {historial.kind === "FORBIDDEN"
            ? "Tu sesión no tiene permiso para ver esta información."
            : "Hubo un problema al leer los datos del gimnasio. Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  const datos = historial.data;

  return (
    <div className="space-y-6">
      <Aparece>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo">Historial</p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Pagos</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <NavegadorDeMes mes={datos.rango.desde} maximo={datos.hoy} />
            <BotonLink href="/pagos/nuevo" size="lg">
              <Receipt />
              Registrar pago
            </BotonLink>
          </div>
        </header>
      </Aparece>

      {/* LOS TOTALES DEL MES. Directo sobre el lienzo, sin caja: es el pie
          de la tabla puesto arriba, y una tarjeta lo convertiría en "un
          widget de KPI" que compite con la tabla en vez de resumirla. */}
      <Aparece retraso={0.04}>
        <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-5">
          <div>
            <dt className="t-rotulo">Total del mes</dt>
            <dd className="t-cifra mt-2 text-[2rem]">
              <Importe
                valor={datos.cobradoEnElRango.total}
                moneda={datos.moneda}
                simboloClassName="text-xl"
              />
            </dd>
          </div>

          <div>
            <dt className="t-rotulo">Pagos registrados</dt>
            <dd className="t-cifra mt-2 text-[2rem]">
              <NumeroAnimado valor={datos.cobradoEnElRango.cantidad} />
            </dd>
          </div>

          {datos.total > datos.porPagina ? (
            <p className="ml-auto text-xs text-muted-foreground">
              Mostrando los primeros <span className="tabular">{datos.porPagina}</span> de{" "}
              <span className="tabular">{datos.total}</span>
            </p>
          ) : null}
        </dl>
      </Aparece>

      <Aparece retraso={0.08}>
        <TablaDePagos pagos={datos.filas} moneda={datos.moneda} hoy={datos.hoy} />
      </Aparece>
    </div>
  );
}
