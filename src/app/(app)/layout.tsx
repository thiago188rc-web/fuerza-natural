import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/alumnos", label: "Alumnos" },
  { href: "/pagos", label: "Pagos" },
  { href: "/importar", label: "Importar" },
  { href: "/configuracion", label: "Configuración" },
] as const;

/**
 * Layout de toda ruta protegida. Este es EL lugar (además de cada Server
 * Action vía withAuth) donde se decide si hay sesión válida — SPEC V1
 * §3.4: getAuthContext() es la única fuente de verdad, nunca una cookie
 * leída a mano ni el middleware (src/proxy.ts solo refresca sesión y pone
 * headers, nunca autoriza).
 *
 * Cache-Control de la respuesta ya lo pone src/proxy.ts globalmente, no
 * hace falta repetirlo acá.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-sm font-semibold tracking-wide text-foreground">
              FUERZA NATURAL
            </span>
            <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-foreground">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{ctx.nombre}</span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
