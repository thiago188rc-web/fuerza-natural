import { describe, it, expect, vi, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { activityLog, students, studentEvents } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { CAMPOS, type Campo } from "@/domain/importacion/analisis";
import { seedTestGym } from "./helpers";

/**
 * El paso final del importador, contra Postgres real. Lo que importa
 * verificar acá es que el servidor NO confía en el análisis del navegador:
 * vuelve a validar cada fila, resuelve el plan por nombre dentro del
 * gimnasio de la sesión y vuelve a buscar duplicados contra el padrón.
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));

vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});

const { importarAlumnosAction } = await import("@/use-cases/importacion/importar-alumnos");
const { crearAlumnoAction } = await import("@/use-cases/alumnos/crear-alumno");
const { contarMovimientoDelPadron, movimientoPorMes } = await import("@/data/repositories/students-repo");

/**
 * Una fila tal como la manda el asistente: solo las columnas mapeadas, en
 * el orden de CAMPOS. La línea la numera el análisis (la primera fila de
 * datos es la 2, después del encabezado).
 */
function fila(nombre: string, apellido: string, extra: Partial<Record<Campo, string>> = {}): string[] {
  const valores: Record<Campo, string> = {
    nombre,
    apellido,
    telefono: "",
    plan: "3 días",
    fechaAlta: "",
    email: "",
    documento: "",
    notas: "",
    ...extra,
  };
  return CAMPOS.map((campo) => valores[campo]);
}

async function alumnosDelGimnasio(ctx: AuthContext) {
  return withTenantTx(ctx, (tx) => tx.select().from(students).where(eq(students.gymId, ctx.gymId)));
}

describe("importar alumnos (Postgres real)", () => {
  let ctx: AuthContext;
  let planId: string;

  beforeEach(async () => {
    const gym = await seedTestGym();
    ctx = gym.ctx;
    planId = gym.planId;
    sesion.ctx = ctx;
  });

  it("crea los alumnos como IMPORTACION, con su alta en el historial y UNA entrada de auditoría", async () => {
    const r = await importarAlumnosAction({
      nombreArchivo: "padron.xlsx",
      filas: [
        fila("Ángela", "Pérez", { telefono: "+54 9 11 5555-1234", fechaAlta: "2026-03-04", documento: "30123456" }),
        fila("Juan", "Gómez", { notas: "Lesión de rodilla" }),
      ],
    });
    expect(r).toMatchObject({ ok: true, data: { importados: 2, omitidos: [] } });

    const creados = await alumnosDelGimnasio(ctx);
    expect(creados).toHaveLength(2);
    const angela = creados.find((a) => a.nombre === "Ángela")!;
    expect(angela).toMatchObject({
      apellido: "Pérez",
      telefono: "+5491155551234",
      planId,
      fechaAltaOriginal: "2026-03-04",
      vinculoDesde: "2026-03-04",
      vinculo: "ACTIVO",
      documento: "30123456",
      origen: "IMPORTACION",
    });

    const altas = await withTenantTx(ctx, (tx) =>
      tx.select().from(studentEvents).where(and(eq(studentEvents.gymId, ctx.gymId), eq(studentEvents.tipo, "ALTA"))),
    );
    expect(altas).toHaveLength(2);

    const auditoria = await withTenantTx(ctx, (tx) =>
      tx.select().from(activityLog).where(and(eq(activityLog.gymId, ctx.gymId), eq(activityLog.accion, "students.imported"))),
    );
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.resumen).toContain("2 alumnos");
    expect(auditoria[0]!.resumen).toContain("padron.xlsx");
  });

  it("vuelve a validar en el servidor: plan inexistente, fecha futura y duplicados quedan afuera, con el motivo", async () => {
    const previo = await crearAlumnoAction({ nombre: "Laura", apellido: "Sosa", planId });
    expect(previo.ok).toBe(true);

    const r = await importarAlumnosAction({
      nombreArchivo: "padron.csv",
      filas: [
        fila("Ana", "Ruiz"),
        fila("Pedro", "Díaz", { plan: "Plan inventado" }),
        fila("Sol", "Vera", { fechaAlta: "2999-01-01" }),
        fila("laura", "SOSA"),
        fila("ANA", "ruiz"),
        fila("", "Sin Nombre"),
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));

    expect(r.data.importados).toBe(1);
    expect(r.data.omitidos.map((o) => o.linea)).toEqual([3, 4, 5, 6, 7]);
    for (const o of r.data.omitidos) expect(o.motivo.length).toBeGreaterThan(0);

    const nombres = (await alumnosDelGimnasio(ctx)).map((a) => `${a.nombre} ${a.apellido}`).sort();
    expect(nombres).toEqual(["Ana Ruiz", "Laura Sosa"]);
  });

  it("lo que el análisis marca como aviso se importa igual que en la vista previa: teléfono inválido vacío, fecha ilegible = hoy", async () => {
    const r = await importarAlumnosAction({
      nombreArchivo: "x.csv",
      filas: [fila("Ema", "Paz", { telefono: "1155551234", fechaAlta: "31/31/2026", email: "no-es-un-mail" })],
    });
    expect(r).toMatchObject({ ok: true, data: { importados: 1 } });
    const [ema] = await alumnosDelGimnasio(ctx);
    expect(ema!.telefono).toBeNull();
    expect(ema!.email).toBeNull();
    expect(ema!.fechaAltaOriginal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("informa las omisiones con la fila real del Excel que manda el asistente", async () => {
    const r = await importarAlumnosAction({
      nombreArchivo: "padron.xlsx",
      filas: [fila("Ana", "Ruiz"), fila("Pedro", "Díaz", { plan: "Plan inventado" })],
      lineas: [4, 9],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.data.omitidos.map((o) => o.linea)).toEqual([9]);
  });

  it("líneas que no corresponden a las filas se rechazan", async () => {
    const r = await importarAlumnosAction({ nombreArchivo: "x.csv", filas: [fila("Ana", "Ruiz")], lineas: [4, 5] });
    expect(r).toMatchObject({ ok: false, kind: "VALIDATION" });
  });

  it("Métricas no cuenta a los importados como alumnos nuevos: no se sumaron ese mes, ya estaban", async () => {
    const r = await importarAlumnosAction({
      nombreArchivo: "padron.xlsx",
      filas: [fila("Ana", "Ruiz"), fila("Luis", "Paz")],
    });
    expect(r).toMatchObject({ ok: true, data: { importados: 2 } });
    const manual = await crearAlumnoAction({ nombre: "Sol", apellido: "Vera", planId });
    expect(manual.ok).toBe(true);

    const rango = { desde: "2000-01-01", hasta: "2999-12-31" };
    const { periodo, porMes } = await withTenantTx(ctx, async (tx) => ({
      periodo: await contarMovimientoDelPadron(tx, ctx, rango),
      porMes: await movimientoPorMes(tx, ctx, rango),
    }));
    expect(periodo.nuevos).toBe(1);
    expect(porMes.filter((m) => m.tipo === "ALTA").reduce((s, m) => s + Number(m.total), 0)).toBe(1);
  });

  it("nombre y apellido en la MISMA columna: el servidor los separa igual que la vista previa", async () => {
    // Regresión: el asistente mandaba esa celda dos veces (como nombre y
    // como apellido) y el servidor, sin el mapeo, guardaba "SOSA, ANA" en
    // los dos campos y dejaba pasar a quien no tenía coma.
    const sinUsar = { telefono: -1, fechaAlta: -1, email: -1, documento: -1, notas: -1 };
    const r = await importarAlumnosAction({
      nombreArchivo: "SEPT 2026.xlsx",
      filas: [
        ["SOSA, ANA", "3"],
        ["JUAN PEREZ", "2"],
      ],
      columnas: { nombre: 0, apellido: 0, plan: 1, ...sinUsar },
      lineas: [2, 3],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.data.importados).toBe(1);
    expect(r.data.omitidos.map((o) => o.linea)).toEqual([3]);
    expect(r.data.omitidos[0]!.motivo).toMatch(/APELLIDO, NOMBRE/);

    const [ana] = await alumnosDelGimnasio(ctx);
    expect([ana!.apellido, ana!.nombre, ana!.planId]).toEqual(["SOSA", "ANA", planId]);
  });

  it("un mapeo que apunta fuera de las filas se rechaza", async () => {
    const r = await importarAlumnosAction({
      nombreArchivo: "x.xlsx",
      filas: [["SOSA, ANA", "3"]],
      columnas: { nombre: 0, apellido: 0, plan: 5, telefono: -1, fechaAlta: -1, email: -1, documento: -1, notas: -1 },
    });
    expect(r).toMatchObject({ ok: false, kind: "VALIDATION" });
  });

  it("STAFF no puede importar, y no se escribe nada", async () => {
    sesion.ctx = { ...ctx, rol: "STAFF" };
    const r = await importarAlumnosAction({ nombreArchivo: "x.csv", filas: [fila("Ana", "Ruiz")] });
    expect(r).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    sesion.ctx = ctx;
    expect(await alumnosDelGimnasio(ctx)).toHaveLength(0);
  });

  it("sin sesión no hay importación", async () => {
    sesion.ctx = null;
    const r = await importarAlumnosAction({ nombreArchivo: "x.csv", filas: [fila("Ana", "Ruiz")] });
    expect(r).toMatchObject({ ok: false, kind: "FORBIDDEN" });
  });

  it("un envío desmedido se rechaza entero, antes de tocar la base", async () => {
    const filas = Array.from({ length: 2001 }, (_, i) => fila(`N${i}`, `A${i}`));
    const r = await importarAlumnosAction({ nombreArchivo: "x.csv", filas });
    expect(r).toMatchObject({ ok: false, kind: "VALIDATION" });
    expect(await alumnosDelGimnasio(ctx)).toHaveLength(0);
  });
});
