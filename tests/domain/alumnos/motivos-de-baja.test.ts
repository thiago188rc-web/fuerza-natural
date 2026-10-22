import { describe, it, expect } from "vitest";
import { agregarMotivoAlCatalogo } from "@/domain/alumnos/motivos-de-baja";

const CATALOGO = [
  { codigo: "ECONOMICO", etiqueta: "Económico", orden: 1, activo: true },
  { codigo: "HORARIOS", etiqueta: "Horarios", orden: 2, activo: true },
  { codigo: "OTRO", etiqueta: "Otro", orden: 3, activo: true },
];

const enOrden = (lista: { codigo: string; orden: number }[]) =>
  [...lista].sort((a, b) => a.orden - b.orden).map((m) => m.codigo);

describe("agregarMotivoAlCatalogo", () => {
  it("el motivo nuevo entra antes de 'Otro', que queda último", () => {
    const conViaje = agregarMotivoAlCatalogo(CATALOGO, { codigo: "VIAJE", etiqueta: "Viaje" });
    const conAmbos = agregarMotivoAlCatalogo(conViaje, { codigo: "ENFERMEDAD", etiqueta: "Enfermedad" });
    expect(enOrden(conAmbos)).toEqual(["ECONOMICO", "HORARIOS", "VIAJE", "ENFERMEDAD", "OTRO"]);
  });

  it("conserva todos los motivos existentes con su código y su etiqueta", () => {
    const nuevo = agregarMotivoAlCatalogo(CATALOGO, { codigo: "VIAJE", etiqueta: "Viaje" });
    for (const m of CATALOGO) {
      expect(nuevo).toContainEqual(expect.objectContaining({ codigo: m.codigo, etiqueta: m.etiqueta }));
    }
    expect(nuevo.find((m) => m.codigo === "VIAJE")).toMatchObject({ activo: true });
  });

  it("sin 'Otro' en el catálogo, el nuevo va al final", () => {
    const sinOtro = CATALOGO.filter((m) => m.codigo !== "OTRO");
    expect(enOrden(agregarMotivoAlCatalogo(sinOtro, { codigo: "VIAJE", etiqueta: "Viaje" }))).toEqual([
      "ECONOMICO",
      "HORARIOS",
      "VIAJE",
    ]);
  });
});
