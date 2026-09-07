import { Badge } from "@/components/ui/badge";
import { etiquetaVinculo, type Vinculo } from "@/domain/alumnos/vinculo";
import { cn } from "@/lib/utils";

/**
 * El estado del vínculo tiene que leerse de un vistazo en una tabla de 200
 * filas — por eso es el único lugar del sistema con color con significado,
 * en una interfaz que por lo demás es deliberadamente neutra. El texto
 * ("Activo"/"Pausado"/"Baja") va siempre junto al color: nadie tiene que
 * depender de distinguir verde de ámbar para entender la pantalla.
 */
const ESTILOS: Record<Vinculo, string> = {
  ACTIVO: "border-emerald-600/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  PAUSADO: "border-amber-600/25 bg-amber-500/12 text-amber-700 dark:text-amber-400",
  BAJA: "border-border bg-muted text-muted-foreground",
};

export function EstadoBadge({ vinculo, className }: { vinculo: Vinculo; className?: string }) {
  return (
    <Badge variant="outline" className={cn(ESTILOS[vinculo], className)}>
      {etiquetaVinculo(vinculo)}
    </Badge>
  );
}
