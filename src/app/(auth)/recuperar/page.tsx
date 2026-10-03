import type { Metadata } from "next";
import { FormularioDeRecuperacion } from "@/components/features/cuenta/formulario-de-recuperacion";

export const metadata: Metadata = { title: "Recuperar contraseña" };

/**
 * "Olvidé mi contraseña". Manda un enlace al email; el enlace vuelve por
 * /auth/confirm y termina en /cuenta/contrasena con una sesión que deja
 * elegir la nueva. `?error=enlace` es cuando el enlace venció o ya se usó.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <p className="t-rotulo">Recuperar acceso</p>
      <h1 className="t-titulo mt-2 text-[1.625rem]">¿Olvidaste tu contraseña?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Escribí el email con el que entrás y te mandamos un enlace para elegir una nueva.
      </p>
      <FormularioDeRecuperacion enlaceInvalido={error === "enlace"} />
    </div>
  );
}
