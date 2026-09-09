"use client";

import { useActionState } from "react";
import { CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { enrolarMfa, verificarMfa, type EnrolarState, type VerificarState } from "./actions";

const estadoEnrolar: EnrolarState = {};
const estadoVerificar: VerificarState = {};

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-descubierto/25 bg-descubierto-suave px-3 py-2 text-sm text-descubierto"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      {mensaje}
    </p>
  );
}

/**
 * La primera vez: configurar la app de autenticación.
 *
 * El factor se crea con un click explícito, no al abrir la pantalla: crear
 * un factor es una escritura, y dispararla en cada visita dejaría factores
 * a medio configurar cada vez que alguien recarga.
 */
export function EnrolarMfa() {
  const [generado, generar, generando] = useActionState<EnrolarState, FormData>(
    async () => enrolarMfa(),
    estadoEnrolar,
  );
  const [verificado, verificar, verificando] = useActionState(verificarMfa, estadoVerificar);

  const listoParaEscanear = Boolean(generado.factorId && generado.qr);

  return (
    <div>
      <p className="t-rotulo">Un paso más</p>
      <h1 className="t-titulo mt-2 text-[1.625rem]">Configurá la verificación en dos pasos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tu cuenta administra los datos del gimnasio, así que además de la contraseña necesita un
        código que cambia cada 30 segundos. Vas a necesitar una app de autenticación: Google
        Authenticator, Authy o 1Password, entre otras.
      </p>

      {!listoParaEscanear ? (
        <form action={generar} className="mt-8 flex flex-col gap-5">
          {generado.error ? <Aviso mensaje={generado.error} /> : null}
          <Button type="submit" size="lg" disabled={generando} className="h-10 w-full">
            {generando ? (
              <>
                <Loader2 className="animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <ShieldCheck />
                Empezar
              </>
            )}
          </Button>
        </form>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="font-medium">1.</span> Escaneá este código con tu app de
              autenticación.
            </p>
            <div className="flex justify-center rounded-xl border border-border bg-card p-4">
              {/* El QR lo genera Supabase como SVG en un data URI: no sale a
                  la red, no pasa por el optimizador de imágenes y la CSP ya
                  permite `img-src data:`. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generado.qr}
                alt="Código QR para configurar la verificación en dos pasos"
                width={180}
                height={180}
                className="size-[180px]"
              />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none">
                No puedo escanearlo
              </summary>
              <p className="mt-2">Cargá esta clave a mano en tu app:</p>
              <code className="mt-2 block rounded-lg border border-border bg-hundido px-3 py-2 font-mono text-[0.8125rem] break-all text-foreground select-all">
                {generado.secret}
              </code>
            </details>
          </div>

          <form action={verificar} className="flex flex-col gap-5">
            <input type="hidden" name="factorId" value={generado.factorId} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">
                <span className="font-medium">2.</span> Ingresá el código que muestra la app
              </Label>
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

            {verificado.error ? <Aviso mensaje={verificado.error} /> : null}

            <Button type="submit" size="lg" disabled={verificando} className="mt-1 h-10 w-full">
              {verificando ? (
                <>
                  <Loader2 className="animate-spin" />
                  Verificando…
                </>
              ) : (
                "Activar y entrar"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
