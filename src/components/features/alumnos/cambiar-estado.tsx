"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, LogOut, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { etiquetaVinculo, transicionesPermitidas, type Vinculo } from "@/domain/alumnos/vinculo";
import type { MotivoDeBaja } from "@/use-cases/gimnasio/contexto";
import { cambiarVinculoFormAction } from "@/app/(app)/alumnos/actions";
import { ESTADO_FORMULARIO_INICIAL } from "@/app/(app)/alumnos/estado-formulario";
import { cn } from "@/lib/utils";

/**
 * Cambio de estado del vínculo, desde la ficha.
 *
 * Tres decisiones que no son adorno:
 *
 *   · Las opciones que se ofrecen salen de `transicionesPermitidas()`, la
 *     misma función que valida el servidor. La pantalla no puede ofrecer
 *     un cambio que después el servidor rechace.
 *   · Ningún estado cambia con un solo clic: se abre un diálogo, se
 *     completa lo que haga falta y se confirma. Dar de baja a alguien por
 *     un clic de más es exactamente lo que erosiona la confianza en un
 *     sistema administrativo.
 *   · La baja NO borra nada, y el diálogo lo dice con esas palabras. El
 *     alumno queda con su historial completo y se puede reactivar.
 *
 * El motivo de baja sale del catálogo que el gimnasio configura, no de una
 * lista escrita en el código. Del formulario viaja solo el código; la
 * etiqueta la resuelve el servidor.
 */

const ACCIONES: Record<Vinculo, { verbo: string; icono: typeof Pause }> = {
  ACTIVO: { verbo: "Reactivar", icono: RotateCcw },
  PAUSADO: { verbo: "Pausar", icono: Pause },
  BAJA: { verbo: "Dar de baja", icono: LogOut },
};

export function CambiarEstado({
  alumnoId,
  vinculoActual,
  hoy,
  motivosBaja,
}: {
  alumnoId: string;
  vinculoActual: Vinculo;
  hoy: string;
  motivosBaja: MotivoDeBaja[];
}) {
  const [estado, formAction, pendiente] = useActionState(
    cambiarVinculoFormAction,
    ESTADO_FORMULARIO_INICIAL,
  );
  const [destino, setDestino] = useState<Vinculo | null>(null);
  const [motivo, setMotivo] = useState<string>("");

  const errores = estado.errores ?? {};
  const opciones = transicionesPermitidas(vinculoActual);

  // Cuando el cambio se guarda, el diálogo se cierra solo. Se DERIVA de la
  // respuesta de la acción (qué estado quedó aplicado) en vez de resetear
  // `destino` dentro de un efecto.
  const yaResuelto = estado.ok && estado.vinculoAplicado === destino;
  const abierto = destino !== null && !yaResuelto;

  const verbo = destino ? ACCIONES[destino].verbo : "";
  const reactivando = destino === "ACTIVO";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const Icono = ACCIONES[opcion].icono;
          const esVolver = opcion === "ACTIVO";
          return (
            <Button
              key={opcion}
              type="button"
              variant={opcion === "BAJA" ? "destructive" : esVolver ? "default" : "outline"}
              size="sm"
              onClick={() => setDestino(opcion)}
            >
              <Icono />
              {vinculoActual === "PAUSADO" && esVolver ? "Reanudar" : ACCIONES[opcion].verbo}
            </Button>
          );
        })}
      </div>

      {/* La confirmación queda a la vista después de cerrar el diálogo. Sin
          esto, el estado cambiaba y la pantalla no decía nada — el dueño no
          tenía forma de saber si se había guardado. Lo detectó un test e2e,
          no una revisión de código. */}
      {yaResuelto ? (
        <p
          role="status"
          className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-cubierto"
        >
          <Check className="size-3.5" strokeWidth={2.5} />
          Estado actualizado.
        </p>
      ) : null}

      {estado.mensaje && !estado.ok && destino === null ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {estado.mensaje}
        </p>
      ) : null}

      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          if (!v) setDestino(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form action={formAction}>
            <input type="hidden" name="id" value={alumnoId} />
            <input type="hidden" name="vinculo" value={destino ?? ""} />

            <DialogHeader>
              <DialogTitle>
                {destino === "BAJA"
                  ? "Dar de baja al alumno"
                  : destino === "PAUSADO"
                    ? "Pausar la membresía"
                    : vinculoActual === "PAUSADO"
                      ? "Reanudar la membresía"
                      : "Reactivar al alumno"}
              </DialogTitle>
              <DialogDescription>
                {destino === "BAJA"
                  ? "No se borra nada: el alumno queda registrado como Baja, con todo su historial de pagos, y podés reactivarlo cuando vuelva."
                  : destino === "PAUSADO"
                    ? "Mientras esté pausado no aparece en los pendientes de cobro. Su historial no cambia."
                    : `Vuelve a estar activo desde hoy. El estado pasa a ${etiquetaVinculo("ACTIVO")}.`}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-4">
              {destino === "BAJA" && motivosBaja.length > 0 ? (
                <fieldset>
                  <legend className="text-sm font-medium">Motivo</legend>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Se guarda con la baja. Si todavía no lo sabés, dejalo sin elegir.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {motivosBaja
                      .filter((m) => m.activo !== false)
                      .map((m) => {
                        const elegido = motivo === m.codigo;
                        return (
                          <label
                            key={m.codigo}
                            className={cn(
                              "cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150",
                              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-verde",
                              elegido
                                ? "border-foreground/25 bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                            )}
                          >
                            <input
                              type="radio"
                              name="motivoCodigo"
                              value={m.codigo}
                              checked={elegido}
                              onChange={() => setMotivo(m.codigo)}
                              className="sr-only"
                            />
                            {m.etiqueta}
                          </label>
                        );
                      })}
                  </div>
                  {errores.motivoCodigo ? (
                    <p role="alert" className="mt-1.5 text-xs text-destructive">
                      {errores.motivoCodigo}
                    </p>
                  ) : null}
                </fieldset>
              ) : null}

              {destino === "PAUSADO" ? (
                <div>
                  <Label htmlFor="pausaHasta">Pausado hasta</Label>
                  <Input
                    id="pausaHasta"
                    name="pausaHasta"
                    type="date"
                    min={hoy}
                    className="tabular mt-1.5"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {errores.pausaHasta ?? "Opcional si escribís un motivo. Hace falta una de las dos."}
                  </p>
                </div>
              ) : null}

              {!reactivando ? (
                <div>
                  <Label htmlFor="nota">
                    {destino === "BAJA" ? "Observación" : "Motivo de la pausa"}
                  </Label>
                  <Textarea
                    id="nota"
                    name="nota"
                    rows={2}
                    maxLength={300}
                    placeholder={
                      destino === "BAJA"
                        ? "Ej: avisó que se muda a Córdoba"
                        : "Ej: lesión, vuelve con el alta del kinesiólogo"
                    }
                    className="mt-1.5"
                  />
                  {errores.nota ? (
                    <p role="alert" className="mt-1.5 text-xs text-destructive">
                      {errores.nota}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {estado.mensaje && !estado.ok ? (
                <p role="alert" className="text-sm text-destructive">
                  {estado.mensaje}
                </p>
              ) : null}
            </div>

            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setDestino(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant={destino === "BAJA" ? "destructive" : "default"}
                disabled={pendiente}
              >
                {pendiente ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Guardando…
                  </>
                ) : destino === "ACTIVO" && vinculoActual === "PAUSADO" ? (
                  "Reanudar"
                ) : (
                  verbo
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
