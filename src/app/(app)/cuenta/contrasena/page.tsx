import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requisitosDeContrasenaQuery } from "@/use-cases/cuenta/contrasena";
import { FormularioDeContrasena } from "@/components/features/cuenta/formulario-de-contrasena";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Contraseña" };

/**
 * Cambiar la contraseña. También es donde aterriza el enlace de
 * recuperación (`/auth/confirm` → acá), con una sesión que permite elegir
 * la nueva sin escribir la actual.
 */
export default async function ContrasenaPage() {
  const requisitos = await requisitosDeContrasenaQuery();

  if (!requisitos.ok) {
    if (requisitos.kind === "FORBIDDEN") redirect("/login");
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos abrir esta pantalla</AlertTitle>
        <AlertDescription>
          {requisitos.kind === "CONFLICT" ? requisitos.message : "Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Aparece>
        <div>
          <p className="t-rotulo">Tu cuenta</p>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Contraseña</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Al cambiarla se cierran las sesiones que tengas abiertas en otros dispositivos.
          </p>
        </div>
      </Aparece>

      <Aparece retraso={0.04}>
        {requisitos.data.disponible ? (
          <FormularioDeContrasena pideActual={requisitos.data.pideActual} />
        ) : (
          <Alert>
            <AlertTitle>No disponible en este entorno</AlertTitle>
            <AlertDescription>
              Estás usando la sesión de desarrollo, sin Supabase configurado: no hay una contraseña
              real que cambiar. En el sistema publicado esta pantalla funciona normalmente.
            </AlertDescription>
          </Alert>
        )}
      </Aparece>
    </div>
  );
}
