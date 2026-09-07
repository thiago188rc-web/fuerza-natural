import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold text-foreground">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">La página que buscás no existe.</p>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
