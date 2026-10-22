import { describe, it, expect } from "vitest";
import { pagosPorDia } from "@/domain/pagos/pagos-por-dia";
import { primerDiaDelMes, ultimoDiaDelMes } from "@/domain/fechas/calendario";

const mes = (iso: string) => ({ desde: primerDiaDelMes(iso), hasta: ultimoDiaDelMes(iso) });

describe("pagosPorDia — el mes completo, día por día", () => {
  it("lista TODOS los días del mes, también los que no tuvieron pagos", () => {
    const dias = pagosPorDia([{ fechaPago: "2026-10-05", monto: 50000, anulado: false }], mes("2026-10-15"));
    expect(dias).toHaveLength(31);
    expect(dias[0]).toMatchObject({ fecha: "2026-10-01", cantidad: 0, total: 0, pagos: [] });
    expect(dias[4]).toMatchObject({ fecha: "2026-10-05", cantidad: 1, total: 50000 });
    expect(dias[30]!.fecha).toBe("2026-10-31");
  });

  it("el último día se ajusta a cada mes: 30, 28 y 29 en bisiesto", () => {
    expect(pagosPorDia([], mes("2026-09-10")).at(-1)!.fecha).toBe("2026-09-30");
    expect(pagosPorDia([], mes("2026-02-10"))).toHaveLength(28);
    expect(pagosPorDia([], mes("2028-02-10")).at(-1)!.fecha).toBe("2028-02-29");
  });

  it("del día 1 al último por defecto, y al revés solo si se pide", () => {
    expect(pagosPorDia([], mes("2026-10-01"))[0]!.fecha).toBe("2026-10-01");
    expect(pagosPorDia([], mes("2026-10-01"), "desc")[0]!.fecha).toBe("2026-10-31");
  });

  it("un anulado queda en su día pero no suma a la cantidad ni al total", () => {
    const [dia] = pagosPorDia(
      [
        { fechaPago: "2026-10-01", monto: 50000, anulado: false },
        { fechaPago: "2026-10-01", monto: 55000, anulado: true },
      ],
      { desde: "2026-10-01", hasta: "2026-10-01" },
    );
    expect(dia!.pagos).toHaveLength(2);
    expect(dia!.cantidad).toBe(1);
    expect(dia!.total).toBe(50000);
  });

  it("conserva el orden en que llegan los pagos dentro de cada día", () => {
    const [dia] = pagosPorDia(
      [
        { id: "b", fechaPago: "2026-10-01", monto: 1, anulado: false },
        { id: "a", fechaPago: "2026-10-01", monto: 1, anulado: false },
      ],
      { desde: "2026-10-01", hasta: "2026-10-01" },
    );
    expect(dia!.pagos.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("un rango invertido no inventa días", () => {
    expect(pagosPorDia([], { desde: "2026-10-02", hasta: "2026-10-01" })).toEqual([]);
  });
});
