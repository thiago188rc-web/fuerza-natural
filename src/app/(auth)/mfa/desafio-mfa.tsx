"use client";

import { useActionState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { verificarMfa, type VerificarState } from "./actions";

const estadoInicial: VerificarState = {};

/** El paso de todos los días: la app ya está configurada, falta el código. */
export function DesafioMfa({ factorId }: { factorId: string }) {
  const [estado, enviar, pendiente] = useActionState(verificarMfa, estadoInicial);

  return (
    <div>
      <p className="t-rotulo">Segundo paso</p>
      <h1 className="t-titulo mt-2 text-[1.625rem]">Verificación en dos pasos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ingresá el código de 6 dígitos de tu app de autenticación.
      </p>

      <form action={enviar} className="mt-8 flex flex-col gap-5">
        <input type="hidden" name="factorId" value={factorId} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            className="tabular h-11 bg-card text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>

        {estado.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-descubierto/25 bg-descubierto-suave px-3 py-2 text-sm text-descubierto"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {estado.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pendiente} className="mt-1 h-10 w-full">
          {pendiente ? (
            <>
              <Loader2 className="animate-spin" />
              Verificando…
            </>
          ) : (
            "Verificar"
          )}
        </Button>
      </form>
    </div>
  );
}
