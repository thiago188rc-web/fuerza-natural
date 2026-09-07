import { randomUUID } from "node:crypto";
import { gyms, plans, appUsers } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";

/**
 * Crea un gimnasio + plan + usuario de prueba con IDs frescos (uuid al
 * azar) y devuelve el AuthContext correspondiente, ya "logueado" como
 * DUENO con aal2 — sin pasar por Supabase (estos tests prueban el kernel
 * de datos/RLS, no el flujo de login; eso es responsabilidad de los
 * tests e2e). No hay limpieza al final a propósito: cada test usa IDs
 * frescos, así que los datos de tests anteriores nunca colisionan ni
 * afectan el resultado — es una base de desarrollo descartable.
 */
export async function seedTestGym(): Promise<{ ctx: AuthContext; planId: string }> {
  const gymId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const planId = randomUUID();
  const email = `test-${userId}@fuerzanatural.test`;

  const ctxBootstrap: AuthContext = {
    userId,
    gymId,
    rol: "DUENO",
    aal: "aal2",
    email,
    nombre: "Dueño de prueba",
  };

  await withTenantTx(ctxBootstrap, async (tx) => {
    await tx.insert(gyms).values({ id: gymId, nombre: `Gimnasio de prueba ${gymId.slice(0, 8)}` });
    await tx.insert(plans).values({ id: planId, gymId, nombre: "3 días", diasSemana: 3, precioActual: "10000" });
    await tx
      .insert(appUsers)
      .values({ id: userId, gymId, authUserId, email, nombre: "Dueño de prueba", rol: "DUENO" });
  });

  return { ctx: ctxBootstrap, planId };
}
