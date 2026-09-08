"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LogOut } from "lucide-react";
import { esRutaActiva, ETIQUETA_ROL, GRUPOS_NAV } from "./navegacion";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * EL RAIL DE OPERACIONES.
 *
 * Negro contra un espacio de trabajo claro. No es una preferencia
 * estética: separa lo que NUNCA cambia (dónde estoy, quién soy, a dónde
 * puedo ir) de lo que cambia todo el tiempo (el contenido). Esa
 * estabilidad es la mitad de la sensación de "herramienta profesional";
 * la otra mitad es que el rail no se mueva nunca, ni haga scroll con el
 * contenido.
 *
 * LA JERARQUÍA DE MARCA. Arriba va EL GIMNASIO —su marca, su nombre—
 * porque el dueño abre el sistema de SU gimnasio, no "un software". NEXA
 * firma abajo, chico, como la tecnología que lo hace andar. Y como la
 * marca sale del nombre configurado, otro gimnasio tendrá la suya sin
 * tocar una línea.
 *
 * EL TEXTO ESTÁ APAGADO A PROPÓSITO. El rail acompaña, no compite: solo
 * el ítem activo llega a blanco pleno, y el verde de marca aparece
 * únicamente en el sello del gimnasio y en la barra del ítem activo —
 * que SE DESLIZA de una sección a otra (`layoutId`) en vez de parpadear.
 * Un solo objeto que se mueve, no dos que aparecen y desaparecen.
 */
export function Rail({
  nombre,
  rol,
  gimnasio,
  onNavegar,
  cerrarSesion,
}: {
  nombre: string;
  rol: string;
  gimnasio: string;
  onNavegar?: () => void;
  cerrarSesion: React.ReactNode;
}) {
  const pathname = usePathname();
  const quieto = useReducedMotion();

  return (
    <div className="flex h-full flex-col bg-rail text-rail-foreground">
      <Marca gimnasio={gimnasio} />

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 pt-1">
        {GRUPOS_NAV.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="px-2.5 pb-2 font-mono text-[0.6rem] tracking-[0.2em] text-rail-muted/60 uppercase">
              {grupo.titulo}
            </p>
            <ul className="space-y-px">
              {grupo.items.map((item) => {
                const activo = esRutaActiva(pathname, item);
                const Icono = item.icono;

                return (
                  <li key={item.href} className="relative">
                    {activo ? (
                      <motion.span
                        layoutId={quieto ? undefined : "nav-activo"}
                        aria-hidden
                        className="absolute inset-0 rounded-md bg-rail-hover"
                        transition={{ duration: DURACION.normal, ease: SALIDA }}
                      />
                    ) : null}

                    <Link
                      href={item.href}
                      onClick={onNavegar}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] transition-colors duration-150",
                        "focus-visible:ring-2 focus-visible:ring-verde-claro focus-visible:outline-none",
                        activo
                          ? "font-medium text-rail-foreground"
                          : "text-rail-muted hover:bg-rail-hover/60 hover:text-rail-foreground",
                      )}
                    >
                      <Icono
                        className={cn(
                          "size-4 shrink-0 transition-colors duration-150",
                          activo ? "text-verde-claro" : "text-rail-muted/80",
                        )}
                        strokeWidth={1.75}
                      />
                      {item.etiqueta}
                      {activo ? (
                        <motion.span
                          layoutId={quieto ? undefined : "nav-marca"}
                          aria-hidden
                          className="absolute top-1/2 -left-3 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-verde-claro"
                          transition={{ duration: DURACION.normal, ease: SALIDA }}
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Cuenta nombre={nombre} rol={rol} cerrarSesion={cerrarSesion} />
    </div>
  );
}

/**
 * El sello del gimnasio. Las iniciales sobre el verde de marca: es el
 * único bloque de color sólido del rail, y por eso funciona como ancla.
 */
function Marca({ gimnasio }: { gimnasio: string }) {
  // "Fuerza Natural · DEMO" → "FN". Solo palabras con letras: el "·" y
  // los sufijos no son parte del nombre que la gente reconoce.
  const palabras = gimnasio.split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  const sello = palabras
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-6">
      <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-verde-claro">
        <span className="font-heading text-[0.8rem] leading-none font-bold tracking-[-0.02em] text-rail">
          {sello || "G"}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-[0.9rem] leading-tight font-semibold tracking-[-0.01em]">
          {gimnasio}
        </span>
        <span className="mt-0.5 block font-mono text-[0.6rem] leading-none tracking-[0.18em] text-rail-muted/70 uppercase">
          Gestión
        </span>
      </span>
    </div>
  );
}

function Cuenta({
  nombre,
  rol,
  cerrarSesion,
}: {
  nombre: string;
  rol: string;
  cerrarSesion: React.ReactNode;
}) {
  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="mt-6 border-t border-rail-border p-3">
      <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
        {/* Hairline, sin relleno de color: un avatar de color por persona es
            la clase de adorno que un producto serio va sacando con el
            tiempo, no agregando. */}
        <span className="grid size-7 shrink-0 place-items-center rounded-full font-mono text-[0.65rem] text-rail-foreground ring-1 ring-rail-border">
          {iniciales || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] leading-tight">{nombre}</span>
          <span className="block text-[0.68rem] leading-tight text-rail-muted">
            {ETIQUETA_ROL[rol] ?? rol}
          </span>
        </span>
        {cerrarSesion}
      </div>

      {/* La firma de la tecnología. Chica, al pie, siempre presente. */}
      <p className="mt-3 px-1.5 font-mono text-[0.58rem] tracking-[0.22em] text-rail-muted/50 uppercase">
        Nexa Gym OS
      </p>
    </div>
  );
}

/** El botón de salir. Va como prop porque su acción es de servidor. */
export function BotonCerrarSesion() {
  return (
    <button
      type="submit"
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="grid size-7 shrink-0 place-items-center rounded-md text-rail-muted transition-colors duration-150 hover:bg-rail-hover hover:text-rail-foreground focus-visible:ring-2 focus-visible:ring-verde-claro focus-visible:outline-none"
    >
      <LogOut className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}
