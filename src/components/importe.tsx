import { cn } from "@/lib/utils";

/**
 * Un importe escrito como lo escribe software financiero serio.
 *
 * El símbolo de moneda va más liviano y más apagado que el valor. Es la
 * regla de Stripe y es lo que separa una cifra creíble de una tipeada:
 * el dato es "1.265.000"; el "$" solo lo califica, y no tiene por qué
 * pesar lo mismo. Siempre tabular, para que una columna de importes no
 * baile cuando cambia un dígito.
 *
 * Es un componente y no una función de formato porque el resultado tiene
 * DOS estilos, y eso ya no es un string.
 */
export function Importe({
  valor,
  moneda = "ARS",
  className,
  simboloClassName,
}: {
  valor: number;
  moneda?: string;
  className?: string;
  simboloClassName?: string;
}) {
  const partes = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).formatToParts(valor);

  const simbolo = partes.find((p) => p.type === "currency")?.value ?? "$";
  const numero = partes
    .filter((p) => p.type !== "currency" && p.type !== "literal")
    .map((p) => p.value)
    .join("");
  const negativo = partes.some((p) => p.type === "minusSign");

  return (
    <span className={cn("tabular inline-flex items-baseline gap-[0.3em]", className)}>
      <span
        aria-hidden
        className={cn("font-normal text-muted-foreground", simboloClassName)}
      >
        {negativo ? `−${simbolo}` : simbolo}
      </span>
      <span>{numero.replace("-", "")}</span>
      <span className="sr-only">{moneda}</span>
    </span>
  );
}
