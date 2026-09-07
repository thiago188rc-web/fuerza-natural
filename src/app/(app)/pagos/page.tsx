import { Card, CardContent } from "@/components/ui/card";

export default function PagosPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Pagos</h1>
      <Card>
        <CardContent className="text-sm text-muted-foreground">Próximamente.</CardContent>
      </Card>
    </div>
  );
}
