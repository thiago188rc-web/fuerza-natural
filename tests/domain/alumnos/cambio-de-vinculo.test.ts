import { describe, it, expect } from "vitest";
import {
  MOTIVO_BAJA_SIN_ESPECIFICAR,
  resolverCambioDeVinculo,
} from "@/domain/alumnos/cambio-de-vinculo";
import { esTransicionPermitida, transicionesPermitidas, VINCULOS } from "@/domain/alumnos/vinculo";

/**
 * El cambio de estado es la operación con más forma de tener un bug
 * silencioso: dejar un campo del estado anterior sin limpiar produce una
 * fila que la base rechaza (o peor, que acepta y miente). Como la decisión
 * entera vive en una función pura, se puede recorrer la matriz completa de
 * transiciones sin una sola conexión a Postgres.
 */

const HOY = "2026-09-07";
const ALTA = "2026-01-15";

describe("matriz de transiciones", () => {
  it("recorre las 9 combinaciones y solo acepta las declaradas como permitidas", () => {
    for (const desde of VINCULOS) {
      for (const hacia of VINCULOS) {
        const resultado = resolverCambioDeVinculo(
          { vinculo: desde, fechaAltaOriginal: ALTA },
          hacia,
          HOY,
          { nota: "motivo cualquiera" },
        );

        if (desde === hacia) {
          expect(resultado.ok, `${desde}→${hacia}`).toBe(false);
          if (!resultado.ok) expect(resultado.motivo).toBe("MISMO_ESTADO");
        } else if (esTransicionPermitida(desde, hacia)) {
          expect(resultado.ok, `${desde}→${hacia} debería permitirse`).toBe(true);
        } else {
          expect(resultado.ok, `${desde}→${hacia} NO debería permitirse`).toBe(false);
          if (!resultado.ok) expect(resultado.motivo).toBe("TRANSICION_INVALIDA");
        }
      }
    }
  });

  it("BAJA no puede ir directo a PAUSADO", () => {
    expect(transicionesPermitidas("BAJA")).toEqual(["ACTIVO"]);
  });
});

describe("dar de baja", () => {
  it("registra fecha y un código de motivo, y limpia los datos de pausa", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "PAUSADO", fechaAltaOriginal: ALTA },
      "BAJA",
      HOY,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cambio).toEqual({
      vinculo: "BAJA",
      vinculoDesde: HOY,
      pausaHasta: null,
      pausaNota: null,
      bajaFecha: HOY,
      bajaMotivoCodigo: MOTIVO_BAJA_SIN_ESPECIFICAR,
      bajaMotivoEtiqueta: "Sin especificar",
      bajaObservacion: null,
    });
    expect(resultado.evento).toBe("BAJA");
  });

  it("usa un código propio, distinto de OTRO, para que Fase 3 pueda pedir el motivo real", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "BAJA",
      HOY,
    );
    if (!resultado.ok) throw new Error("debería permitirse");
    expect(resultado.cambio.bajaMotivoCodigo).not.toBe("OTRO");
  });

  it("guarda la observación normalizada cuando el dueño escribe una", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "BAJA",
      HOY,
      { nota: "  se   mudó a Córdoba  " },
    );
    if (!resultado.ok) throw new Error("debería permitirse");
    expect(resultado.cambio.bajaObservacion).toBe("se mudó a Córdoba");
  });
});

describe("pausar", () => {
  it("rechaza una pausa sin fecha de vuelta ni motivo (espeja el CHECK de la base)", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("PAUSA_SIN_DATOS");
  });

  it("acepta solo con fecha", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
      { pausaHasta: "2026-10-01" },
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cambio.pausaHasta).toBe("2026-10-01");
    expect(resultado.cambio.pausaNota).toBeNull();
  });

  it("acepta solo con motivo", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
      { nota: "lesión" },
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cambio.pausaNota).toBe("lesión");
  });

  it("una nota de solo espacios no cuenta como motivo", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
      { nota: "     " },
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("PAUSA_SIN_DATOS");
  });

  it("rechaza una fecha de reanudación anterior a hoy", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
      { pausaHasta: "2026-08-01" },
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("PAUSA_HASTA_EN_EL_PASADO");
  });

  it("acepta pausar hasta hoy mismo (el borde)", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: ALTA },
      "PAUSADO",
      HOY,
      { pausaHasta: HOY },
    );
    expect(resultado.ok).toBe(true);
  });
});

describe("volver a ACTIVO", () => {
  it("desde BAJA limpia TODOS los campos de la baja — si no, el CHECK de la base rechaza la fila", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "BAJA", fechaAltaOriginal: ALTA },
      "ACTIVO",
      HOY,
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cambio).toEqual({
      vinculo: "ACTIVO",
      vinculoDesde: HOY,
      pausaHasta: null,
      pausaNota: null,
      bajaFecha: null,
      bajaMotivoCodigo: null,
      bajaMotivoEtiqueta: null,
      bajaObservacion: null,
    });
    expect(resultado.evento).toBe("REACTIVACION");
  });

  it("desde PAUSADO limpia los datos de la pausa y se registra como reanudación", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "PAUSADO", fechaAltaOriginal: ALTA },
      "ACTIVO",
      HOY,
    );
    if (!resultado.ok) throw new Error("debería permitirse");
    expect(resultado.cambio.pausaHasta).toBeNull();
    expect(resultado.cambio.pausaNota).toBeNull();
    expect(resultado.evento).toBe("REANUDACION");
  });
});

describe("coherencia con fecha_alta_original", () => {
  it("rechaza el cambio si el alumno tiene una fecha de alta futura", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: "2026-12-01" },
      "BAJA",
      HOY,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("FECHA_ANTERIOR_AL_ALTA");
  });

  it("acepta si el alta es exactamente hoy", () => {
    const resultado = resolverCambioDeVinculo(
      { vinculo: "ACTIVO", fechaAltaOriginal: HOY },
      "BAJA",
      HOY,
    );
    expect(resultado.ok).toBe(true);
  });

  it("todo cambio deja vinculo_desde >= fecha_alta_original", () => {
    for (const desde of VINCULOS) {
      for (const hacia of transicionesPermitidas(desde)) {
        const resultado = resolverCambioDeVinculo(
          { vinculo: desde, fechaAltaOriginal: ALTA },
          hacia,
          HOY,
          { nota: "x" },
        );
        if (!resultado.ok) throw new Error(`${desde}→${hacia} debería permitirse`);
        expect(resultado.cambio.vinculoDesde >= ALTA).toBe(true);
      }
    }
  });
});

describe("pureza", () => {
  it("no lee el reloj: el mismo input da el mismo resultado siempre", () => {
    const entrada = () =>
      resolverCambioDeVinculo({ vinculo: "ACTIVO", fechaAltaOriginal: ALTA }, "BAJA", HOY);
    expect(entrada()).toEqual(entrada());
  });
});
