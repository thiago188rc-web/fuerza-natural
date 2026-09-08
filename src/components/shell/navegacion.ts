import {
  Gauge,
  History,
  LogOut,
  Receipt,
  SlidersHorizontal,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * La navegación agrupada por FUNCIÓN, no como una lista plana de seis
 * ítems.
 *
 * "Operación" es lo que el dueño hace todos los días. "Registro" es lo que
 * consulta cuando quiere entender algo que ya pasó. "Sistema" se toca una
 * vez y no se vuelve a mirar.
 *
 * La separación no es estética: le dice al usuario dónde mirar primero, y
 * mantiene cada grupo en dos o tres elementos — el rango en el que un menú
 * se lee de un vistazo en vez de escanearse.
 */

export interface ItemNav {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Para no marcar "Alumnos" como activo estando en "/alumnos/nuevo". */
  exacto?: boolean;
}

export interface GrupoNav {
  titulo: string;
  items: ItemNav[];
}

export const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: "Operación",
    items: [
      { href: "/dashboard", etiqueta: "Panel", icono: Gauge },
      { href: "/alumnos", etiqueta: "Alumnos", icono: Users },
      { href: "/pagos", etiqueta: "Pagos", icono: Receipt },
    ],
  },
  {
    titulo: "Registro",
    items: [
      { href: "/actividad", etiqueta: "Actividad", icono: History },
      { href: "/bajas", etiqueta: "Bajas", icono: LogOut },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      { href: "/importar", etiqueta: "Importar", icono: Upload },
      { href: "/configuracion", etiqueta: "Configuración", icono: SlidersHorizontal },
    ],
  },
];

export function esRutaActiva(pathname: string, item: ItemNav): boolean {
  if (item.exacto) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** El título que muestra la barra superior en móvil. */
export function tituloDeRuta(pathname: string): string {
  for (const grupo of GRUPOS_NAV) {
    for (const item of grupo.items) {
      if (esRutaActiva(pathname, item)) return item.etiqueta;
    }
  }
  return "NEXA";
}

/**
 * El rol, escrito como lo diría una persona. `DUENO` viene sin eñe de la
 * base (los identificadores no llevan acentos ni caracteres especiales),
 * pero mostrarlo así en pantalla se ve como un error de tipeo.
 */
export const ETIQUETA_ROL: Record<string, string> = {
  DUENO: "Dueño",
  STAFF: "Staff",
};
