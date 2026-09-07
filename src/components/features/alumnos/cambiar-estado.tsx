"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { etiquetaVinculo, transicionesPermitidas, type Vinculo } from "@/domain/alumnos/vinculo";
import { cambiarVinculoFormAction } from "@/app/(app)/alumnos/actions";
import { ESTADO_FORMULARIO_INICIAL } from "@/app/(app)/alumnos/estado-formulario";

/**
 * Cambio de estado desde la ficha. Fase 1 da la capacidad técnica; el
 * workflow completo de bajas (motivo del catálogo del gimnasio, fecha
 * efectiva, reactivación con historial) es Fase 3.
 *
 * Dos decisiones de UX que no son adorno:
 *
 *   · Las opciones que se ofrecen salen de `transicionesPermitidas()`, la
 *     misma función que valida el servidor. La pantalla no puede ofrecer
 *     un cambio que después el servidor rechace.
 *   · Ningún estado se cambia con un solo clic. Se elige, se completa lo
 *     que haga falta y se confirma — dar de baja a alguien por error de
 *     clic es exactamente el tipo de cosa que erosiona la confianza en un
 *     sistema administrativo.
 */
const VERBOS: Record<Vinculo, string> = {
  ACTIVO: "Reactivar",
  PAUSADO: "Pausar",
  BAJA: "Dar de baja",
};

export function CambiarEstado({
  alumnoId,
  vinculoActual,
  hoy,
}: {
  alumnoId: string;
  vinculoActual: Vinculo;
  hoy: string;
}) {
  const [estado, formAction, pendiente] = useActionState(
    cambiarVinculoFormAction,
    ESTADO_FORMULARIO_INICIAL,
  );
  const [destino, setDestino] = useState<Vinculo | null>(null);
  const errores = estado.errores ?? {};
  const opciones = transicionesPermitidas(vinculoActual);

  // Cuando el cambio se guarda, el formulario se cierra solo y queda a la
  // vista la confirmación. Se DERIVA de la respuesta de la acción (qué
  // estado quedó aplicado) en vez de resetear `destino` dentro de un
  // efecto: un setState en un efecto es un render de más y una regla de
  // lint rota. Sin esto, el formulario quedaba abierto y el dueño no tenía
  // forma de saber si se había guardado — lo detectó el test e2e, no una
  // revisión de código.
  const yaResuelto = estado.ok && estado.vinculoAplicado === destino;

  if (!destino || yaResuelto) {
    return (
      <div className="flex flex-col gap-3">
        {estado.ok && estado.mensaje ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {estado.mensaje}
          </p>
        ) : null}
        {estado.mensaje && !estado.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {estado.mensaje}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {opciones.map((opcion) => (
            <Button
              key={opcion}
              type="button"
              variant={opcion === "BAJA" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setDestino(opcion)}
            >
              {VERBOS[opcion]}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={alumnoId} />
      <input type="hidden" name="vinculo" value={destino} />

      <p className="text-sm text-foreground">
        {destino === "BAJA"
          ? "Registrar la baja del alumno. El registro no se borra: queda como Baja, con su historial."
          : `Cambiar el estado a ${etiquetaVinculo(destino)}.`}
      </p>

      {destino === "PAUSADO" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pausaHasta">Pausado hasta</Label>
          <Input id="pausaHasta" name="pausaHasta" type="date" min={hoy} />
          {errores.pausaHasta ? (
            <p role="alert" className="text-sm text-destructive">
              {errores.pausaHasta}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Opcional si escribís un motivo abajo. Hace falta una de las dos cosas.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nota">{destino === "BAJA" ? "Observación" : "Motivo"}</Label>
        <Textarea id="nota" name="nota" rows={2} maxLength={300} />
        {errores.nota ? (
          <p role="alert" className="text-sm text-destructive">
            {errores.nota}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {destino === "BAJA"
              ? "Opcional. El motivo formal del catálogo se elige en Fase 3."
              : "Opcional si indicaste una fecha."}
          </p>
        )}
      </div>

      {estado.mensaje && !estado.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant={destino === "BAJA" ? "destructive" : "default"}
          disabled={pendiente}
        >
          {pendiente ? "Guardando…" : `Confirmar: ${VERBOS[destino]}`}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDestino(null)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
