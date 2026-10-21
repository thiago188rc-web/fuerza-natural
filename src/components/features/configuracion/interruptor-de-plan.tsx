"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { cambiarActivoDePlanAction } from "@/app/(app)/configuracion/actions";

/**
 * Prende o apaga un plan para el alta de alumnos nuevos. Apagarlo no lo
 * borra: los alumnos que ya lo tienen asignado lo conservan tal cual, y
 * sus pagos pasados no se tocan — es la misma idea que ya separa "precio
 * configurado" de "pagos ya registrados".
 */
export function InterruptorDePlan({ planId, activo }: { planId: string; activo: boolean }) {
  const [marcado, setMarcado] = useState(activo);
  const [, iniciar] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
      {marcado ? "Visible al dar de alta" : "Oculto al dar de alta"}
      <Switch
        size="sm"
        checked={marcado}
        onCheckedChange={(valor) => {
          setMarcado(valor);
          iniciar(async () => {
            const resultado = await cambiarActivoDePlanAction(planId, valor);
            if (!resultado.ok) setMarcado(!valor);
          });
        }}
      />
    </label>
  );
}
