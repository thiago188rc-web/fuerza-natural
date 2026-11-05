import { describe, it, expect } from "vitest";
import { numeracionVisual } from "@/domain/pagos/numeracion";
import { pagosPorDia } from "@/domain/pagos/pagos-por-dia";

/** El N.º del listado de Pagos: posicional, sin anulados, sin reiniciarse por día. */

const pago = (id: string, fechaPago: string, anulado = false) => ({ id, fechaPago, monto: 1000, anulado });

describe("numeracionVisual", () => {
  it("arranca en 1 y llega al último registro vigente, en el orden recibido", () => {
    const pagos = Array.from({ length: 198 }, (_, i) => pago(`p${i}`, "2026-10-10"));
    const numeros = numeracionVisual(pagos);
    expect(numeros.get("p0")).toBe(1);
    expect(numeros.get("p197")).toBe(198);
    expect(new Set(numeros.values()).size).toBe(198);
  });

  it("los anulados no llevan número y no dejan huecos: el último coincide con los vigentes", () => {
    const numeros = numeracionVisual([pago("a", "x"), pago("b", "x", true), pago("c", "x")]);
    expect(numeros.get("a")).toBe(1);
    expect(numeros.has("b")).toBe(false);
    expect(numeros.get("c")).toBe(2);
  });

  it("al anular o agregar uno, los números se recuentan solos", () => {
    const antes = numeracionVisual([pago("a", "x"), pago("b", "x"), pago("c", "x")]);
    const despues = numeracionVisual([pago("a", "x"), pago("b", "x", true), pago("c", "x"), pago("d", "x")]);
    expect(antes.get("c")).toBe(3);
    expect(despues.get("c")).toBe(2);
    expect(despues.get("d")).toBe(3);
  });

  it("con páginas, la segunda continúa donde terminó la primera", () => {
    const pagina2 = numeracionVisual([pago("k", "x"), pago("l", "x")], 26);
    expect(pagina2.get("k")).toBe(26);
    expect(pagina2.get("l")).toBe(27);
  });

  it("en la vista por día no se reinicia en cada día, y respeta el sentido elegido", () => {
    const pagos = [pago("d1a", "2026-10-01"), pago("d1b", "2026-10-01"), pago("d3", "2026-10-03")];
    const rango = { desde: "2026-10-01", hasta: "2026-10-31" };

    const asc = numeracionVisual(pagosPorDia(pagos, rango, "asc").flatMap((d) => d.pagos));
    expect([asc.get("d1a"), asc.get("d1b"), asc.get("d3")]).toEqual([1, 2, 3]);

    const desc = numeracionVisual(pagosPorDia(pagos, rango, "desc").flatMap((d) => d.pagos));
    expect(desc.get("d3")).toBe(1);
  });
});
