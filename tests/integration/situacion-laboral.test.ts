import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { activityLog, gymSettings, students } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { seedTestGym } from "./helpers";

/**
 * "¿Dónde trabaja o cuál es su situación actual?" en el alta, la ficha y
 * la edición. Contra Postgres REAL: los CHECK de la migración 0011 tienen
 * que aceptar lo que acepta la app y rechazar lo que no. Datos inventados.
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});

const { crearAlumnoAction } = await import("@/use-cases/alumnos/crear-alumno");
const { editarAlumnoAction } = await import("@/use-cases/alumnos/editar-alumno");
const { fichaCompletaQuery } = await import("@/use-cases/alumnos/ficha");

async function leer(ctx: AuthContext, id: string) {
  return withTenantTx(ctx, async (tx) => (await tx.select().from(students).where(eq(students.id, id)))[0]!);
}

describe.skipIf(!process.env.DATABASE_URL)("situación laboral del alumno (Postgres real)", () => {
  beforeEach(() => {
    sesion.ctx = null;
  });

  it("7. alta con sector privado y la empresa: se guarda y aparece en la ficha", async () => {
    const { ctx, planId } = await seedTestGym();
    // La ficha lee la configuración del gimnasio (ventana de pago, gracia).
    await withTenantTx(ctx, (tx) => tx.insert(gymSettings).values({ gymId: ctx.gymId }));
    sesion.ctx = ctx;
    const r = await crearAlumnoAction({
      nombre: "Ana",
      apellido: "Privado",
      planId,
      situacionLaboral: "SECTOR_PRIVADO",
      situacionLaboralDetalle: "Comercio de ropa",
    });
    if (!r.ok) throw new Error(JSON.stringify(r));

    const fila = await leer(ctx, r.data.id);
    expect(fila.situacionLaboral).toBe("SECTOR_PRIVADO");
    expect(fila.situacionLaboralDetalle).toBe("Comercio de ropa");

    const ficha = await fichaCompletaQuery(r.data.id);
    if (!ficha.ok) throw new Error(JSON.stringify(ficha));
    expect(ficha.data.alumno.situacionLaboral).toBe("SECTOR_PRIVADO");
    expect(ficha.data.alumno.situacionLaboralDetalle).toBe("Comercio de ropa");
  });

  it("8. alta con sector público y el organismo", async () => {
    const { ctx, planId } = await seedTestGym();
    sesion.ctx = ctx;
    const r = await crearAlumnoAction({
      nombre: "Beto",
      apellido: "Publico",
      planId,
      situacionLaboral: "SECTOR_PUBLICO",
      situacionLaboralDetalle: "Registro Civil",
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(await leer(ctx, r.data.id)).toMatchObject({
      situacionLaboral: "SECTOR_PUBLICO",
      situacionLaboralDetalle: "Registro Civil",
    });
  });

  it("9. jubilado sin detalle, estudiante con su institución, y alguien que no quiere decirlo", async () => {
    const { ctx, planId } = await seedTestGym();
    sesion.ctx = ctx;
    const jubilado = await crearAlumnoAction({ nombre: "Ceci", apellido: "Jubilada", planId, situacionLaboral: "JUBILADO" });
    const estudiante = await crearAlumnoAction({
      nombre: "Dani",
      apellido: "Estudia",
      planId,
      situacionLaboral: "ESTUDIANTE",
      situacionLaboralDetalle: "Instituto de Formación Docente",
    });
    const sinDato = await crearAlumnoAction({
      nombre: "Eli",
      apellido: "Reservada",
      planId,
      situacionLaboral: "",
      situacionLaboralDetalle: "",
    });
    if (!jubilado.ok || !estudiante.ok || !sinDato.ok) {
      throw new Error(JSON.stringify({ jubilado, estudiante, sinDato }));
    }
    expect(await leer(ctx, jubilado.data.id)).toMatchObject({
      situacionLaboral: "JUBILADO",
      situacionLaboralDetalle: null,
    });
    expect(await leer(ctx, estudiante.data.id)).toMatchObject({ situacionLaboral: "ESTUDIANTE" });
    expect(await leer(ctx, sinDato.data.id)).toMatchObject({
      situacionLaboral: null,
      situacionLaboralDetalle: null,
    });
  });

  it("10. se edita sin crear otro alumno, queda en la auditoría y se puede borrar", async () => {
    const { ctx, planId } = await seedTestGym();
    sesion.ctx = ctx;
    const alta = await crearAlumnoAction({ nombre: "Fede", apellido: "Cambia", planId, situacionLaboral: "ESTUDIANTE" });
    if (!alta.ok) throw new Error(JSON.stringify(alta));
    const id = alta.data.id;
    const base = { id, nombre: "Fede", apellido: "Cambia", planId, fechaAltaOriginal: (await leer(ctx, id)).fechaAltaOriginal };

    const editado = await editarAlumnoAction({
      ...base,
      situacionLaboral: "SECTOR_PUBLICO",
      situacionLaboralDetalle: "Municipalidad",
    });
    expect(editado.ok && editado.data.huboCambios).toBe(true);
    expect(await leer(ctx, id)).toMatchObject({
      situacionLaboral: "SECTOR_PUBLICO",
      situacionLaboralDetalle: "Municipalidad",
    });

    // La misma persona, no una nueva.
    const todos = await withTenantTx(ctx, (tx) => tx.select({ id: students.id }).from(students));
    expect(todos.map((s) => s.id)).toEqual([id]);

    const auditoria = await withTenantTx(ctx, (tx) =>
      tx.select().from(activityLog).where(eq(activityLog.entidadId, id)),
    );
    const actualizacion = auditoria.find((a) => a.accion === "student.updated");
    expect(actualizacion?.resumen).toMatch(/Situación laboral/);

    // Quitar el dato también es una edición válida.
    const borrado = await editarAlumnoAction({ ...base, situacionLaboral: "", situacionLaboralDetalle: "" });
    expect(borrado.ok).toBe(true);
    expect(await leer(ctx, id)).toMatchObject({ situacionLaboral: null, situacionLaboralDetalle: null });
  });

  it("la base rechaza una categoría fuera del catálogo aunque alguien saltee la app", async () => {
    const { ctx, planId } = await seedTestGym();
    sesion.ctx = ctx;
    const alta = await crearAlumnoAction({ nombre: "Gabi", apellido: "Directo", planId });
    if (!alta.ok) throw new Error(JSON.stringify(alta));
    await expect(
      withTenantTx(ctx, (tx) =>
        tx.update(students).set({ situacionLaboral: "INVENTADO" }).where(eq(students.id, alta.data.id)),
      ),
    ).rejects.toThrow();
  });
});
