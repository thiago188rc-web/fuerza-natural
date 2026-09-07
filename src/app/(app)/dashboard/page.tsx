import { getAuthContext } from "@/lib/auth/context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Placeholder de Fase 0: ningún dato real, ninguna métrica. La bandeja de
 * atención real (situación de pago/actividad calculada, nunca guardada)
 * es Fase 2.
 *
 * Volvemos a llamar getAuthContext() acá en vez de recibir ctx por props
 * del layout: está memoizado con cache() de React por request, así que
 * no repite la query de sesión.
 */
export default async function DashboardPage() {
  const ctx = await getAuthContext();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Bienvenido, {ctx?.nombre}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bandeja de atención</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Acá va la bandeja de atención (Fase 2).
        </CardContent>
      </Card>
    </div>
  );
}
