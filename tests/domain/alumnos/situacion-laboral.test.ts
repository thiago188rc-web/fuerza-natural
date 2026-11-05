import { describe, it, expect } from "vitest";
import {
  SITUACIONES_LABORALES,
  ejemploDeDetalleLaboral,
  esSituacionLaboral,
  etiquetaSituacionLaboral,
  resumenLaboral,
} from "@/domain/alumnos/situacion-laboral";

describe("situación laboral", () => {
  it("el catálogo es el que pidió el gimnasio, en ese orden", () => {
    expect(SITUACIONES_LABORALES.map(etiquetaSituacionLaboral)).toEqual([
      "Sector privado",
      "Sector público",
      "Jubilado/a",
      "Estudiante",
      "Otro",
    ]);
  });

  it("rechaza lo que no es del catálogo", () => {
    expect(esSituacionLaboral("SECTOR_PUBLICO")).toBe(true);
    expect(esSituacionLaboral("Municipalidad")).toBe(false);
    expect(esSituacionLaboral(null)).toBe(false);
  });

  it("la ficha muestra categoría y detalle, cualquiera de los dos, o nada", () => {
    expect(resumenLaboral("SECTOR_PUBLICO", "Registro Civil")).toBe("Sector público · Registro Civil");
    expect(resumenLaboral("ESTUDIANTE", null)).toBe("Estudiante");
    expect(resumenLaboral(null, "Comercio de la esquina")).toBe("Comercio de la esquina");
    expect(resumenLaboral(null, "   ")).toBeNull();
    expect(resumenLaboral("INVENTADO", null)).toBeNull();
  });

  it("el ejemplo del detalle cambia según lo elegido", () => {
    expect(ejemploDeDetalleLaboral("SECTOR_PUBLICO")).toMatch(/Municipalidad/);
    expect(ejemploDeDetalleLaboral("ESTUDIANTE")).toMatch(/Institución/);
    expect(ejemploDeDetalleLaboral(null)).toBeTruthy();
  });
});
