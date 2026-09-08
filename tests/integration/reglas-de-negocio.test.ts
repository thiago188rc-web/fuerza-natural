import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { gymSettings, paymentPeriods, payments, plans, students } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { crearAlumno } from "@/data/repositories/students-repo";
import { seedTestGym } from "./helpers";

/**
 * Las reglas que Diego confirmó (docs/REGLAS-DE-NEGOCIO.md), verificadas
 * contra Postgres real.
 *
 * Fase 2 (Pagos) todavía NO existe, así que acá no se prueba ningún caso
 * de uso: se prueba que el MODELO DE DATOS pueda representar las reglas
 * fielmente y rechace lo que las viola. Cuando Fase 2 se implemente, estos
 * tests son la red que impide que se construya sobre una interpretación
 * equivocada.
 */

describe.skipIf(!process.env.DATABASE_URL)("reglas de negocio confirmadas", () => {
  describe("§1 — LIBRE es un plan propio, no un alias de 5 días", () => {
    it("un plan puede declararse LIBRE, con dias_semana leído como piso", async () => {
      const { ctx } = await seedTestGym();

      const [libre] = await withTenantTx(ctx, (tx) =>
        tx
          .insert(plans)
          .values({
            gymId: ctx.gymId,
            nombre: "LIBRE",
            diasSemana: 5,
            acceso: "LIBRE",
            precioActual: null,
            orden: 5,
          })
          .returning(),
      );

      expect(libre.acceso).toBe("LIBRE");
      expect(libre.diasSemana).toBe(5);
    });

    it("la base rechaza un tipo de acceso inventado", async () => {
      const { ctx } = await seedTestGym();

      await expect(
        withTenantTx(ctx, (tx) =>
          tx.insert(plans).values({
            gymId: ctx.gymId,
            nombre: "Inventado",
            diasSemana: 3,
            acceso: "ILIMITADO_PREMIUM",
            precioActual: "1",
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("§2 — precios configurables y 'todavía no confirmado'", () => {
    it("un plan puede existir SIN precio: es el caso real de LIBRE hoy", async () => {
      const { ctx } = await seedTestGym();

      const [sinPrecio] = await withTenantTx(ctx, (tx) =>
        tx
          .insert(plans)
          .values({ gymId: ctx.gymId, nombre: "Sin precio", diasSemana: 5, precioActual: null })
          .returning(),
      );

      // NULL, no 0: "gratis" y "no confirmado" son cosas distintas.
      expect(sinPrecio.precioActual).toBeNull();
    });

    it("el precio de 1/2 MES vive en la configuración del gimnasio, no en plans", async () => {
      const { ctx } = await seedTestGym();

      await withTenantTx(ctx, (tx) =>
        tx.insert(gymSettings).values({ gymId: ctx.gymId, precioMedioMes: "45000" }),
      );

      const [settings] = await withTenantTx(ctx, (tx) =>
        tx.select().from(gymSettings).where(eq(gymSettings.gymId, ctx.gymId)),
      );
      expect(settings.precioMedioMes).toBe("45000.00");

      // Y no existe ningún plan llamado "1/2 MES": si existiera, sería
      // asignable como plan habitual de un alumno.
      const planes = await withTenantTx(ctx, (tx) =>
        tx.select().from(plans).where(eq(plans.gymId, ctx.gymId)),
      );
      expect(planes.map((p) => p.nombre)).not.toContain("1/2 MES");
    });

    it("un precio negativo se rechaza", async () => {
      const { ctx } = await seedTestGym();
      await expect(
        withTenantTx(ctx, (tx) =>
          tx
            .insert(plans)
            .values({ gymId: ctx.gymId, nombre: "Negativo", diasSemana: 2, precioActual: "-1" }),
        ),
      ).rejects.toThrow();
    });
  });
});

/**
 * La cobertura y "el pago no cambia el plan" necesitan varias escrituras
 * dentro de UNA transacción, así que van en su propio bloque.
 */
function nuevoAlumno(planId: string, nombre: string, apellido: string) {
  return {
    nombre,
    apellido,
    planId,
    fechaAltaOriginal: "2026-01-01",
    vinculoDesde: "2026-01-01",
  };
}

describe.skipIf(!process.env.DATABASE_URL)("reglas de negocio — pagos y cobertura", () => {
  /** Crea un alumno y devuelve su fila, en una transacción propia. */
  async function alumnoDePrueba(
    ctx: Awaited<ReturnType<typeof seedTestGym>>["ctx"],
    planId: string,
  ) {
    return withTenantTx(ctx, (tx) => crearAlumno(tx, ctx, nuevoAlumno(planId, "Ana", "Gómez")));
  }

  it("un 1/2 MES puede empezar cualquier día: ni el 1 ni el 15", async () => {
    const { ctx, planId } = await seedTestGym();
    const alumno = await alumnoDePrueba(ctx, planId);

    const periodo = await withTenantTx(ctx, async (tx) => {
      const [pago] = await tx
        .insert(payments)
        .values({
          gymId: ctx.gymId,
          studentId: alumno.id,
          fechaPago: "2026-01-15",
          planId,
          planDiasSnapshot: 3,
          planNombreSnapshot: "3 días",
          modalidad: "MEDIO_MES",
          monto: "45000",
          registradoPor: ctx.userId,
        })
        .returning();

      const [fila] = await tx
        .insert(paymentPeriods)
        .values({
          gymId: ctx.gymId,
          paymentId: pago.id,
          studentId: alumno.id,
          periodo: "2026-01-01",
          cubreDesde: "2026-01-07",
          cubreHasta: "2026-01-21",
        })
        .returning();
      return fila;
    });

    expect(periodo.cubreDesde).toBe("2026-01-07");
    expect(periodo.cubreHasta).toBe("2026-01-21");
  });

  it("un 1/2 MES que cruza el fin de mes se imputa al mes en que arranca", async () => {
    const { ctx, planId } = await seedTestGym();
    const alumno = await alumnoDePrueba(ctx, planId);

    const periodo = await withTenantTx(ctx, async (tx) => {
      const [pago] = await tx
        .insert(payments)
        .values({
          gymId: ctx.gymId,
          studentId: alumno.id,
          fechaPago: "2026-01-15",
          planId,
          planDiasSnapshot: 3,
          planNombreSnapshot: "3 días",
          modalidad: "MEDIO_MES",
          monto: "45000",
          registradoPor: ctx.userId,
        })
        .returning();

      const [fila] = await tx
        .insert(paymentPeriods)
        .values({
          gymId: ctx.gymId,
          paymentId: pago.id,
          studentId: alumno.id,
          periodo: "2026-01-01",
          cubreDesde: "2026-01-25",
          cubreHasta: "2026-02-08",
        })
        .returning();
      return fila;
    });

    expect(periodo.periodo).toBe("2026-01-01");
  });

  it("la base rechaza imputar un tramo a un mes que no es el de su inicio", async () => {
    const { ctx, planId } = await seedTestGym();
    const alumno = await alumnoDePrueba(ctx, planId);

    await expect(
      withTenantTx(ctx, async (tx) => {
        const [pago] = await tx
          .insert(payments)
          .values({
            gymId: ctx.gymId,
            studentId: alumno.id,
            fechaPago: "2026-01-15",
            planId,
            planDiasSnapshot: 3,
            planNombreSnapshot: "3 días",
            monto: "45000",
            registradoPor: ctx.userId,
          })
          .returning();

        await tx.insert(paymentPeriods).values({
          gymId: ctx.gymId,
          paymentId: pago.id,
          studentId: alumno.id,
          periodo: "2026-02-01", // ← miente: el tramo arranca en enero
          cubreDesde: "2026-01-25",
          cubreHasta: "2026-02-08",
        });
      }),
    ).rejects.toThrow();
  });

  it("la base rechaza un rango de cobertura invertido", async () => {
    const { ctx, planId } = await seedTestGym();
    const alumno = await alumnoDePrueba(ctx, planId);

    await expect(
      withTenantTx(ctx, async (tx) => {
        const [pago] = await tx
          .insert(payments)
          .values({
            gymId: ctx.gymId,
            studentId: alumno.id,
            fechaPago: "2026-01-15",
            planId,
            planDiasSnapshot: 3,
            planNombreSnapshot: "3 días",
            monto: "45000",
            registradoPor: ctx.userId,
          })
          .returning();

        await tx.insert(paymentPeriods).values({
          gymId: ctx.gymId,
          paymentId: pago.id,
          studentId: alumno.id,
          periodo: "2026-01-01",
          cubreDesde: "2026-01-21",
          cubreHasta: "2026-01-07",
        });
      }),
    ).rejects.toThrow();
  });

  it("la base rechaza una modalidad de pago inventada", async () => {
    const { ctx, planId } = await seedTestGym();
    const alumno = await alumnoDePrueba(ctx, planId);

    await expect(
      withTenantTx(ctx, (tx) =>
        tx.insert(payments).values({
          gymId: ctx.gymId,
          studentId: alumno.id,
          fechaPago: "2026-01-15",
          planId,
          planDiasSnapshot: 3,
          planNombreSnapshot: "3 días",
          modalidad: "TRIMESTRE",
          monto: "45000",
          registradoPor: ctx.userId,
        }),
      ),
    ).rejects.toThrow();
  });

  describe("§4 — un pago NO cambia el plan habitual del alumno", () => {
    it("registrar un MEDIO_MES deja intacto el plan del alumno", async () => {
      const { ctx, planId } = await seedTestGym();
      const alumno = await alumnoDePrueba(ctx, planId);
      expect(alumno.planId).toBe(planId);

      await withTenantTx(ctx, async (tx) => {
        const [pago] = await tx
          .insert(payments)
          .values({
            gymId: ctx.gymId,
            studentId: alumno.id,
            fechaPago: "2026-01-15",
            planId,
            planDiasSnapshot: 3,
            planNombreSnapshot: "3 días",
            modalidad: "MEDIO_MES",
            monto: "45000",
            registradoPor: ctx.userId,
          })
          .returning();

        await tx.insert(paymentPeriods).values({
          gymId: ctx.gymId,
          paymentId: pago.id,
          studentId: alumno.id,
          periodo: "2026-01-01",
          cubreDesde: "2026-01-07",
          cubreHasta: "2026-01-21",
        });
      });

      const [despues] = await withTenantTx(ctx, (tx) =>
        tx.select().from(students).where(eq(students.id, alumno.id)),
      );

      // El plan habitual sigue siendo el mismo, y el vínculo tampoco se
      // tocó: cobrar no es cambiar el plan de nadie.
      expect(despues.planId).toBe(planId);
      expect(despues.vinculo).toBe("ACTIVO");
    });

    it("el snapshot del pago sobrevive a un cambio posterior del precio del plan", async () => {
      const { ctx, planId } = await seedTestGym();
      const alumno = await alumnoDePrueba(ctx, planId);

      const pago = await withTenantTx(ctx, async (tx) => {
        const [fila] = await tx
          .insert(payments)
          .values({
            gymId: ctx.gymId,
            studentId: alumno.id,
            fechaPago: "2026-01-15",
            planId,
            planDiasSnapshot: 3,
            planNombreSnapshot: "3 días",
            monto: "55000",
            registradoPor: ctx.userId,
          })
          .returning();
        return fila;
      });

      // El dueño sube el precio del plan.
      await withTenantTx(ctx, (tx) =>
        tx.update(plans).set({ precioActual: "70000" }).where(eq(plans.id, planId)),
      );

      const [despues] = await withTenantTx(ctx, (tx) =>
        tx.select().from(payments).where(eq(payments.id, pago.id)),
      );

      // El pago histórico conserva su importe real. Nunca se recalcula.
      expect(despues.monto).toBe("55000.00");
      expect(despues.planNombreSnapshot).toBe("3 días");
    });
  });
});
