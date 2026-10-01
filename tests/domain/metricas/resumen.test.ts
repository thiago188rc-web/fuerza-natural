import { describe, it, expect } from "vitest";
import { resumenDelMes, variacionPorcentual } from "@/domain/metricas/resumen";

/**
 * El "resumen del mes" que pidió el dueño (inspirado en una captura de
 * otro gimnasio: "Septiembre, +5% vs mes anterior; 7 bajas; ocupación 93%;
 * género; edad"). Lo que se fija acá son las reglas de cada número, sobre
 * todo cuándo NO hay comparación posible: un "+100%" contra un mes sin
 * datos es un número inventado.
 */

describe("variacionPorcentual", () => {
  it("redondea al entero y lleva signo", () => {
    expect(variacionPorcentual(105, 100)).toBe(5);
    expect(variacionPorcentual(90, 100)).toBe(-10);
    expect(variacionPorcentual(100, 100)).toBe(0);
    expect(variacionPorcentual(1001, 1000)).toBe(0);
  });

  it("contra un mes en cero no hay porcentaje: sin dato, no '+∞%'", () => {
    expect(variacionPorcentual(50000, 0)).toBeNull();
    expect(variacionPorcentual(0, 0)).toBeNull();
  });
});

describe("resumenDelMes", () => {
  const base = {
    facturado: 1_050_000,
    facturadoMesAnterior: 1_000_000,
    nuevos: 6,
    volvieron: 2,
    bajas: 7,
    activos: 193,
    activosMesAnterior: 186,
    alDia: { cubiertos: 180, total: 193 },
  };

  it("arma los cuatro números del mes", () => {
    expect(resumenDelMes(base)).toEqual({
      facturado: 1_050_000,
      variacionFacturado: 5,
      altas: 8,
      bajas: 7,
      activos: 193,
      diferenciaActivos: 7,
      alDia: { porcentaje: 93, cubiertos: 180, total: 193 },
    });
  });

  it("sin el mes anterior en el sistema no hay comparación (ni de facturación ni de activos)", () => {
    const r = resumenDelMes({ ...base, facturadoMesAnterior: null, activosMesAnterior: null });
    expect(r.variacionFacturado).toBeNull();
    expect(r.diferenciaActivos).toBeNull();
  });

  it("'al día' solo existe para el mes en curso; sin activos tampoco hay porcentaje", () => {
    expect(resumenDelMes({ ...base, alDia: null }).alDia).toBeNull();
    expect(resumenDelMes({ ...base, alDia: { cubiertos: 0, total: 0 } }).alDia).toBeNull();
  });

  it("el porcentaje al día se redondea hacia abajo: 99,6% no es 'todos al día'", () => {
    expect(resumenDelMes({ ...base, alDia: { cubiertos: 249, total: 250 } }).alDia?.porcentaje).toBe(99);
    expect(resumenDelMes({ ...base, alDia: { cubiertos: 250, total: 250 } }).alDia?.porcentaje).toBe(100);
  });
});
