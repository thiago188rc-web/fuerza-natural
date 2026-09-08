import type { Metadata } from "next";
import { Plus, Receipt } from "lucide-react";
import { panelQuery } from "@/use-cases/panel/consultas";
import { InstrumentoDelMes } from "@/components/features/cobertura/instrumento-del-mes";
import { BandejaDeAtencion } from "@/components/features/panel/bandeja-de-atencion";
import { ColumnaDeContexto } from "@/components/features/panel/columna-de-contexto";
import { Aparece } from "@/components/motion/primitivas";
import { BotonLink } from "@/components/boton-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fechaLarga } from "@/lib/formato";

export const metadata: Metadata = { title: "Panel" };

/**
 * LA CENTRAL DE OPERACIONES.
 *
 * La composición es editorial, no una grilla de widgets:
 *
 *   1. UNA CABECERA MÍNIMA. La fecha y las dos acciones del día. El título
 *      no compite con lo que sigue.
 *
 *   2. LA BANDA DEL MES, A SANGRE. Sale de la columna de contenido y
 *      ocupa el ancho entero sobre la retícula, sin caja: es el
 *      instrumento del producto y se lee como una franja de medición,
 *      no como "otra tarjeta". Es la única pieza con ese tratamiento.
 *
 *   3. LA BANDEJA Y EL CONTEXTO. Recién después, dentro de la columna, el
 *      trabajo del día (a quién cobrarle, agrupado por gravedad) y al
 *      costado el contexto del mes en una sola superficie.
 *
 * Ese orden es la tesis: primero el estado del ciclo, después la acción,
 * al final la referencia.
 */
export default async function DashboardPage() {
  const resultado = await panelQuery();

  if (!resultado.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos armar el panel</AlertTitle>
        <AlertDescription>
          {resultado.kind === "FORBIDDEN"
            ? "Tu sesión no tiene permiso para ver esta información."
            : "Hubo un problema al leer los datos del gimnasio. Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  const panel = resultado.data;

  return (
    <div className="space-y-7">
      <Aparece>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo first-letter:uppercase">{fechaLarga(panel.hoy)}</p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
              Central de operaciones
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BotonLink href="/alumnos/nuevo" variant="outline" size="lg">
              <Plus />
              Nuevo alumno
            </BotonLink>
            <BotonLink href="/pagos/nuevo" size="lg">
              <Receipt />
              Registrar pago
            </BotonLink>
          </div>
        </header>
      </Aparece>

      {/* A SANGRE: los márgenes negativos deshacen el padding del
          contenedor y el padding interno lo vuelve a poner, así el fondo
          con retícula y los hairlines llegan hasta los bordes mientras el
          contenido sigue alineado con el resto de la página. */}
      <Aparece retraso={0.04}>
        <section className="relative -mx-4 border-y border-border sm:-mx-6 lg:-mx-10">
          <div aria-hidden className="reticula pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative px-4 py-7 sm:px-6 lg:px-10 lg:py-8">
            <InstrumentoDelMes
              etiquetaMes={panel.etiquetaMes}
              posicionDeHoy={panel.posicionDeHoy}
              diaDeHoy={panel.diaDeHoy}
              diasDelMes={panel.diasDelMes}
              cubiertos={panel.cubiertos}
              enRevision={panel.enRevision}
              descubiertos={panel.descubiertos}
              activos={panel.activos}
            />
          </div>
        </section>
      </Aparece>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <Aparece retraso={0.08} className="min-w-0">
          <BandejaDeAtencion
            alumnos={panel.atencion}
            posicionDeHoy={panel.posicionDeHoy}
            etiquetaMes={panel.etiquetaMes}
          />
        </Aparece>

        <Aparece retraso={0.12} className="min-w-0">
          <ColumnaDeContexto
            cobrado={panel.cobradoEsteMes}
            moneda={panel.moneda}
            movimiento={panel.movimiento}
            eventos={panel.actividad}
            hoy={panel.hoy}
            etiquetaMes={panel.etiquetaMes}
          />
        </Aparece>
      </div>
    </div>
  );
}
