import { redirect } from "next/navigation";
import { getAuthContext, requiresAal2 } from "@/lib/auth/context";
import { contextoDelGimnasio } from "@/use-cases/gimnasio/contexto";
import { BarraMovil } from "@/components/shell/barra-movil";
import { BotonCerrarSesion, Rail } from "@/components/shell/rail";
import { logout } from "./actions";

/**
 * Layout de toda ruta protegida. Este es EL lugar (además de cada Server
 * Action vía withAuth) donde se decide si hay sesión válida — SPEC V1
 * §3.4: getAuthContext() es la única fuente de verdad, nunca una cookie
 * leída a mano ni el middleware (src/proxy.ts solo refresca sesión y pone
 * headers, nunca autoriza).
 *
 * Cache-Control de la respuesta ya lo pone src/proxy.ts globalmente, no
 * hace falta repetirlo acá.
 *
 * La forma del marco: rail fijo a la izquierda en desktop, cajón en
 * pantalla chica. El rail NO hace scroll con el contenido — es lo que
 * hace que la aplicación se sienta una herramienta y no una web.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (requiresAal2(ctx.rol) && ctx.aal !== "aal2") redirect("/mfa");

  // Si la configuración no se puede leer, el marco igual tiene que
  // dibujarse: el usuario está autenticado y merece ver la interfaz con
  // el error adentro, no una pantalla en blanco.
  const contexto = await contextoDelGimnasio();
  const gimnasio = contexto.ok ? contexto.data.nombre : "Gimnasio";

  const cerrarSesion = (
    <form action={logout}>
      <BotonCerrarSesion />
    </form>
  );

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] border-r border-rail-border lg:block">
        <Rail nombre={ctx.nombre} rol={ctx.rol} gimnasio={gimnasio} cerrarSesion={cerrarSesion} />
      </aside>

      <BarraMovil
        nombre={ctx.nombre}
        rol={ctx.rol}
        gimnasio={gimnasio}
        cerrarSesion={cerrarSesion}
      />

      {/* El ancho máximo es generoso a propósito: el dueño trabaja en una
          PC y una tabla de alumnos apretada a 1024px desperdicia la
          pantalla que ya tiene. */}
      <main className="lg:pl-[16.5rem]">
        <div className="mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
