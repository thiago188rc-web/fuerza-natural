import { describe, it, expect, vi, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/context";
import { activityLog, students, studentEvents } from "@/data/schema";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { seedTestGym } from "./helpers";

/**
 * Los casos de uso de alumnos, de punta a punta, contra Postgres REAL —
 * con RLS, CHECKs y triggers activos. Lo único simulado es la sesión:
 * `getAuthContext()` necesita cookies y un servidor de auth, que no
 * existen en un runner de tests. Todo lo demás (autorización por rol, AAL,
 * transacción con contexto de tenant, policies, auditoría) es el código
 * real.
 *
 * Se salta entero si no hay DATABASE_URL (checkout limpio sin Postgres).
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));

vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});

const { crearAlumnoAction } = await import("@/use-cases/alumnos/crear-alumno");
const { editarAlumnoAction } = await import("@/use-cases/alumnos/editar-alumno");
const { cambiarVinculoAction } = await import("@/use-cases/alumnos/cambiar-vinculo");
const { listarAlumnosQuery, obtenerFichaAlumnoQuery } = await import(
  "@/use-cases/alumnos/consultas"
);

async function altaRapida(planId: string, nombre: string, apellido: string, extra = {}) {
  const r = await crearAlumnoAction({ nombre, apellido, planId, ...extra });
  if (!r.ok) throw new Error(`alta falló: ${JSON.stringify(r)}`);
  return r.data;
}

async function leerAlumno(ctx: AuthContext, id: string) {
  return withTenantTx(ctx, async (tx) => {
    const [row] = await tx.select().from(students).where(eq(students.id, id));
    return row ?? null;
  });
}

async function contarAuditoria(ctx: AuthContext, alumnoId: string, accion?: string) {
  return withTenantTx(ctx, async (tx) => {
    const filas = await tx
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entidad, "student"), eq(activityLog.entidadId, alumnoId)));
    return accion ? filas.filter((f) => f.accion === accion) : filas;
  });
}

describe.skipIf(!process.env.DATABASE_URL)("casos de uso de alumnos (Postgres real)", () => {
  beforeEach(() => {
    sesion.ctx = null;
  });

  describe("autorización — la barrera existe aunque la pantalla no se muestre", () => {
    it("sin sesión, el alta devuelve FORBIDDEN y no escribe nada", async () => {
      sesion.ctx = null;
      const r = await crearAlumnoAction({ nombre: "Ana", apellido: "Gómez", planId: crypto.randomUUID() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("FORBIDDEN");
    });

    it("un DUENO con solo contraseña (aal1) no puede crear un alumno", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = { ...ctx, aal: "aal1" };

      const r = await crearAlumnoAction({ nombre: "Ana", apellido: "Gómez", planId });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("FORBIDDEN");
    });

    it("un rol fuera de la lista permitida tampoco pasa", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = { ...ctx, rol: "AUDITOR" as never };

      const r = await crearAlumnoAction({ nombre: "Ana", apellido: "Gómez", planId });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("FORBIDDEN");
    });
  });

  describe("alta", () => {
    it("crea el alumno en ACTIVO, con historial y auditoría, en una sola transacción", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;

      const creado = await altaRapida(planId, "Ana", "Gómez", { telefono: "+5491155550001" });
      const fila = await leerAlumno(ctx, creado.id);

      expect(fila?.vinculo).toBe("ACTIVO");
      expect(fila?.gymId).toBe(ctx.gymId);
      expect(fila?.telefono).toBe("+5491155550001");
      // Alta: las dos fechas arrancan iguales.
      expect(fila?.vinculoDesde).toBe(fila?.fechaAltaOriginal);

      const eventos = await withTenantTx(ctx, (tx) =>
        tx.select().from(studentEvents).where(eq(studentEvents.studentId, creado.id)),
      );
      expect(eventos.map((e) => e.tipo)).toEqual(["ALTA"]);

      const auditoria = await contarAuditoria(ctx, creado.id, "student.created");
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0].actorEmailSnapshot).toBe(ctx.email);
    });

    it("acepta un alumno SIN teléfono (regresión: en Fase 0 la columna era NOT NULL)", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;

      const creado = await altaRapida(planId, "Sin", "Telefono", { telefono: "" });
      const fila = await leerAlumno(ctx, creado.id);
      expect(fila?.telefono).toBeNull();
    });

    it("normaliza el teléfono con separadores de tipeo", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;

      const creado = await altaRapida(planId, "Con", "Formato", {
        telefono: "+54 9 (11) 5555-0002",
      });
      const fila = await leerAlumno(ctx, creado.id);
      expect(fila?.telefono).toBe("+5491155550002");
    });

    it("rechaza una fecha de alta futura con un mensaje, no con un error de base", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;

      const r = await crearAlumnoAction({
        nombre: "Futuro",
        apellido: "Imposible",
        planId,
        fechaAltaOriginal: "2099-01-01",
      });
      expect(r.ok).toBe(false);
      if (!r.ok && r.kind === "VALIDATION") {
        expect(r.issues[0].path).toBe("fechaAltaOriginal");
      } else {
        throw new Error("debería ser un error de validación");
      }
    });

    it("NO permite usar un plan de otro gimnasio, aunque se mande su id exacto", async () => {
      const { ctx: gymA } = await seedTestGym();
      const { planId: planDeB } = await seedTestGym();
      sesion.ctx = gymA;

      const r = await crearAlumnoAction({ nombre: "Ana", apellido: "Gómez", planId: planDeB });
      expect(r.ok).toBe(false);
      if (!r.ok && r.kind === "VALIDATION") expect(r.issues[0].path).toBe("planId");
      else throw new Error("debería rechazar el plan de otro gimnasio");
    });
  });

  describe("edición", () => {
    it("actualiza la MISMA fila (no crea un duplicado) y audita qué cambió", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Ana", "Gomez");
      const original = await leerAlumno(ctx, creado.id);

      const r = await editarAlumnoAction({
        id: creado.id,
        nombre: "Ana María",
        apellido: "Gómez",
        planId,
        fechaAltaOriginal: original!.fechaAltaOriginal,
        telefono: "+5491155559999",
      });
      expect(r.ok).toBe(true);

      const total = await withTenantTx(ctx, (tx) =>
        tx.select().from(students).where(eq(students.gymId, ctx.gymId)),
      );
      expect(total).toHaveLength(1);

      const fila = await leerAlumno(ctx, creado.id);
      expect(fila?.nombre).toBe("Ana María");
      expect(fila?.apellido).toBe("Gómez");
      expect(fila?.telefono).toBe("+5491155559999");

      const auditoria = await contarAuditoria(ctx, creado.id, "student.updated");
      expect(auditoria).toHaveLength(1);
      const cambios = auditoria[0].cambios as Record<string, { antes: unknown; despues: unknown }>;
      expect(cambios.nombre).toEqual({ antes: "Ana", despues: "Ana María" });
      expect(cambios.apellido).toEqual({ antes: "Gomez", despues: "Gómez" });
    });

    it("una edición sin cambios reales no escribe ni ensucia la auditoría", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Ana", "Gómez");
      const original = await leerAlumno(ctx, creado.id);

      const r = await editarAlumnoAction({
        id: creado.id,
        nombre: "Ana",
        apellido: "Gómez",
        planId,
        fechaAltaOriginal: original!.fechaAltaOriginal,
        telefono: "",
        notas: "",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.huboCambios).toBe(false);

      expect(await contarAuditoria(ctx, creado.id, "student.updated")).toHaveLength(0);
    });

    it("editar un alumno de OTRO gimnasio devuelve NOT_FOUND y no lo toca", async () => {
      const { ctx: gymA } = await seedTestGym();
      const { ctx: gymB, planId: planB } = await seedTestGym();

      sesion.ctx = gymB;
      const alumnoDeB = await altaRapida(planB, "Ana", "Gómez");

      sesion.ctx = gymA;
      const r = await editarAlumnoAction({
        id: alumnoDeB.id,
        nombre: "HACKEADO",
        apellido: "HACKEADO",
        planId: planB,
        fechaAltaOriginal: "2026-01-01",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("NOT_FOUND");

      const sigueIgual = await leerAlumno(gymB, alumnoDeB.id);
      expect(sigueIgual?.nombre).toBe("Ana");
    });
  });

  describe("cambio de estado", () => {
    it("BAJA no borra: la fila sigue existiendo, con fecha y motivo", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Se", "Fue");

      const r = await cambiarVinculoAction({ id: creado.id, vinculo: "BAJA" });
      expect(r.ok).toBe(true);

      const fila = await leerAlumno(ctx, creado.id);
      expect(fila).not.toBeNull();
      expect(fila?.vinculo).toBe("BAJA");
      expect(fila?.bajaFecha).not.toBeNull();
      expect(fila?.bajaMotivoCodigo).toBe("SIN_ESPECIFICAR");

      const eventos = await withTenantTx(ctx, (tx) =>
        tx.select().from(studentEvents).where(eq(studentEvents.studentId, creado.id)),
      );
      expect(eventos.map((e) => e.tipo).sort()).toEqual(["ALTA", "BAJA"]);
      expect(await contarAuditoria(ctx, creado.id, "student.status_changed")).toHaveLength(1);
    });

    it("reactivar desde BAJA limpia los campos de la baja (si no, el CHECK de la base rechazaría)", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Vuelve", "Otra Vez");

      await cambiarVinculoAction({ id: creado.id, vinculo: "BAJA" });
      const r = await cambiarVinculoAction({ id: creado.id, vinculo: "ACTIVO" });
      expect(r.ok).toBe(true);

      const fila = await leerAlumno(ctx, creado.id);
      expect(fila?.vinculo).toBe("ACTIVO");
      expect(fila?.bajaFecha).toBeNull();
      expect(fila?.bajaMotivoCodigo).toBeNull();
      expect(fila?.bajaMotivoEtiqueta).toBeNull();
    });

    it("pausar sin fecha ni motivo se rechaza como error de validación", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Pausa", "Vacia");

      const r = await cambiarVinculoAction({ id: creado.id, vinculo: "PAUSADO" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("VALIDATION");

      expect((await leerAlumno(ctx, creado.id))?.vinculo).toBe("ACTIVO");
    });

    it("pausar con fecha guarda la pausa y limpia al reanudar", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Pausa", "Valida");

      const pausado = await cambiarVinculoAction({
        id: creado.id,
        vinculo: "PAUSADO",
        nota: "viaje de trabajo",
      });
      expect(pausado.ok).toBe(true);
      expect((await leerAlumno(ctx, creado.id))?.pausaNota).toBe("viaje de trabajo");

      await cambiarVinculoAction({ id: creado.id, vinculo: "ACTIVO" });
      const fila = await leerAlumno(ctx, creado.id);
      expect(fila?.vinculo).toBe("ACTIVO");
      expect(fila?.pausaNota).toBeNull();
      expect(fila?.pausaHasta).toBeNull();
    });

    it("rechaza una transición no permitida (BAJA → PAUSADO)", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Baja", "Directa");
      await cambiarVinculoAction({ id: creado.id, vinculo: "BAJA" });

      const r = await cambiarVinculoAction({ id: creado.id, vinculo: "PAUSADO", nota: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("CONFLICT");
      expect((await leerAlumno(ctx, creado.id))?.vinculo).toBe("BAJA");
    });

    it("rechaza cambiar al mismo estado", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Mismo", "Estado");

      const r = await cambiarVinculoAction({ id: creado.id, vinculo: "ACTIVO" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("CONFLICT");
    });

    it("no se puede dar de baja a un alumno de otro gimnasio", async () => {
      const { ctx: gymA } = await seedTestGym();
      const { ctx: gymB, planId: planB } = await seedTestGym();

      sesion.ctx = gymB;
      const alumnoDeB = await altaRapida(planB, "Ana", "Gómez");

      sesion.ctx = gymA;
      const r = await cambiarVinculoAction({ id: alumnoDeB.id, vinculo: "BAJA" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("NOT_FOUND");

      expect((await leerAlumno(gymB, alumnoDeB.id))?.vinculo).toBe("ACTIVO");
    });
  });

  describe("listado y ficha", () => {
    it("solo devuelve alumnos del gimnasio de la sesión", async () => {
      const { ctx: gymA, planId: planA } = await seedTestGym();
      const { ctx: gymB, planId: planB } = await seedTestGym();

      sesion.ctx = gymA;
      await altaRapida(planA, "AlumnoDe", "GimnasioA");
      sesion.ctx = gymB;
      await altaRapida(planB, "AlumnoDe", "GimnasioB");

      sesion.ctx = gymA;
      const r = await listarAlumnosQuery({ q: undefined, estado: "TODOS", pagina: 1 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.total).toBe(1);
      expect(r.data.filas[0].apellido).toBe("GimnasioA");
    });

    it("la búsqueda ignora acentos y mayúsculas", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      await altaRapida(planId, "Ángela", "Núñez");

      for (const termino of ["angela", "ANGELA", "nunez", "Núñez"]) {
        const r = await listarAlumnosQuery({ q: termino, estado: "TODOS", pagina: 1 });
        if (!r.ok) throw new Error("la consulta debería funcionar");
        expect(r.data.total, `buscando "${termino}"`).toBe(1);
      }
    });

    it("la búsqueda encuentra aunque se escriba apellido y después nombre", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      await altaRapida(planId, "Ana", "Gómez");

      const r = await listarAlumnosQuery({ q: "gomez ana", estado: "TODOS", pagina: 1 });
      if (!r.ok) throw new Error("la consulta debería funcionar");
      expect(r.data.total).toBe(1);
    });

    it("un término con % no devuelve a todo el gimnasio", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      await altaRapida(planId, "Ana", "Gómez");
      await altaRapida(planId, "Juan", "Pérez");

      const r = await listarAlumnosQuery({ q: "%", estado: "TODOS", pagina: 1 });
      if (!r.ok) throw new Error("la consulta debería funcionar");
      expect(r.data.total).toBe(0);
    });

    it("el filtro por estado devuelve solo ese estado, y los contadores cuentan todos", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const a = await altaRapida(planId, "Sigue", "Activo");
      const b = await altaRapida(planId, "Se", "Dio de Baja");
      await cambiarVinculoAction({ id: b.id, vinculo: "BAJA" });

      const soloBajas = await listarAlumnosQuery({ q: undefined, estado: "BAJA", pagina: 1 });
      if (!soloBajas.ok) throw new Error("la consulta debería funcionar");
      expect(soloBajas.data.filas.map((f) => f.id)).toEqual([b.id]);
      expect(soloBajas.data.conteoPorVinculo).toMatchObject({ ACTIVO: 1, BAJA: 1 });

      const activos = await listarAlumnosQuery({ q: undefined, estado: "ACTIVO", pagina: 1 });
      if (!activos.ok) throw new Error("la consulta debería funcionar");
      expect(activos.data.filas.map((f) => f.id)).toEqual([a.id]);
    });

    it("la ficha de un alumno de otro gimnasio devuelve NOT_FOUND, no sus datos", async () => {
      const { ctx: gymA } = await seedTestGym();
      const { ctx: gymB, planId: planB } = await seedTestGym();

      sesion.ctx = gymB;
      const alumnoDeB = await altaRapida(planB, "Ana", "Gómez");

      sesion.ctx = gymA;
      const r = await obtenerFichaAlumnoQuery(alumnoDeB.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("NOT_FOUND");
    });

    it("la ficha trae el historial completo del alumno", async () => {
      const { ctx, planId } = await seedTestGym();
      sesion.ctx = ctx;
      const creado = await altaRapida(planId, "Con", "Historial");
      await cambiarVinculoAction({ id: creado.id, vinculo: "PAUSADO", nota: "lesión" });
      await cambiarVinculoAction({ id: creado.id, vinculo: "ACTIVO" });

      const r = await obtenerFichaAlumnoQuery(creado.id);
      if (!r.ok) throw new Error("la ficha debería existir");
      expect(r.data.eventos.map((e) => e.tipo).sort()).toEqual(["ALTA", "PAUSA", "REANUDACION"]);
      expect(r.data.alumno.planNombre).toBeTruthy();
    });
  });
});
