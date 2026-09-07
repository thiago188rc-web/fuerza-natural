"use client";

import { Button } from "@/components/ui/button";

/**
 * Error boundary de toda la app (no cubre errores del root layout mismo
 * — para eso haría falta un global-error.tsx separado, fuera de alcance
 * de Fase 0). Nunca mostramos error.message al usuario: puede traer
 * detalle interno (SQL, stack, nombres de columnas) — solo va a consola
 * para diagnóstico, y la UI muestra siempre el mismo texto genérico.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-foreground">Ocurrió un error. Intentá de nuevo.</p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
