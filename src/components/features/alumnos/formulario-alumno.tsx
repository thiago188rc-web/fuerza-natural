"use client";

import { useActionState } from "react";
import { BotonLink } from "@/components/boton-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADO_FORMULARIO_INICIAL,
  type EstadoFormulario,
} from "@/app/(app)/alumnos/estado-formulario";

export interface PlanOpcion {
  id: string;
  nombre: string;
  diasSemana: number;
}

export interface ValoresAlumno {
  id?: string;
  nombre: string;
  apellido: string;
  telefono: string;
  planId: string;
  fechaAltaOriginal: string;
  notas: string;
}

interface Props {
  accion: (prev: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  valores: ValoresAlumno;
  planes: PlanOpcion[];
  /** Fecha máxima seleccionable: "hoy" en la TZ del gimnasio, calculado en el servidor. */
  hoy: string;
  textoEnviar: string;
  hrefCancelar: string;
}

/**
 * Un solo formulario para alta y edición: los campos y sus reglas son los
 * mismos, y tener dos copias garantiza que dentro de tres meses una tenga
 * una validación que la otra no.
 *
 * El estado NO se edita acá a propósito — se cambia desde la ficha, con su
 * propia acción y su propio registro en el historial.
 *
 * La validación que cuenta es la del servidor: estos `required` y
 * `maxLength` existen para que el navegador avise rápido, no para
 * autorizar nada. Los errores que se muestran vienen siempre del `Result`
 * del caso de uso.
 */
export function FormularioAlumno({
  accion,
  valores,
  planes,
  hoy,
  textoEnviar,
  hrefCancelar,
}: Props) {
  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_FORMULARIO_INICIAL);
  const errores = estado.errores ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      {estado.mensaje && !estado.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.mensaje}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre" error={errores.nombre} requerido>
          <Input
            id="nombre"
            name="nombre"
            defaultValue={valores.nombre}
            required
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(errores.nombre)}
          />
        </Campo>

        <Campo id="apellido" etiqueta="Apellido" error={errores.apellido} requerido>
          <Input
            id="apellido"
            name="apellido"
            defaultValue={valores.apellido}
            required
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(errores.apellido)}
          />
        </Campo>

        <Campo
          id="telefono"
          etiqueta="Teléfono"
          error={errores.telefono}
          ayuda="Opcional. Formato internacional, ej: +5491155551234"
        >
          <Input
            id="telefono"
            name="telefono"
            type="tel"
            defaultValue={valores.telefono}
            placeholder="+54 9 11 5555 1234"
            autoComplete="off"
            aria-invalid={Boolean(errores.telefono)}
          />
        </Campo>

        <Campo id="planId" etiqueta="Plan" error={errores.planId} requerido>
          <Select name="planId" defaultValue={valores.planId || undefined} items={planes.map((p) => ({ value: p.id, label: p.nombre }))}>
            <SelectTrigger id="planId" className="w-full" aria-invalid={Boolean(errores.planId)}>
              <SelectValue placeholder="Elegí un plan" />
            </SelectTrigger>
            <SelectContent>
              {planes.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <Campo
          id="fechaAltaOriginal"
          etiqueta="Fecha de alta"
          error={errores.fechaAltaOriginal}
          ayuda="Cuándo empezó en el gimnasio. No puede ser futura."
          requerido
        >
          <Input
            id="fechaAltaOriginal"
            name="fechaAltaOriginal"
            type="date"
            max={hoy}
            defaultValue={valores.fechaAltaOriginal || hoy}
            required
            aria-invalid={Boolean(errores.fechaAltaOriginal)}
          />
        </Campo>
      </div>

      <Campo
        id="notas"
        etiqueta="Observaciones"
        error={errores.notas}
        ayuda="Opcional. Lo que el dueño necesite recordar de esta persona."
      >
        <Textarea
          id="notas"
          name="notas"
          rows={3}
          maxLength={1000}
          defaultValue={valores.notas}
          aria-invalid={Boolean(errores.notas)}
        />
      </Campo>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoEnviar}
        </Button>
        <BotonLink href={hrefCancelar} variant="ghost">
          Cancelar
        </BotonLink>
      </div>
    </form>
  );
}

function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  requerido,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {etiqueta}
        {requerido ? <span className="text-muted-foreground"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}
