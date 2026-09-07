import { describe, it, expect } from "vitest";
import { resolverFechaDeAlta } from "@/domain/alumnos/fecha-de-alta";

/**
 * `students` tiene un CHECK: `vinculo_desde >= fecha_alta_original`. El
 * dueño solo ve "Fecha de alta"; si la edita sin más, puede violarlo y
 * recibir un error crudo de Postgres. Estos casos cubren las cuatro
 * situaciones posibles.
 */

const HOY = "2026-09-07";

describe("resolverFechaDeAlta", () => {
  it("rechaza una fecha futura", () => {
    const r = resolverFechaDeAlta(
      { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-01-10" },
      "2026-12-31",
      HOY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("FECHA_FUTURA");
  });

  it("acepta hoy como fecha de alta (el borde)", () => {
    const r = resolverFechaDeAlta(
      { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-01-10" },
      HOY,
      HOY,
    );
    expect(r.ok).toBe(true);
  });

  it("sin cambios devuelve las fechas tal cual", () => {
    const actuales = { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-03-01" };
    const r = resolverFechaDeAlta(actuales, "2026-01-10", HOY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fechas).toEqual(actuales);
  });

  it("alumno que nunca cambió de estado: las dos fechas se mueven juntas", () => {
    const r = resolverFechaDeAlta(
      { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-01-10" },
      "2026-02-20",
      HOY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fechas).toEqual({ fechaAltaOriginal: "2026-02-20", vinculoDesde: "2026-02-20" });
    }
  });

  it("alumno con historial: se corrige el alta y NO se toca el hecho histórico del cambio de estado", () => {
    const r = resolverFechaDeAlta(
      { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-05-01" },
      "2026-01-05",
      HOY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fechas).toEqual({ fechaAltaOriginal: "2026-01-05", vinculoDesde: "2026-05-01" });
    }
  });

  it("alumno con historial: rechaza mover el alta después del último cambio de estado", () => {
    const r = resolverFechaDeAlta(
      { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-05-01" },
      "2026-06-01",
      HOY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("POSTERIOR_AL_ESTADO_ACTUAL");
  });

  it("cualquier resultado aceptado cumple el CHECK de la base", () => {
    const casos = [
      { actuales: { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-01-10" }, nueva: "2026-02-20" },
      { actuales: { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-05-01" }, nueva: "2026-01-05" },
      { actuales: { fechaAltaOriginal: "2026-01-10", vinculoDesde: "2026-05-01" }, nueva: "2026-05-01" },
    ];
    for (const caso of casos) {
      const r = resolverFechaDeAlta(caso.actuales, caso.nueva, HOY);
      if (r.ok) expect(r.fechas.vinculoDesde >= r.fechas.fechaAltaOriginal).toBe(true);
    }
  });
});
