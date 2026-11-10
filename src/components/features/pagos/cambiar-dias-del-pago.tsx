"use client";

import { useActionState, useState } from "react";
import { Loader2, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmentado } from "@/components/segmentado";
import { Importe } from "@/components/importe";
import { cambiarDiasDelPagoFormAction } from "@/app/(app)/pagos/actions";
import { ESTADO_CAMBIO_DE_DIAS_INICIAL } from "@/app/(app)/pagos/estado-formulario";
import { fechaCompleta, importe } from "@/lib/formato";

/**
 * "Cambiar días" en una fila de pagos: la persona pagó 2 días y se
 * arrepintió (o al revés). Se elige el plan correcto y el importe pasa solo
 * al precio de ese plan; se puede ajustar a mano si hace falta.
 *
 * El pago no se edita: el servidor anula el viejo y registra uno igual con
 * los días nuevos, en una sola operación. Por eso el diálogo lo dice con
 * esas palabras, igual que "Anular". Solo se dibuja para quien puede anular
 * (hoy, el DUENO); el servidor lo vuelve a exigir.
 */
export function CambiarDiasDelPago({
  pago,
  planes,
  moneda,
  alumno,
}: {
  pago: {
    id: string;
    planId: string;
    planNombreSnapshot: string;
    fechaPago: string;
    monto: number;
    cubreDesde: string | null;
    cubreHasta: string | null;
  };
  planes: { id: string; nombre: string; precio: number | null }[];
  moneda: string;
  /** Para la fila del historial general, donde el alumno no es obvio. */
  alumno?: string;
}) {
  const [estado, formAction, pendiente] = useActionState(
    cambiarDiasDelPagoFormAction,
    ESTADO_CAMBIO_DE_DIAS_INICIAL,
  );
  const [abierto, setAbierto] = useState(false);
  const [planId, setPlanId] = useState("");
  const [montoManual, setMontoManual] = useState<string | null>(null);

  // Se cierra solo cuando el servidor confirma ESTE pago reemplazado.
  const terminado = estado.ok && estado.anulado === pago.id;
  const errores = estado.errores ?? {};

  const planElegido = planes.find((p) => p.id === planId) ?? null;
  const precio = planElegido?.precio ?? null;
  // El importe se DERIVA del plan elegido hasta que se escribe uno propio.
  const monto = montoManual ?? (precio === null ? "" : String(precio));
  const difiere = precio !== null && monto !== "" && Math.abs(Number(monto) - precio) > 0.5;

  function abrir() {
    setPlanId("");
    setMontoManual(null);
    setAbierto(true);
  }

  // Solo tiene sentido si hay otro plan al que cambiar.
  if (!planes.some((p) => p.id !== pago.planId)) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground hover:text-foreground"
        onClick={abrir}
      >
        <Repeat2 />
        Cambiar días
      </Button>

      <Dialog open={abierto && !terminado} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <form action={formAction}>
            <input type="hidden" name="paymentId" value={pago.id} />
            <input type="hidden" name="planId" value={planId} />

            <DialogHeader>
              <DialogTitle>Cambiar los días de este pago</DialogTitle>
              <DialogDescription>
                Se mantiene la fecha de cobro y el período que cubre. El pago actual queda anulado
                en el historial, con el motivo, y se registra uno igual con los días nuevos y su
                importe.
              </DialogDescription>
            </DialogHeader>

            <dl className="hundido mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg px-4 py-3 text-sm">
              {alumno ? (
                <>
                  <dt className="text-muted-foreground">Alumno</dt>
                  <dd>{alumno}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Cobrado el</dt>
              <dd className="tabular">{fechaCompleta(pago.fechaPago)}</dd>
              {pago.cubreDesde && pago.cubreHasta ? (
                <>
                  <dt className="text-muted-foreground">Cubre</dt>
                  <dd className="tabular">
                    {fechaCompleta(pago.cubreDesde)} → {fechaCompleta(pago.cubreHasta)}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Ahora</dt>
              <dd>
                {pago.planNombreSnapshot} ·{" "}
                <Importe valor={pago.monto} moneda={moneda} />
              </dd>
            </dl>

            <div className="mt-4">
              <p className="t-rotulo">Días por semana</p>
              <Segmentado
                className="mt-2"
                size="compacto"
                nombre={`dias-del-pago-${pago.id}`}
                valor={planId}
                onCambio={(id) => {
                  setPlanId(id);
                  // El importe vuelve a ser el precio del plan nuevo.
                  setMontoManual(null);
                }}
                opciones={planes
                  .filter((p) => p.id !== pago.planId)
                  .map((p) => ({
                    valor: p.id,
                    etiqueta: p.nombre,
                    detalle: p.precio === null ? "a confirmar" : importe(p.precio, moneda),
                  }))}
              />
              {errores.planId ? (
                <p role="alert" className="mt-1.5 text-xs text-destructive">
                  {errores.planId}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <Label htmlFor={`monto-${pago.id}`}>Nuevo importe</Label>
              <div className="relative mt-1.5 max-w-[12rem]">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id={`monto-${pago.id}`}
                  name="monto"
                  inputMode="numeric"
                  value={monto}
                  onChange={(e) => setMontoManual(e.target.value)}
                  placeholder={planElegido === null ? "Elegí los días" : "A confirmar"}
                  className="tabular pl-7 font-mono"
                  aria-invalid={errores.monto ? true : undefined}
                />
              </div>
              <p
                className={
                  errores.monto ? "mt-1.5 text-xs text-destructive" : "mt-1.5 text-xs text-muted-foreground"
                }
              >
                {errores.monto ??
                  (planElegido === null
                    ? "Sale del precio de los días que elijas."
                    : precio === null
                      ? `El precio de "${planElegido.nombre}" no está confirmado: ingresá el importe.`
                      : difiere
                        ? `Distinto del precio configurado (${importe(precio, moneda)}). Se guarda lo que pongas.`
                        : `Precio configurado de ${planElegido.nombre}.`)}
              </p>
            </div>

            {estado.mensaje && !estado.ok && !errores.planId && !errores.monto ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {estado.mensaje}
              </p>
            ) : null}

            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente || planElegido === null}>
                {pendiente ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Cambiar días"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
