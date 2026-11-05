import { describe, it, expect } from "vitest";
import {
  MAXIMO_MESES_POR_COBRO,
  inicioFueraDeMargen,
  mesesEncadenados,
  periodosParaCobrar,
  ubicacionDelPeriodo,
} from "@/domain/pagos/periodos";
import { tramosImputados } from "@/domain/pagos/modalidad";
import { sumarDias } from "@/domain/fechas/calendario";

/** Todo pagado, sin huecos, hasta el día anterior al ancla: el caso común. */
const pagadoHasta = (ancla: string) => [{ desde: "2020-01-01", hasta: sumarDias(ancla, -1) }];

/**
 * Fecha de cobro ≠ período imputado (docs/REGLAS-DE-NEGOCIO.md §5bis).
 * Fechas fijas a propósito: el caso del pedido (cobrado el 28/10, paga
 * noviembre) tiene que dar siempre lo mismo, sin depender del reloj.
 */

describe("periodosParaCobrar — qué período se propone", () => {
  it("cobrado el 28/10 a quien tiene octubre cubierto: propone noviembre (adelanto), del 1 al 30", () => {
    const r = periodosParaCobrar({ ancla: "2026-11-01", fechaDeCobro: "2026-10-28", hoy: "2026-10-28", cubiertos: pagadoHasta("2026-11-01") });
    expect(r.sugerido).toBe("2026-11-01");
    expect(r.periodos[0]).toEqual({ desde: "2026-11-01", hasta: "2026-11-30", ubicacion: "ADELANTADO" });
    expect(r.sinPagarDesde).toBeNull();
    // Se ofrecen también los dos siguientes, a un toque.
    expect(r.periodos.map((p) => p.desde)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("el ciclo queda anclado a su día: quien arranca el 10 ve 10/11→9/12, no el mes calendario", () => {
    const r = periodosParaCobrar({ ancla: "2026-11-10", fechaDeCobro: "2026-11-02", hoy: "2026-11-02", cubiertos: pagadoHasta("2026-11-10") });
    expect(r.periodos.slice(0, 2)).toEqual([
      { desde: "2026-11-10", hasta: "2026-12-09", ubicacion: "ADELANTADO" },
      { desde: "2026-12-10", hasta: "2027-01-09", ubicacion: "ADELANTADO" },
    ]);
  });

  it("vencido hace pocos días: propone el que corre, igual que antes", () => {
    const r = periodosParaCobrar({ ancla: "2026-10-10", fechaDeCobro: "2026-10-13", hoy: "2026-10-13", cubiertos: pagadoHasta("2026-10-10") });
    expect(r.sugerido).toBe("2026-10-10");
    expect(r.periodos[0]!.ubicacion).toBe("EN_CURSO");
    expect(r.sinPagarDesde).toBeNull();
  });

  it("con un hueco de meses: propone el que corre HOY y ofrece los atrasados, avisando desde cuándo debe", () => {
    // Último cubierto: 9/8. Hoy, 20/10. Antes el sistema imputaba 10/8→9/9
    // sin preguntar y el alumno seguía "sin cubrir" después de pagar.
    const r = periodosParaCobrar({ ancla: "2026-08-10", fechaDeCobro: "2026-10-20", hoy: "2026-10-20", cubiertos: pagadoHasta("2026-08-10") });
    expect(r.sugerido).toBe("2026-10-10");
    expect(r.sinPagarDesde).toBe("2026-08-10");
    expect(r.periodos.map((p) => [p.desde, p.ubicacion])).toEqual([
      ["2026-08-10", "ATRASADO"],
      ["2026-09-10", "ATRASADO"],
      ["2026-10-10", "EN_CURSO"],
      ["2026-11-10", "ADELANTADO"],
      ["2026-12-10", "ADELANTADO"],
    ]);
  });

  it("un pago atrasado cargado tarde: la propuesta sigue a la FECHA DE COBRO, no a hoy", () => {
    // Se cobró el 12/9 y recién se carga el 1/11. Lo que pagó es septiembre.
    const r = periodosParaCobrar({ ancla: "2026-09-10", fechaDeCobro: "2026-09-12", hoy: "2026-11-01", cubiertos: pagadoHasta("2026-09-10") });
    expect(r.sugerido).toBe("2026-09-10");
    expect(r.periodos.find((p) => p.desde === "2026-09-10")?.ubicacion).toBe("ATRASADO");
    // Y se puede elegir el que corre hoy sin cambiar la fecha.
    expect(r.periodos.some((p) => p.desde === "2026-10-10" && p.ubicacion === "EN_CURSO")).toBe(true);
  });

  it("nunca pagó y el alta es de hace años: no recorre todo, pero mantiene el día de arranque", () => {
    const r = periodosParaCobrar({
      ancla: "2023-03-05",
      fechaDeCobro: "2026-11-01",
      hoy: "2026-11-01",
      cubiertos: [],
      noAntesDe: "2023-03-05",
    });
    expect(r.sugerido).toBe("2026-10-05");
    expect(r.sinPagarDesde).toBe("2023-03-05");
    expect(r.periodos.every((p) => p.desde.endsWith("-05"))).toBe(true);
    expect(r.periodos.length).toBeLessThanOrEqual(5);
  });

  it("quien ya tiene pagado muy adelante recibe la propuesta siguiente a su cobertura", () => {
    const r = periodosParaCobrar({ ancla: "2027-05-01", fechaDeCobro: "2026-11-01", hoy: "2026-11-01", cubiertos: pagadoHasta("2027-05-01") });
    expect(r.sugerido).toBe("2027-05-01");
    expect(r.periodos[0]!.ubicacion).toBe("ADELANTADO");
  });

  it("el sugerido siempre es uno de los períodos ofrecidos", () => {
    const casos = [
      { ancla: "2026-01-31", fechaDeCobro: "2026-03-15", hoy: "2026-03-20" },
      { ancla: "2026-02-28", fechaDeCobro: "2026-02-28", hoy: "2026-02-28" },
      { ancla: "2025-12-15", fechaDeCobro: "2026-11-01", hoy: "2026-11-01" },
      { ancla: "2026-11-02", fechaDeCobro: "2026-11-01", hoy: "2026-11-01" },
    ];
    for (const caso of casos) {
      for (const cubiertos of [pagadoHasta(caso.ancla), []]) {
        const r = periodosParaCobrar({ ...caso, cubiertos });
        expect(r.periodos.some((p) => p.desde === r.sugerido)).toBe(true);
      }
    }
  });

  it("un hueco ANTES de lo último pagado se ofrece: pagó dic y ene, noviembre (en curso) quedó sin pagar", () => {
    // El caso que apareció probando en el navegador: el ancla queda en
    // febrero, pero lo que corre hoy es noviembre y no está pagado.
    const r = periodosParaCobrar({
      ancla: "2027-02-01",
      fechaDeCobro: "2026-11-01",
      hoy: "2026-11-01",
      cubiertos: [{ desde: "2026-12-01", hasta: "2027-01-31" }],
      noAntesDe: "2026-11-01",
    });
    expect(r.sugerido).toBe("2026-11-01");
    expect(r.periodos.map((p) => [p.desde, p.ubicacion])).toEqual([
      ["2026-11-01", "EN_CURSO"],
      ["2027-02-01", "ADELANTADO"],
      ["2027-03-01", "ADELANTADO"],
    ]);
    // Antes del alta no se ofrece nada, y no hay "sin pagar desde".
    expect(r.sinPagarDesde).toBeNull();
  });

  it("lo ya cubierto entero no se ofrece; uno cubierto a medias sí (y el cobro avisa la superposición)", () => {
    const r = periodosParaCobrar({
      ancla: "2026-12-01",
      fechaDeCobro: "2026-11-20",
      hoy: "2026-11-20",
      cubiertos: [
        { desde: "2026-09-01", hasta: "2026-10-31" },
        { desde: "2026-11-01", hasta: "2026-11-15" }, // un 1/2 mes
        { desde: "2026-11-25", hasta: "2026-11-30" },
      ],
    });
    expect(r.periodos.map((p) => p.desde)).toContain("2026-11-01");
    expect(r.periodos.map((p) => p.desde)).not.toContain("2026-10-01");
    expect(r.sugerido).toBe("2026-11-01");
  });
});

describe("mesesEncadenados — varios meses en un cobro", () => {
  it("dos meses futuros seguidos, sin hueco ni superposición", () => {
    expect(mesesEncadenados("2026-11-01", 2)).toEqual([
      { desde: "2026-11-01", hasta: "2026-11-30" },
      { desde: "2026-12-01", hasta: "2026-12-31" },
    ]);
  });

  it("encadena con el día de arranque del alumno: 10/11→9/12 y 10/12→9/1", () => {
    const meses = mesesEncadenados("2026-11-10", 3);
    expect(meses.map((m) => `${m.desde}..${m.hasta}`)).toEqual([
      "2026-11-10..2026-12-09",
      "2026-12-10..2027-01-09",
      "2027-01-10..2027-02-09",
    ]);
    // Cada mes es exactamente lo que habría dado cobrarlo de a uno.
    for (let i = 1; i < meses.length; i++) {
      expect(meses[i]!.desde > meses[i - 1]!.hasta).toBe(true);
    }
  });

  it("cada mes se parte por mes imputado como cualquier pago", () => {
    const [primero] = mesesEncadenados("2026-11-10", 1);
    expect(tramosImputados(primero!).map((t) => t.periodo)).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("nunca menos de 1 ni más del máximo", () => {
    expect(mesesEncadenados("2026-11-01", 0)).toHaveLength(1);
    expect(mesesEncadenados("2026-11-01", 99)).toHaveLength(MAXIMO_MESES_POR_COBRO);
  });
});

describe("ubicación y margen", () => {
  it("atrasado, en curso y adelantado respecto de hoy", () => {
    const hoy = "2026-10-28";
    expect(ubicacionDelPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" }, hoy)).toBe("ATRASADO");
    expect(ubicacionDelPeriodo({ desde: "2026-10-10", hasta: "2026-11-09" }, hoy)).toBe("EN_CURSO");
    expect(ubicacionDelPeriodo({ desde: "2026-10-28", hasta: "2026-11-27" }, hoy)).toBe("EN_CURSO");
    expect(ubicacionDelPeriodo({ desde: "2026-11-01", hasta: "2026-11-30" }, hoy)).toBe("ADELANTADO");
  });

  it("un período a más de 12 meses de hoy es un tipeo, no un adelanto", () => {
    const hoy = "2026-11-01";
    expect(inicioFueraDeMargen("2026-12-01", hoy)).toBe(false);
    expect(inicioFueraDeMargen("2027-11-01", hoy)).toBe(false);
    expect(inicioFueraDeMargen("2027-11-02", hoy)).toBe(true);
    expect(inicioFueraDeMargen("2025-11-01", hoy)).toBe(false);
    expect(inicioFueraDeMargen("2025-10-31", hoy)).toBe(true);
    expect(inicioFueraDeMargen("2062-11-01", hoy)).toBe(true);
  });
});
