"use client";

import { useActionState, useEffect } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

/**
 * El formulario de ingreso. Sin tarjeta alrededor: el panel de la
 * izquierda ya enmarca la pantalla, y una caja dentro de otra caja es
 * exactamente el aspecto de plantilla que este producto evita.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  const isSubmitting = pending || Boolean(state.redirectTo);

  return (
    <div>
      <p className="t-rotulo">Ingresar</p>
      <h1 className="t-titulo mt-2 text-[1.625rem]">Bienvenido de vuelta</h1>
      <p className="mt-2 text-sm text-muted-foreground">Entrá con tu email y contraseña.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 bg-card"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 bg-card"
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-descubierto/25 bg-descubierto-suave px-3 py-2 text-sm text-descubierto"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 h-10 w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Ingresando…
            </>
          ) : (
            "Ingresar"
          )}
        </Button>
      </form>
    </div>
  );
}
