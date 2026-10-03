"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedirRecuperacion, type EstadoRecuperacion } from "@/app/(auth)/recuperar/actions";
import { MENSAJES_CONTRASENA } from "@/lib/auth/flujo-contrasena";

const ESTADO_INICIAL: EstadoRecuperacion = {};

export function FormularioDeRecuperacion({ enlaceInvalido }: { enlaceInvalido: boolean }) {
  const [estado, formAction, pendiente] = useActionState(pedirRecuperacion, ESTADO_INICIAL);

  if (estado.enviado) {
    return (
      <div role="status" className="mt-8 flex flex-col gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-cubierto-suave text-cubierto">
          <MailCheck className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-sm">{MENSAJES_CONTRASENA.recuperacionEnviada}</p>
        <p className="text-sm text-muted-foreground">El enlace vence en una hora y sirve una sola vez.</p>
        <Link href="/login" className="mt-2 text-sm font-medium underline underline-offset-2">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  const error = estado.error ?? (enlaceInvalido ? MENSAJES_CONTRASENA.enlaceInvalido : null);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10 bg-card" />
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-descubierto/25 bg-descubierto-suave px-3 py-2 text-sm text-descubierto"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pendiente} className="mt-1 h-10 w-full">
        {pendiente ? (
          <>
            <Loader2 className="animate-spin" />
            Enviando…
          </>
        ) : (
          "Enviarme el enlace"
        )}
      </Button>

      <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-2 hover:underline">
        Volver a ingresar
      </Link>
    </form>
  );
}
