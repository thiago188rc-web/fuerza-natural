/**
 * Layout de las rutas públicas de autenticación (login, mfa). Sin nav:
 * todavía no hay sesión, no hay nada que navegar. Solo centra el
 * contenido — el layout protegido en src/app/(app)/layout.tsx es el que
 * tiene navegación real.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
