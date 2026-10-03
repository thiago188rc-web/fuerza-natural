"use client";

import { useActionState } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BotonLink } from "@/components/boton-link";
import { cambiarContrasenaFormAction } from "@/app/(app)/cuenta/actions";
import { ESTADO_CONTRASENA_INICIAL } from "@/app/(app)/cuenta/estado-formulario";
import { LARGO_MINIMO_CONTRASENA } from "@/lib/auth/flujo-contrasena";

/**
 * Cambio de contraseña. Pide la actual salvo cuando se llega desde el
 * enlace de recuperación (lo decide el servidor: `pideActual`).
 */
export function FormularioDeContrasena({ pideActual }: { pideActual: boolean }) {
  const [estado, formAction, pendiente] = useActionState(cambiarContrasenaFormAction, ESTADO_CONTRASENA_INICIAL);
  const errores = estado.errores ?? {};

  if (estado.ok) {
    return (
      <div role="status" className="superficie flex flex-col items-start gap-3 px-6 py-6">
        <span className="grid size-9 place-items-center rounded-full bg-cubierto-suave text-cubierto">
          <Check className="size-4.5" strokeWidth={2.25} />
        </span>
        <p className="text-sm font-medium">{estado.mensaje}</p>
        <p className="text-sm text-muted-foreground">
          {estado.otrasSesionesCerradas
            ? "Se cerraron las sesiones que tenías abiertas en otros dispositivos. Ahí vas a tener que entrar con la contraseña nueva."
            : "La próxima vez que entres, usá la contraseña nueva."}
        </p>
        <BotonLink href="/dashboard" size="sm" className="mt-1">
          Volver al panel
        </BotonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="superficie flex flex-col gap-5 px-6 py-6">
      {pideActual ? (
        <Campo
          id="actual"
          etiqueta="Contraseña actual"
          autoComplete="current-password"
          error={errores.actual}
        />
      ) : (
        <p className="rounded-lg bg-cubierto-suave px-3 py-2 text-sm text-cubierto">
          Entraste con el enlace de recuperación: elegí tu contraseña nueva.
        </p>
      )}

      <Campo
        id="nueva"
        etiqueta="Contraseña nueva"
        autoComplete="new-password"
        minLength={LARGO_MINIMO_CONTRASENA}
        ayuda={`Al menos ${LARGO_MINIMO_CONTRASENA} caracteres. Mejor una frase que no uses en otro lado.`}
        error={errores.nueva}
      />
      <Campo id="repetida" etiqueta="Repetí la contraseña nueva" autoComplete="new-password" error={errores.repetida} />

      {estado.mensaje && !estado.ok ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-descubierto/25 bg-descubierto-suave px-3 py-2 text-sm text-descubierto"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {estado.mensaje}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? (
            <>
              <Loader2 className="animate-spin" />
              Guardando…
            </>
          ) : (
            "Cambiar contraseña"
          )}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  id,
  etiqueta,
  autoComplete,
  minLength,
  ayuda,
  error,
}: {
  id: string;
  etiqueta: string;
  autoComplete: string;
  minLength?: number;
  ayuda?: string;
  error?: string;
}) {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={72}
        aria-invalid={error ? true : undefined}
        className="h-10"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}
