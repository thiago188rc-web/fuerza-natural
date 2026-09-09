import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";

/**
 * Layout de las rutas públicas de autenticación (hoy, solo login). Sin
 * nav: todavía no hay sesión, no hay nada que navegar.
 *
 * Si YA hay sesión válida, manda directo al dashboard en vez de mostrar
 * el formulario — sin esto, volver acá con el botón "atrás" del
 * navegador (la entrada de /login queda en el historial) o escribir la
 * URL a mano mostraba el formulario de nuevo aunque la sesión siguiera
 * abierta: se sentía como un cierre de sesión que nunca pasó. La sesión
 * solo se cierra de verdad con el botón "Cerrar sesión" (`(app)/actions.ts`
 * → `logout`), que hace `supabase.auth.signOut()`.
 *
 * Es la primera pantalla que se ve, y por eso lleva la identidad entera:
 * el panel negro con el sello verde a la izquierda es el mismo rail que
 * va a aparecer adentro. Quien entra ya sabe de quién es este sistema
 * antes de escribir su email.
 *
 * El nombre del gimnasio va fijo acá y no sale de la base porque todavía
 * no hay sesión —y sin sesión no hay `gym_id` con qué preguntar—. Es la
 * única pantalla del producto con la marca escrita en el código; cuando
 * haya más de un gimnasio, esto se resuelve por dominio o por invitación.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-rail px-6 py-6 text-rail-foreground sm:px-10 lg:px-12 lg:py-10">
        {/* La retícula del panel, en negativo: la misma trama que hay detrás
            del ciclo del mes, para que el login ya hable el idioma del
            producto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(1 0 0) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 90% 70% at 30% 20%, black 10%, transparent 70%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-verde-claro">
            <span className="font-heading text-[0.9rem] leading-none font-bold tracking-[-0.02em] text-rail">
              FN
            </span>
          </span>
          <span>
            <span className="block font-heading text-[0.95rem] leading-tight font-semibold tracking-[-0.01em]">
              Fuerza Natural
            </span>
            <span className="mt-0.5 block font-mono text-[0.6rem] leading-none tracking-[0.18em] text-rail-muted/80 uppercase">
              Gestión
            </span>
          </span>
        </div>

        <div className="relative mt-12 hidden lg:block">
          <p className="t-titulo max-w-md text-[2rem] leading-[1.08] text-rail-foreground">
            El mes, cubierto.
            <br />
            <span className="text-rail-muted">Cada alumno, cada día.</span>
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-rail-muted">
            Quién tiene el mes pago, a quién hay que cobrarle y qué pasó en el gimnasio — en una
            sola pantalla, sin planillas.
          </p>
        </div>

        <p className="relative mt-10 font-mono text-[0.6rem] tracking-[0.22em] text-rail-muted/50 uppercase lg:mt-0">
          Nexa Gym OS
        </p>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
