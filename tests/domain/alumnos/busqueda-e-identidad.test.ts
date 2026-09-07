import { describe, it, expect } from "vitest";
import { escaparComodinesLike, normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";
import {
  nombreCompleto,
  normalizarTelefono,
  normalizarTexto,
} from "@/domain/alumnos/identidad";

/**
 * El Data Discovery encontró nombres con acentos inconsistentes, espacios
 * de más y errores de tipeo. Estas funciones son la respuesta a eso, y son
 * puras — así que se pueden testear con los casos reales que rompieron el
 * Excel, sin base de datos.
 */

describe("normalizarTerminoBusqueda", () => {
  it("saca acentos para que 'gomez' encuentre a 'Gómez'", () => {
    expect(normalizarTerminoBusqueda("Gómez")).toBe("gomez");
  });

  it("pasa a minúsculas", () => {
    expect(normalizarTerminoBusqueda("MARTINEZ")).toBe("martinez");
  });

  it("colapsa espacios internos y recorta los extremos", () => {
    expect(normalizarTerminoBusqueda("  ana    maria  ")).toBe("ana maria");
  });

  it("cubre los acentos y la ñ del español", () => {
    expect(normalizarTerminoBusqueda("Muñoz Peña Ángel Íñigo")).toBe("munoz pena angel inigo");
  });

  it("es idempotente: normalizar dos veces da lo mismo", () => {
    const una = normalizarTerminoBusqueda("Ángela  Núñez");
    expect(normalizarTerminoBusqueda(una)).toBe(una);
  });

  it("un término vacío o de solo espacios queda vacío (el repositorio lo usa para no filtrar)", () => {
    expect(normalizarTerminoBusqueda("   ")).toBe("");
  });
});

describe("escaparComodinesLike", () => {
  it("escapa el % para que buscar '100%' no devuelva a todo el gimnasio", () => {
    expect(escaparComodinesLike("100%")).toBe("100\\%");
  });

  it("escapa el _ (comodín de un carácter en LIKE)", () => {
    expect(escaparComodinesLike("a_b")).toBe("a\\_b");
  });

  it("escapa la propia barra invertida", () => {
    expect(escaparComodinesLike("a\\b")).toBe("a\\\\b");
  });

  it("no toca un término normal", () => {
    expect(escaparComodinesLike("gomez")).toBe("gomez");
  });
});

describe("normalizarTexto", () => {
  it("recorta y colapsa espacios", () => {
    expect(normalizarTexto("  Ana   María  ")).toBe("Ana María");
  });

  it("NO cambia mayúsculas ni minúsculas: capitalizar apellidos automáticamente se equivoca", () => {
    expect(normalizarTexto("de la Cruz")).toBe("de la Cruz");
    expect(normalizarTexto("MacLeod")).toBe("MacLeod");
    expect(normalizarTexto("GARCÍA")).toBe("GARCÍA");
  });
});

describe("normalizarTelefono", () => {
  it("saca espacios, guiones y paréntesis de tipeo", () => {
    expect(normalizarTelefono("+54 9 (11) 5555-1234")).toBe("+5491155551234");
  });

  it("no inventa un prefijo de país: suponerlo sería inventar un dato", () => {
    expect(normalizarTelefono("1155551234")).toBe("1155551234");
  });

  it("deja intacto un número que ya está en E.164", () => {
    expect(normalizarTelefono("+5491155551234")).toBe("+5491155551234");
  });
});

describe("nombreCompleto", () => {
  it("arma el nombre para mostrar", () => {
    expect(nombreCompleto("Ana", "Gómez")).toBe("Ana Gómez");
  });
});
