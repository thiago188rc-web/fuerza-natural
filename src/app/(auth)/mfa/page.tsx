import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { verifyMfaCode } from "./actions";

export default function MfaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificación en dos pasos</CardTitle>
        <CardDescription>Ingresá el código de 6 dígitos de tu app de autenticación.</CardDescription>
      </CardHeader>
      <form action={verifyMfaCode}>
        <CardContent>
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
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full">
            Verificar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
