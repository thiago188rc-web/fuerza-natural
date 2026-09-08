import { describe, it, expect } from "vitest";
import { preciosSchema } from "@/use-cases/gimnasio/configuracion";

const UUID = "11111111-2222-4333-8444-555555555555";

/**
 * El parseo de importes tiene una trampa que puede costar plata de verdad:
 * `Number("50.000")` es 50, no cincuenta mil. Alguien que escribe el precio
 * como lo escribe todo el mundo en Argentina guardaría un precio mil veces
 * menor, y el formulario de cobro lo autocompletaría sin avisar.
 */
describe("preciosSchema", () => {
  const conPrecio = (precio: unknown) =>
    preciosSchema.safeParse({ precios: [{ planId: UUID, precio }], precioMedioMes: "" });

  it("entiende el punto como separador de miles", () => {
    const r = conPrecio("50.000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.precios[0].precio).toBe(50000);
  });

  it("entiende el número escrito sin separadores", () => {
    const r = conPrecio("50000");
    if (r.success) expect(r.data.precios[0].precio).toBe(50000);
  });

  it("entiende la coma como separador decimal", () => {
    const r = conPrecio("1.250,50");
    if (r.success) expect(r.data.precios[0].precio).toBe(1250.5);
  });

  it("un campo vacío es 'sin confirmar', no cero", () => {
    const r = conPrecio("");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.precios[0].precio).toBeNull();
  });

  it("un precio negativo se rechaza", () => {
    expect(conPrecio("-100").success).toBe(false);
  });

  it("lo que no es un número se rechaza", () => {
    expect(conPrecio("gratis").success).toBe(false);
  });

  it("el precio de 1/2 mes se parsea igual que los de los planes", () => {
    const r = preciosSchema.safeParse({ precios: [], precioMedioMes: "45.000" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.precioMedioMes).toBe(45000);
  });
});
