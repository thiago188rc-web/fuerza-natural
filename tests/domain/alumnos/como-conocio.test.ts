import { describe, it, expect } from "vitest";
import { leerComoConocio, ordenarCanales } from "@/domain/alumnos/como-conocio";
import { telefonoArgentino, esGimnasioArgentino } from "@/domain/alumnos/identidad";

describe("leerComoConocio", () => {
  it("lee los valores de la base del gimnasio, con y sin acento", () => {
    expect(leerComoConocio("RECOMENDACIÓN")).toEqual(["RECOMENDACION"]);
    expect(leerComoConocio("VIVE CERCA")).toEqual(["VIVE_CERCA"]);
    expect(leerComoConocio("RED SOCIAL")).toEqual(["REDES_SOCIALES"]);
    expect(leerComoConocio("VENIA ANTES")).toEqual(["YA_VENIA"]);
    expect(leerComoConocio("IBA ANTES")).toEqual(["YA_VENIA"]);
  });

  it("tolera los tipeos reales de la planilla", () => {
    expect(leerComoConocio("RECOMEMDACION")).toEqual(["RECOMENDACION"]);
    expect(leerComoConocio("RECOENDACION")).toEqual(["RECOMENDACION"]);
    expect(leerComoConocio("VICE CERCA")).toEqual(["VIVE_CERCA"]);
  });

  it("separa las combinaciones y las devuelve en el orden del catálogo", () => {
    expect(leerComoConocio("VIVE CERCA/RECOMENDACIÓN")).toEqual(["RECOMENDACION", "VIVE_CERCA"]);
    expect(leerComoConocio("RED SOCIAL/VIVE CERCA")).toEqual(["VIVE_CERCA", "REDES_SOCIALES"]);
  });

  it("una celda vacía o de relleno es 'sin dato', no 'otro'", () => {
    expect(leerComoConocio("")).toBeNull();
    expect(leerComoConocio(null)).toBeNull();
    expect(leerComoConocio("//////////////")).toBeNull();
  });

  it("lo que no encaja en ninguna categoría es OTRO", () => {
    expect(leerComoConocio("CARTEL EN LA PUERTA")).toEqual(["OTRO"]);
  });

  it("ordenarCanales descarta lo que no es del catálogo", () => {
    expect(ordenarCanales(["OTRO", "INVENTADO", "RECOMENDACION"])).toEqual(["RECOMENDACION", "OTRO"]);
  });
});

describe("telefonoArgentino", () => {
  it("10 dígitos (característica + número) → celular E.164", () => {
    expect(telefonoArgentino("2804001234")).toBe("+5492804001234");
    expect(telefonoArgentino("11 5555-1234")).toBe("+5491155551234");
  });

  it("con el 0 de la característica, o con el 54 adelante", () => {
    expect(telefonoArgentino("02804001234")).toBe("+5492804001234");
    expect(telefonoArgentino("542804001234")).toBe("+5492804001234");
    expect(telefonoArgentino("+54 9 280 400 1234")).toBe("+5492804001234");
  });

  it("no completa lo ambiguo: un dígito de menos, uno de más, el 15 en el medio", () => {
    expect(telefonoArgentino("280400123")).toBeNull();
    expect(telefonoArgentino("11400012345")).toBeNull();
    expect(telefonoArgentino("0280 15 4001234")).toBeNull();
    expect(telefonoArgentino("/////")).toBeNull();
  });

  it("solo aplica a gimnasios en Argentina", () => {
    expect(esGimnasioArgentino("America/Argentina/Buenos_Aires")).toBe(true);
    expect(esGimnasioArgentino("America/Montevideo")).toBe(false);
  });
});
