"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu } from "lucide-react";
import { Rail } from "./rail";
import { tituloDeRuta } from "./navegacion";

/**
 * EL MARCO EN PANTALLA CHICA.
 *
 * En desktop el rail está siempre presente porque hay espacio de sobra.
 * En un teléfono ese mismo rail se comería un tercio del ancho, así que
 * se convierte en un cajón — pero es EL MISMO componente, no una segunda
 * navegación escrita aparte. Un solo lugar donde agregar una sección.
 *
 * La barra de arriba no repite el logo por decoración: en móvil el
 * usuario pierde de vista dónde está apenas hace scroll, y el título de
 * sección es lo que lo ancla.
 *
 * El cajón usa el Dialog de Base UI y no un div con `position: fixed`
 * porque trae lo que un menú necesita para ser usable: foco atrapado,
 * cierre con Escape, scroll del fondo bloqueado y `aria-modal`. Eso no se
 * reimplementa a mano.
 */
export function BarraMovil({
  nombre,
  rol,
  gimnasio,
  cerrarSesion,
}: {
  nombre: string;
  rol: string;
  gimnasio: string;
  cerrarSesion: React.ReactNode;
}) {
  const pathname = usePathname();

  // El cajón guarda EN QUÉ RUTA se abrió, y está abierto solo mientras
  // seguimos ahí. Así navegar lo cierra solo —incluso con el botón atrás
  // del teléfono, que no pasa por ningún onClick— sin un efecto que
  // sincronice estado con estado.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === pathname;
  const setAbierto = (v: boolean) => setAbiertoEn(v ? pathname : null);

  const sello = gimnasio
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "G";

  return (
    <header className="pegajosa sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
      <DialogPrimitive.Root open={abierto} onOpenChange={setAbierto}>
        <DialogPrimitive.Trigger
          render={
            <button
              type="button"
              aria-label="Abrir navegación"
              className="-ml-2 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
            />
          }
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[oklch(0.148_0.009_162_/_0.55)] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[82vw] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
            <DialogPrimitive.Title className="sr-only">Navegación</DialogPrimitive.Title>
            <Rail
              nombre={nombre}
              rol={rol}
              gimnasio={gimnasio}
              cerrarSesion={cerrarSesion}
              onNavegar={() => setAbierto(false)}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <span className="font-heading text-[0.95rem] font-semibold tracking-[-0.01em]">
        {tituloDeRuta(pathname)}
      </span>

      {/* El sello del gimnasio, el mismo del rail. */}
      <span className="ml-auto grid size-7 place-items-center rounded-[6px] bg-verde-claro">
        <span className="font-heading text-[0.7rem] leading-none font-bold tracking-[-0.02em] text-rail">
          {sello}
        </span>
      </span>
    </header>
  );
}
