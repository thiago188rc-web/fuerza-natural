import { MessageCircle } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Enlace a WhatsApp con el mensaje ya escrito. No envía nada por sí solo
 * —abre WhatsApp (app o web) con el número y el texto cargados, y quien
 * usa el gimnasio aprieta "Enviar"—, así que no hace falta ninguna cuenta
 * de API ni credencial.
 *
 * Si el alumno no tiene teléfono cargado, no renderiza nada: un botón
 * deshabilitado acá sería ruido sin ninguna acción posible detrás.
 */
export function BotonWhatsapp({
  telefono,
  mensaje,
  variant = "outline",
  size,
  className,
  children = "Enviar WhatsApp",
  "aria-label": ariaLabel,
}: {
  telefono: string | null;
  mensaje: string;
  className?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
} & VariantProps<typeof buttonVariants>) {
  if (!telefono) return null;

  // `telefono` ya está en E.164 (el CHECK de la base lo exige): solo hay
  // que sacarle el "+" para armar el enlace.
  const numero = telefono.replace(/\D/g, "");
  const href = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      <MessageCircle />
      {children}
    </a>
  );
}
