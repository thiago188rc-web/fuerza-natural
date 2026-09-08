import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { verifyMfaCode } from "./actions";

export default function MfaPage() {
  return (
    <div>
      <p className="t-rotulo">Segundo paso</p>
      <h1 className="t-titulo mt-2 text-[1.625rem]">Verificación en dos pasos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ingresá el código de 6 dígitos de tu app de autenticación.
      </p>

      <form action={verifyMfaCode} className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="tabular h-11 bg-card text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        <Button type="submit" size="lg" className="mt-1 h-10 w-full">
          Verificar
        </Button>
      </form>
    </div>
  );
}
