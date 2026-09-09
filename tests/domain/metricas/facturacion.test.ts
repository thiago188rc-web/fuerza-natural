import { describe, it, expect } from "vitest";
import { segmentosDeImporte } from "@/domain/metricas/facturacion";

const ETIQUETAS = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", OTRO: "Otro" };
const ORDEN = ["EFECTIVO", "TRANSFERENCIA", "OTRO"] as const;

describe("segmentosDeImporte", () => {
  it("calcula el porcentaje sobre el total general, no sobre el segmento mayor", () => {
    const filas = [
      { clave: "EFECTIVO", total: 75_000, cantidad: 3 },
      { clave: "TRANSFERENCIA", total: 25_000, cantidad: 1 },
    ];
    const segmentos = segmentosDeImporte(filas, ETIQUETAS, ORDEN);
    expect(segmentos.find((s) => s.clave === "EFECTIVO")?.porcentaje).toBe(75);
    expect(segmentos.find((s) => s.clave === "TRANSFERENCIA")?.porcentaje).toBe(25);
  });

  it("omite las claves sin ningún pago", () => {
    const filas = [{ clave: "EFECTIVO", total: 50_000, cantidad: 2 }];
    const segmentos = segmentosDeImporte(filas, ETIQUETAS, ORDEN);
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].clave).toBe("EFECTIVO");
  });

  it("lista vacía no produce NaN ni division por cero", () => {
    expect(segmentosDeImporte([], ETIQUETAS, ORDEN)).toEqual([]);
  });

  it("respeta el orden dado, no el orden de las filas", () => {
    const filas = [
      { clave: "OTRO", total: 10_000, cantidad: 1 },
      { clave: "EFECTIVO", total: 90_000, cantidad: 4 },
    ];
    const segmentos = segmentosDeImporte(filas, ETIQUETAS, ORDEN);
    expect(segmentos.map((s) => s.clave)).toEqual(["EFECTIVO", "OTRO"]);
  });
});
