import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { students, payments, activityLog } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { crearAlumno, buscarAlumnoPorId } from "@/data/repositories/students-repo";
import { seedTestGym } from "./helpers";

/**
 * EL test de seguridad más importante del sistema (SPEC V1 §16, §17,
 * plan Fase 0 §17 del brief). Corre contra Postgres real vía
 * DATABASE_URL — se salta entera si esa variable no está configurada
 * (por ejemplo, un checkout limpio sin Postgres local todavía).
 */
describe.skipIf(!process.env.DATABASE_URL)("aislamiento por gym_id (RLS real)", () => {
  it("un gimnasio no puede leer un alumno de otro gimnasio por su ID exacto", async () => {
    const { ctx: gymA } = await seedTestGym();
    const { ctx: gymB, planId: planB } = await seedTestGym();

    const alumnoB = await withTenantTx(gymB, (tx) =>
      crearAlumno(tx, gymB, {
        nombre: "Ana",
        apellido: "Gómez",
        telefono: "+541155550002",
        planId: planB,
        fechaAltaOriginal: "2026-01-01",
        vinculoDesde: "2026-01-01",
      }),
    );

    const desdeGymA = await withTenantTx(gymA, (tx) => buscarAlumnoPorId(tx, gymA, alumnoB.id));
    expect(desdeGymA).toBeNull();

    const desdeGymB = await withTenantTx(gymB, (tx) => buscarAlumnoPorId(tx, gymB, alumnoB.id));
    expect(desdeGymB?.id).toBe(alumnoB.id);
  });

  it("un UPDATE contra un alumno de otro gimnasio afecta 0 filas, nunca lanza ni pisa datos", async () => {
    const { ctx: gymA } = await seedTestGym();
    const { ctx: gymB, planId: planB } = await seedTestGym();

    const alumnoB = await withTenantTx(gymB, (tx) =>
      crearAlumno(tx, gymB, {
        nombre: "Ana",
        apellido: "Gómez",
        telefono: "+541155550003",
        planId: planB,
        fechaAltaOriginal: "2026-01-01",
        vinculoDesde: "2026-01-01",
      }),
    );

    await withTenantTx(gymA, async (tx) => {
      const result = await tx
        .update(students)
        .set({ notas: "intento cruzado" })
        .where(eq(students.id, alumnoB.id));
      expect(result.count).toBe(0);
    });

    const intacto = await withTenantTx(gymB, (tx) => buscarAlumnoPorId(tx, gymB, alumnoB.id));
    expect(intacto?.notas).toBeNull();
  });

  it("sin contexto de tenant seteado, cualquier lectura falla cerrado (0 filas, no todas)", async () => {
    await seedTestGym();
    await seedTestGym();

    // withTenantTx SIEMPRE setea el contexto — para probar el caso "me
    // olvidé de setearlo" hace falta abrir una transacción cruda, sin el
    // wrapper. Es exactamente el bug que un desarrollador podría cometer.
    const { getDb } = await import("@/data/db");
    const count = await getDb().transaction(async (tx) => {
      const rows = await tx.select().from(students);
      return rows.length;
    });
    expect(count).toBe(0);
  });

  it("payments es inmutable salvo anulación — un UPDATE de monto se rechaza", async () => {
    const { ctx: gymA, planId: planA } = await seedTestGym();
    const alumno = await withTenantTx(gymA, (tx) =>
      crearAlumno(tx, gymA, {
        nombre: "Juan",
        apellido: "Pérez",
        telefono: "+541155550004",
        planId: planA,
        fechaAltaOriginal: "2026-01-01",
        vinculoDesde: "2026-01-01",
      }),
    );

    const pagoId = randomUUID();
    await withTenantTx(gymA, (tx) =>
      tx.insert(payments).values({
        id: pagoId,
        gymId: gymA.gymId,
        studentId: alumno.id,
        fechaPago: "2026-09-01",
        planId: planA,
        planDiasSnapshot: 3,
        planNombreSnapshot: "3 días",
        monto: "10000",
        registradoPor: gymA.userId,
      }),
    );

    await expect(
      withTenantTx(gymA, (tx) => tx.update(payments).set({ monto: "999999" }).where(eq(payments.id, pagoId))),
    ).rejects.toThrow();
  });

  it("activity_log es append-only — UPDATE y DELETE se rechazan aunque sea del propio gimnasio", async () => {
    const { ctx: gymA } = await seedTestGym();
    const logId = randomUUID();

    await withTenantTx(gymA, (tx) =>
      logActivity(tx, gymA, { accion: "student.created", entidad: "student", entidadId: logId, resumen: "prueba" }),
    );

    await expect(
      withTenantTx(gymA, (tx) => tx.update(activityLog).set({ resumen: "modificado" }).where(eq(activityLog.entidadId, logId))),
    ).rejects.toThrow();

    await expect(
      withTenantTx(gymA, (tx) => tx.delete(activityLog).where(eq(activityLog.entidadId, logId))),
    ).rejects.toThrow();
  });
});
