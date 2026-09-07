import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Navegación con aspecto de botón.
 *
 * Existe porque `<Button render={<Link/>}>` es incorrecto: Base UI avisa en
 * consola que un componente que actúa como botón necesita un `<button>`
 * nativo, y renderizar un `<a>` en su lugar rompe la semántica (y con ella
 * el comportamiento de teclado y de lectores de pantalla). Un enlace que
 * navega ES un enlace: se abre en pestaña nueva con Ctrl+clic, se copia la
 * dirección, y el navegador ya sabe qué hacer con él.
 *
 * Solo toma prestados los estilos, vía `buttonVariants`.
 */
export function BotonLink({
  href,
  variant,
  size,
  className,
  deshabilitado,
  children,
}: {
  href: string;
  className?: string;
  /** Un enlace no se puede "deshabilitar": se reemplaza por texto inerte. */
  deshabilitado?: boolean;
  children: React.ReactNode;
} & VariantProps<typeof buttonVariants>) {
  const clases = cn(buttonVariants({ variant, size }), className);

  if (deshabilitado) {
    return (
      <span aria-disabled="true" className={cn(clases, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={clases}>
      {children}
    </Link>
  );
}
