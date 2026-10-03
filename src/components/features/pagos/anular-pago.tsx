"use client";

import { useActionState, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Importe } from "@/components/importe";
import { anularPagoFormAction } from "@/app/(app)/pagos/actions";
import { ESTADO_ANULACION_INICIAL } from "@/app/(app)/pagos/estado-formulario";
import { fechaCompleta } from "@/lib/formato";

/**
 * "Anular" en una fila de pagos. Solo se dibuja cuando la sesión puede
 * anular (hoy, el DUENO); el servidor lo vuelve a exigir igual.
 *
 * Nunca con un solo clic: abre un diálogo que dice qué pasa —el pago no se
 * borra, queda tachado y deja de contar— y pide el motivo, que es
 * obligatorio. Mientras se envía, el botón queda deshabilitado; si igual
 * llegan dos envíos, el servidor anula una sola vez.
 */
export function AnularPago({
  pago,
  moneda,
  alumno,
}: {
  pago: { id: string; fechaPago: string; monto: number; cubreDesde: string | null; cubreHasta: string | null };
  moneda: string;
  /** Para la fila del historial general, donde el alumno no es obvio. */
  alumno?: string;
}) {
  const [estado, formAction, pendiente] = useActionState(anularPagoFormAction, ESTADO_ANULACION_INICIAL);
  const [abierto, setAbierto] = useState(false);

  // Se cierra solo cuando el servidor confirma ESTE pago anulado.
  const terminado = estado.ok && estado.anulado === pago.id;
  const errores = estado.errores ?? {};

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setAbierto(true)}
      >
        <Ban />
        Anular
      </Button>

      <Dialog open={abierto && !terminado} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <form action={formAction}>
            <input type="hidden" name="paymentId" value={pago.id} />

            <DialogHeader>
              <DialogTitle>Anular este pago</DialogTitle>
              <DialogDescription>
                El pago no se borra: queda en el historial, tachado y con el motivo, y deja de
                contar para la cobertura y para lo cobrado. Si la persona pagó de verdad pero se
                cargó mal, después registralo de nuevo con los datos correctos.
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
              <dt className="text-muted-foreground">Importe</dt>
              <dd>
                <Importe valor={pago.monto} moneda={moneda} />
              </dd>
              {pago.cubreDesde && pago.cubreHasta ? (
                <>
                  <dt className="text-muted-foreground">Cubría</dt>
                  <dd className="tabular">
                    {fechaCompleta(pago.cubreDesde)} → {fechaCompleta(pago.cubreHasta)}
                  </dd>
                </>
              ) : null}
            </dl>

            <div className="mt-4">
              <Label htmlFor={`motivo-${pago.id}`}>Motivo</Label>
              <Textarea
                id={`motivo-${pago.id}`}
                name="motivo"
                rows={2}
                required
                minLength={5}
                maxLength={300}
                placeholder="Ej: se cargó a otro alumno"
                className="mt-1.5"
                aria-invalid={errores.motivo ? true : undefined}
              />
              <p className={errores.motivo ? "mt-1.5 text-xs text-destructive" : "mt-1.5 text-xs text-muted-foreground"}>
                {errores.motivo ?? "Obligatorio. Queda a la vista junto al pago."}
              </p>
            </div>

            {estado.mensaje && !estado.ok && !errores.motivo ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {estado.mensaje}
              </p>
            ) : null}

            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={pendiente}>
                {pendiente ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Anulando…
                  </>
                ) : (
                  "Anular pago"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
