import { describe, it, expect } from "vitest";
import { coberturaDe, tramosImputados, DIAS_DE_MEDIO_MES } from "@/domain/pagos/modalidad";
import { segmentosDelMes, situacionDeCobertura } from "@/domain/pagos/cobertura";
import { diasEntre, posicionEnElMes, ultimoDiaDelMes } from "@/domain/fechas/calendario";

/**
 * Las reglas de cobertura confirmadas por Diego, como funciones puras.
 * Sin base de datos: la matriz entera corre en milisegundos, y eso es lo
 * que permite cubrir los bordes (febrero, cruces de mes, tramos de un
 * día) en vez de solo el camino feliz.
 */

const PARAMETROS = { ventanaPagoHasta: 10, diasGracia: 5, diasNuevoSinPago: 7 };
const ACTIVO = { vinculo: "ACTIVO", fechaAltaOriginal: "2025-01-01" };

describe("coberturaDe — mes completo", () => {
  it("cubre el mes entero sin importar qué día se pague", () => {
    expect(coberturaDe("MES_COMPLETO", "2026-09-23")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("resuelve febrero y los años bisiestos", () => {
    expect(coberturaDe("MES_COMPLETO", "2027-02-10").hasta).toBe("2027-02-28");
    expect(coberturaDe("MES_COMPLETO", "2028-02-10").hasta).toBe("2028-02-29");
  });
});

describe("coberturaDe — 1/2 mes", () => {
  it("son 15 días corridos contando el primero", () => {
    const c = coberturaDe("MEDIO_MES", "2026-09-07");
    expect(c).toEqual({ desde: "2026-09-07", hasta: "2026-09-21" });
    expect(diasEntre(c.desde, c.hasta) + 1).toBe(DIAS_DE_MEDIO_MES);
  });

  it("puede empezar CUALQUIER día: ni el 1 ni el 15", () => {
    for (const dia of ["01", "07", "14", "15", "23", "28"]) {
      const c = coberturaDe("MEDIO_MES", `2026-09-${dia}`);
      expect(c.desde).toBe(`2026-09-${dia}`);
      expect(diasEntre(c.desde, c.hasta) + 1).toBe(DIAS_DE_MEDIO_MES);
    }
  });

  it("puede terminar en el mes siguiente, y eso es correcto", () => {
    expect(coberturaDe("MEDIO_MES", "2026-09-25").hasta).toBe("2026-10-09");
  });
});

describe("tramosImputados", () => {
  it("un mes completo produce un solo tramo imputado a ese mes", () => {
    expect(tramosImputados({ desde: "2026-09-01", hasta: "2026-09-30" })).toEqual([
      { periodo: "2026-09-01", cubreDesde: "2026-09-01", cubreHasta: "2026-09-30" },
    ]);
  });

  it("un 1/2 mes dentro del mes produce un solo tramo", () => {
    expect(tramosImputados({ desde: "2026-09-07", hasta: "2026-09-21" })).toEqual([
      { periodo: "2026-09-01", cubreDesde: "2026-09-07", cubreHasta: "2026-09-21" },
    ]);
  });

  it("un 1/2 mes que cruza el fin de mes produce un tramo por mes tocado", () => {
    expect(tramosImputados({ desde: "2026-09-25", hasta: "2026-10-09" })).toEqual([
      { periodo: "2026-09-01", cubreDesde: "2026-09-25", cubreHasta: "2026-09-30" },
      { periodo: "2026-10-01", cubreDesde: "2026-10-01", cubreHasta: "2026-10-09" },
    ]);
  });

  it("todo tramo cumple el CHECK de la base: periodo = mes de cubre_desde", () => {
    const casos = [
      { desde: "2026-01-20", hasta: "2026-02-03" },
      { desde: "2026-12-28", hasta: "2027-01-11" },
      { desde: "2028-02-20", hasta: "2028-03-05" },
    ];
    for (const caso of casos) {
      for (const tramo of tramosImputados(caso)) {
        expect(tramo.periodo).toBe(`${tramo.cubreDesde.slice(0, 7)}-01`);
        expect(tramo.cubreHasta >= tramo.cubreDesde).toBe(true);
      }
    }
  });

  it("los tramos cubren el rango completo, sin huecos ni superposición", () => {
    const cobertura = { desde: "2026-12-28", hasta: "2027-01-11" };
    const tramos = tramosImputados(cobertura);
    expect(tramos[0].cubreDesde).toBe(cobertura.desde);
    expect(tramos[tramos.length - 1].cubreHasta).toBe(cobertura.hasta);
    for (let i = 1; i < tramos.length; i++) {
      expect(diasEntre(tramos[i - 1].cubreHasta, tramos[i].cubreDesde)).toBe(1);
    }
  });
});

describe("situacionDeCobertura — se deriva, nunca se guarda", () => {
  it("hoy dentro de un tramo: CUBIERTO", () => {
    const s = situacionDeCobertura(
      "2026-09-10",
      [{ desde: "2026-09-01", hasta: "2026-09-30" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("CUBIERTO");
    expect(s.cubiertoHasta).toBe("2026-09-30");
  });

  it("avisa cuando faltan pocos días", () => {
    const s = situacionDeCobertura(
      "2026-09-28",
      [{ desde: "2026-09-01", hasta: "2026-09-30" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("CUBIERTO");
    expect(s.detalle).toBe("Vence en 2 días");
  });

  it("un 1/2 mes vigente cubre igual que un mes completo", () => {
    const s = situacionDeCobertura(
      "2026-09-10",
      [{ desde: "2026-09-07", hasta: "2026-09-21" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("CUBIERTO");
  });

  it("NO usa 'último pago + 30 días': fuera del tramo no está cubierto", () => {
    // Pagó hace 20 días un medio mes; con la regla vieja seguiría "al
    // día", con la regla real ya no está cubierto.
    const s = situacionDeCobertura(
      "2026-09-27",
      [{ desde: "2026-09-01", hasta: "2026-09-15" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("DESCUBIERTO");
  });

  it("venía al día y todavía no pagó el mes en curso: REVISAR", () => {
    // Cubrió agosto entero; estamos el 5 de septiembre, dentro de la
    // ventana de pago. Todavía no hay nada que reclamar.
    const s = situacionDeCobertura(
      "2026-09-05",
      [{ desde: "2026-08-01", hasta: "2026-08-31" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("REVISAR");
  });

  it("la ventana de pago NO tapa a quien arrastra meses sin cubrir", () => {
    // Último mes cubierto: junio. Aunque hoy sea 5 y la ventana esté
    // abierta, esta persona no "todavía no pasó a pagar" — hace rato que
    // no cubre. Si la ventana lo protegiera, desaparecería de la bandeja
    // los primeros quince días de cada mes, que es justo cuando conviene
    // reclamarle.
    const s = situacionDeCobertura(
      "2026-09-05",
      [{ desde: "2026-06-01", hasta: "2026-06-30" }],
      PARAMETROS,
      ACTIVO,
    );
    expect(s.estado).toBe("DESCUBIERTO");
  });

  it("quien nunca pagó y ya pasó su tolerancia de alta: DESCUBIERTO", () => {
    const s = situacionDeCobertura("2026-09-05", [], PARAMETROS, ACTIVO);
    expect(s.estado).toBe("DESCUBIERTO");
    expect(s.detalle).toBe("Nunca registró un pago");
  });

  it("pasada la ventana más la gracia, DESCUBIERTO", () => {
    const s = situacionDeCobertura("2026-09-20", [], PARAMETROS, ACTIVO);
    expect(s.estado).toBe("DESCUBIERTO");
    expect(s.detalle).toBe("Nunca registró un pago");
  });

  it("un alta reciente no se reclama", () => {
    const s = situacionDeCobertura("2026-09-20", [], PARAMETROS, {
      vinculo: "ACTIVO",
      fechaAltaOriginal: "2026-09-18",
    });
    expect(s.estado).toBe("REVISAR");
    expect(s.detalle).toBe("Alta reciente, sin pago todavía");
  });

  it("un alumno pausado o dado de baja no debe nada", () => {
    for (const vinculo of ["PAUSADO", "BAJA"]) {
      const s = situacionDeCobertura("2026-09-20", [], PARAMETROS, {
        vinculo,
        fechaAltaOriginal: "2025-01-01",
      });
      expect(s.estado).toBe("NO_APLICA");
    }
  });

  it("es una función del día: la misma entrada con otra fecha cambia la respuesta", () => {
    const tramos = [{ desde: "2026-09-01", hasta: "2026-09-30" }];
    expect(situacionDeCobertura("2026-09-15", tramos, PARAMETROS, ACTIVO).estado).toBe("CUBIERTO");
    expect(situacionDeCobertura("2026-10-20", tramos, PARAMETROS, ACTIVO).estado).toBe(
      "DESCUBIERTO",
    );
  });
});

describe("segmentosDelMes — lo que dibuja la barra del mes", () => {
  it("un mes completo ocupa todo el ancho", () => {
    const [s] = segmentosDelMes("2026-09-01", [{ desde: "2026-09-01", hasta: "2026-09-30" }]);
    expect(s.inicio).toBe(0);
    expect(s.fin).toBe(1);
  });

  it("un 1/2 mes ocupa aproximadamente la mitad", () => {
    const [s] = segmentosDelMes("2026-09-01", [{ desde: "2026-09-01", hasta: "2026-09-15" }]);
    expect(s.inicio).toBe(0);
    expect(s.fin).toBeGreaterThan(0.45);
    expect(s.fin).toBeLessThan(0.6);
  });

  it("un tramo que viene del mes anterior se recorta al borde, no se descarta", () => {
    const [s] = segmentosDelMes("2026-10-01", [{ desde: "2026-09-25", hasta: "2026-10-09" }]);
    expect(s.inicio).toBe(0);
    expect(s.fin).toBeGreaterThan(0);
  });

  it("ignora los tramos de otros meses", () => {
    expect(segmentosDelMes("2026-10-01", [{ desde: "2026-08-01", hasta: "2026-08-31" }])).toEqual(
      [],
    );
  });

  it("nunca devuelve un segmento fuera de 0..1", () => {
    const segmentos = segmentosDelMes("2026-09-01", [{ desde: "2026-08-01", hasta: "2026-10-31" }]);
    for (const s of segmentos) {
      expect(s.inicio).toBeGreaterThanOrEqual(0);
      expect(s.fin).toBeLessThanOrEqual(1);
    }
  });
});

describe("posicionEnElMes — el marcador de hoy", () => {
  it("el día 1 está al principio y el último al final", () => {
    expect(posicionEnElMes("2026-09-01")).toBe(0);
    expect(posicionEnElMes(ultimoDiaDelMes("2026-09-01"))).toBe(1);
  });
});
