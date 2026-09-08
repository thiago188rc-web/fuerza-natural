import { describe, it, expect } from "vitest";
import { planSchema } from "@/schemas/plan";
import { registrarPagoSchema } from "@/schemas/payment";

/**
 * Las reglas confirmadas por Diego, en el borde de validación
 * (docs/REGLAS-DE-NEGOCIO.md). Fase 2 todavía no existe: acá se fija el
 * CONTRATO sobre el que se va a construir, para que no se construya sobre
 * una interpretación equivocada.
 */

const UUID = "11111111-2222-4333-8444-555555555555";

describe("planSchema — §1 LIBRE", () => {
  it("por defecto un plan es de días fijos", () => {
    const r = planSchema.safeParse({ nombre: "3 días", diasSemana: 3, precioActual: 55000 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.acceso).toBe("DIAS_FIJOS");
  });

  it("acepta LIBRE como tipo de acceso propio", () => {
    const r = planSchema.safeParse({ nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.acceso).toBe("LIBRE");
  });

  it("rechaza un tipo de acceso inventado", () => {
    const r = planSchema.safeParse({ nombre: "X", diasSemana: 5, acceso: "ILIMITADO" });
    expect(r.success).toBe(false);
  });
});

describe("planSchema — §2 precios", () => {
  it("un plan puede quedar SIN precio: es el caso de LIBRE hoy", () => {
    const r = planSchema.safeParse({ nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.precioActual).toBeUndefined();
  });

  it("acepta null explícito como 'todavía no confirmado'", () => {
    const r = planSchema.safeParse({ nombre: "LIBRE", diasSemana: 5, precioActual: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.precioActual).toBeNull();
  });

  it("rechaza un precio negativo", () => {
    const r = planSchema.safeParse({ nombre: "X", diasSemana: 3, precioActual: -1 });
    expect(r.success).toBe(false);
  });

  it("acepta los precios confirmados sin que estén en el código del schema", () => {
    for (const precio of [50000, 55000, 60000, 65000]) {
      expect(planSchema.safeParse({ nombre: "X", diasSemana: 3, precioActual: precio }).success).toBe(
        true,
      );
    }
  });
});

describe("registrarPagoSchema — §3 modalidad 1/2 MES", () => {
  const base = {
    studentId: UUID,
    fechaPago: "2026-01-15",
    planId: UUID,
    idempotencyKey: UUID,
  };

  it("por defecto un pago cubre el mes completo", () => {
    const r = registrarPagoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.modalidad).toBe("MES_COMPLETO");
  });

  it("acepta MEDIO_MES con una fecha de inicio cualquiera", () => {
    const r = registrarPagoSchema.safeParse({
      ...base,
      modalidad: "MEDIO_MES",
      cubreDesde: "2026-01-07",
      monto: 45000,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // Ni el día 1 ni el día 15: el dueño confirmó que es seleccionable.
      expect(r.data.cubreDesde).toBe("2026-01-07");
    }
  });

  it("rechaza una modalidad inventada", () => {
    expect(registrarPagoSchema.safeParse({ ...base, modalidad: "TRIMESTRE" }).success).toBe(false);
  });

  it("el pago lleva el plan HABITUAL del alumno, no la modalidad como plan", () => {
    const r = registrarPagoSchema.safeParse({ ...base, modalidad: "MEDIO_MES" });
    expect(r.success).toBe(true);
    // `planId` sigue siendo obligatorio y separado de `modalidad`: es el
    // snapshot de qué plan tenía la persona, no lo que compró.
    if (r.success) expect(r.data.planId).toBe(UUID);
  });

  it("NO acepta un cambio de plan encubierto: no existe campo para eso", () => {
    const r = registrarPagoSchema.safeParse({
      ...base,
      nuevoPlanId: "22222222-3333-4444-8555-666666666666",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("nuevoPlanId");
  });
});
