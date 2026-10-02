import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { leerArgumentos, listarGimnasios } from "../db/_compartido";
import { leerBaseGeneral, leerControlDeCuotas } from "./planillas";
import { construirPlan, type AlumnoMigrado, type PlanDeMigracion } from "./plan";
import { etiquetaCanal } from "@/domain/alumnos/como-conocio";
import { hoyISO } from "@/domain/fechas/hoy";

/**
 * MIGRACIÓN INICIAL DESDE LAS PLANILLAS DEL GIMNASIO.
 *
 *   npx tsx --env-file=.env.local scripts/migracion/migrar-planillas.ts \
 *     --base "BASE DE DATOS GYM.xlsx" --cuotas "CONTROL CUOTA GYM - 2026.xlsx" \
 *     --reporte informe.md [--alias alias.json] [--aplicar]
 *
 * Sin `--aplicar` solo escribe el reporte: qué se carga, qué se descarta,
 * qué se emparejó por parecido. El reporte tiene datos personales, así que
 * va FUERA del repositorio (o a un nombre que .gitignore ignore).
 *
 * Con `--aplicar`, todo en UNA transacción (o entra completo o no entra
 * nada), con DATABASE_URL_OWNER y el contexto de RLS del gimnasio. Se
 * niega si el gimnasio ya tiene datos cargados a mano (pagos, alumnos de
 * alta manual o historia que no sea la de una importación): es una carga
 * INICIAL, no un merge, y pisar trabajo del dueño no tiene vuelta.
 */

const MESES_ES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function informe(plan: PlanDeMigracion): string {
  const a = plan.alumnos;
  const activos = a.filter((x) => x.vinculo === "ACTIVO");
  const pagos = a.flatMap((x) => x.pagos);
  const porMes = new Map<string, { cantidad: number; total: number }>();
  for (const p of pagos) {
    const mes = p.fecha.slice(0, 7);
    const m = porMes.get(mes) ?? { cantidad: 0, total: 0 };
    m.cantidad++;
    m.total += p.monto;
    porMes.set(mes, m);
  }
  const lineas: string[] = [];
  lineas.push("# Migración de planillas — informe", "");
  lineas.push(`- Alumnos: **${a.length}** (activos ${activos.length}, de baja ${a.length - activos.length})`);
  lineas.push(`- Solo en la base: ${a.filter((x) => x.fuente === "BASE").length} · base + cuotas: ${a.filter((x) => x.fuente === "BASE+CUOTAS").length} · solo en cuotas: ${a.filter((x) => x.fuente === "CUOTAS").length}`);
  lineas.push(`- Pagos: **${pagos.length}** · descartados: ${plan.descartados.length}`);
  lineas.push(`- Con plan por defecto (sin dato): ${a.filter((x) => x.planPorDefecto).length}`);
  lineas.push(`- Con teléfono: ${a.filter((x) => x.telefono).length} · con DNI: ${a.filter((x) => x.documento).length} · con nacimiento: ${a.filter((x) => x.fechaNacimiento).length} · con “cómo conoció”: ${a.filter((x) => x.comoConocio).length}`);
  lineas.push("", "## Cobrado por mes (fecha de pago)", "", "| Mes | Pagos | Total |", "|---|---|---|");
  for (const [mes, m] of [...porMes].sort()) lineas.push(`| ${mes} | ${m.cantidad} | $${m.total.toLocaleString("es-AR")} |`);
  lineas.push("", "## Bajas por mes: plan vs hoja BAJAS del dueño", "", "| Mes | Plan | Planilla |", "|---|---|---|");
  for (const c of plan.controlDeBajas) lineas.push(`| ${MESES_ES[Number(c.mes.slice(5, 7))]} | ${c.plan} | ${c.planilla} |`);
  const altas = new Map<string, { nuevos: number; volvieron: number }>();
  for (const x of a) for (const e of x.eventos) {
    if (e.fecha < "2026-01-01" || e.tipo === "BAJA") continue;
    const mes = e.fecha.slice(0, 7);
    const m = altas.get(mes) ?? { nuevos: 0, volvieron: 0 };
    if (e.tipo === "ALTA") m.nuevos++;
    else m.volvieron++;
    altas.set(mes, m);
  }
  lineas.push("", "## Altas por mes (2026)", "", "| Mes | Nuevos | Volvieron |", "|---|---|---|");
  for (const [mes, m] of [...altas].sort()) lineas.push(`| ${mes} | ${m.nuevos} | ${m.volvieron} |`);
  const canales = new Map<string, number>();
  for (const x of a) for (const c of x.comoConocio ?? ["(sin dato)"]) canales.set(c, (canales.get(c) ?? 0) + 1);
  lineas.push("", "## Cómo conoció el gym (menciones)", "");
  for (const [c, n] of [...canales].sort((x, y) => y[1] - x[1])) lineas.push(`- ${c === "(sin dato)" ? c : etiquetaCanal(c as never)}: ${n}`);
  lineas.push("", "## Emparejados por parecido (revisar)", "");
  for (const e of plan.emparejados.filter((x) => !x.exacto)) lineas.push(`- ${e.planilla} → ${e.base}`);
  lineas.push("", "## Solo en el control de cuotas (no están en la base)", "");
  for (const x of a.filter((y) => y.fuente === "CUOTAS")) lineas.push(`- ${x.apellido}, ${x.nombre} — ${x.vinculo}, ${x.pagos.length} pagos`);
  lineas.push("", "## Avisos", "", ...plan.avisos.map((x) => `- ${x}`));
  lineas.push("", "## Descartados", "", ...plan.descartados.map((x) => `- ${x}`));
  lineas.push("", "## Notas por alumno", "");
  for (const x of a.filter((y) => y.notas)) lineas.push(`- ${x.apellido}, ${x.nombre}: ${x.notas}`);
  return lineas.join("\n") + "\n";
}

async function aplicar(sql: postgres.Sql, gymId: string, plan: PlanDeMigracion, planIds: Map<string, { id: string; dias: number }>) {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.gym_id', ${gymId}, true)`;

    const [dueno] = await tx<{ id: string; email: string; rol: string }[]>`
      select id, email, rol from app.app_users where gym_id = ${gymId} and rol = 'DUENO' and activo order by created_at limit 1`;
    if (!dueno) throw new Error("El gimnasio no tiene un DUEÑO activo: los pagos necesitan a alguien que los registre.");

    // Guarda: solo se reemplaza una importación previa sin nada encima.
    const [estado] = await tx<{ pagos: number; manuales: number; eventos: number; asistencias: number }[]>`
      select
        (select count(*) from app.payments)::int as pagos,
        (select count(*) from app.students where origen <> 'IMPORTACION')::int as manuales,
        (select count(*) from app.student_events
           where not (tipo = 'ALTA' and coalesce(datos->>'origen','') = 'IMPORTACION'))::int as eventos,
        (select count(*) from app.attendance)::int as asistencias`;
    if (estado.pagos || estado.manuales || estado.eventos || estado.asistencias) {
      throw new Error(
        `El gimnasio ya tiene datos que no son de una importación (pagos ${estado.pagos}, ` +
          `alumnos manuales ${estado.manuales}, eventos ${estado.eventos}, asistencias ${estado.asistencias}). ` +
          "Esta migración es solo para la carga inicial: no se aplica.",
      );
    }

    const previos = await tx`select count(*)::int as n from app.students`;
    await tx`delete from app.student_events`;
    await tx`delete from app.students`;

    const alumnosFila = plan.alumnos.map((x: AlumnoMigrado) => ({
      gym_id: gymId,
      nombre: x.nombre,
      apellido: x.apellido,
      telefono: x.telefono,
      documento: x.documento,
      fecha_nacimiento: x.fechaNacimiento,
      direccion: x.direccion,
      como_conocio: x.comoConocio,
      vinculo: x.vinculo,
      plan_id: planIds.get(x.planNombre)!.id,
      fecha_alta_original: x.fechaAltaOriginal,
      vinculo_desde: x.vinculoDesde,
      baja_fecha: x.bajaFecha,
      baja_motivo_codigo: x.vinculo === "BAJA" ? "DEJO_DE_ASISTIR" : null,
      baja_motivo_etiqueta: x.vinculo === "BAJA" ? "Dejó de asistir" : null,
      baja_observacion: x.bajaObservacion,
      notas: x.notas,
      origen: "IMPORTACION",
    }));

    const ids: string[] = [];
    for (let i = 0; i < alumnosFila.length; i += 200) {
      const lote = alumnosFila.slice(i, i + 200);
      const filas = await tx<{ id: string }[]>`insert into app.students ${tx(lote)} returning id`;
      ids.push(...filas.map((f) => f.id));
    }

    const eventos = plan.alumnos.flatMap((x, i) =>
      x.eventos.map((e) => ({
        gym_id: gymId,
        student_id: ids[i],
        tipo: e.tipo,
        ocurrido_el: e.fecha,
        datos: tx.json(
          e.tipo === "ALTA"
            ? { origen: "MIGRACION" }
            : e.tipo === "BAJA"
              ? { origen: "MIGRACION", motivoEtiqueta: "Dejó de asistir", observacion: "Dejó de pagar según el control de cuotas." }
              : { origen: "MIGRACION" },
        ),
        creado_por: dueno.id,
      })),
    );
    for (let i = 0; i < eventos.length; i += 500) await tx`insert into app.student_events ${tx(eventos.slice(i, i + 500))}`;

    let cantidadPagos = 0;
    for (const [i, x] of plan.alumnos.entries()) {
      for (const p of x.pagos) {
        const plan = planIds.get(p.planNombre)!;
        const [pago] = await tx<{ id: string }[]>`
          insert into app.payments (gym_id, student_id, fecha_pago, plan_id, plan_dias_snapshot, plan_nombre_snapshot,
            modalidad, monto, metodo, nota, registrado_por, idempotency_key)
          values (${gymId}, ${ids[i]}, ${p.fecha}, ${plan.id}, ${plan.dias}, ${p.planNombre},
            ${p.modalidad}, ${p.monto}, 'OTRO', ${p.nota}, ${dueno.id}, ${p.clave})
          returning id`;
        await tx`insert into app.payment_periods ${tx(
          p.tramos.map((t) => ({
            gym_id: gymId,
            payment_id: pago.id,
            student_id: ids[i],
            periodo: t.periodo,
            cubre_desde: t.cubreDesde,
            cubre_hasta: t.cubreHasta,
          })),
        )}`;
        cantidadPagos++;
      }
    }

    await tx`
      insert into app.activity_log (gym_id, actor_user_id, actor_email_snapshot, actor_rol_snapshot, accion, entidad, resumen, cambios)
      values (${gymId}, ${dueno.id}, ${dueno.email}, ${dueno.rol}, 'students.migrated', 'student',
        ${`Migración inicial desde las planillas: ${ids.length} alumnos, ${cantidadPagos} pagos. Reemplaza la importación previa de ${previos[0].n} alumnos.`},
        ${tx.json({ alumnos: ids.length, pagos: cantidadPagos, reemplazados: previos[0].n })})`;

    console.log(`✓ Aplicado: ${ids.length} alumnos, ${eventos.length} eventos, ${cantidadPagos} pagos (reemplazó ${previos[0].n}).`);
  });
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const rutaBase = args.get("base");
  const rutaCuotas = args.get("cuotas");
  const rutaReporte = args.get("reporte");
  if (!rutaBase || !rutaCuotas || !rutaReporte) {
    console.error("Uso: --base <xlsx> --cuotas <xlsx> --reporte <md> [--alias <json>] [--gym <uuid>] [--aplicar]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("Falta DATABASE_URL_OWNER.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const gyms = await listarGimnasios(sql);
    const gymId = args.get("gym") || (gyms.length === 1 ? gyms[0].id : null);
    if (!gymId) {
      throw new Error(`Hay ${gyms.length} gimnasios (${gyms.map((g) => `${g.nombre} ${g.id}`).join(", ")}): indicá cuál con --gym.`);
    }

    const { planesFilas, timezone } = await sql.begin(async (tx) => {
      await tx`select set_config('app.gym_id', ${gymId}, true)`;
      const [gym] = await tx<{ timezone: string; nombre: string }[]>`select timezone, nombre from app.gyms where id = ${gymId}`;
      if (!gym) throw new Error(`No existe el gimnasio ${gymId}.`);
      console.log(`Gimnasio: ${gym.nombre}`);
      const planes = await tx<{ id: string; nombre: string; dias_semana: number }[]>`select id, nombre, dias_semana from app.plans where activo`;
      return { planesFilas: planes, timezone: gym.timezone };
    });
    const planIds = new Map(planesFilas.map((p) => [p.nombre, { id: p.id, dias: p.dias_semana }]));

    const alias = new Map<string, string>();
    if (args.get("alias")) {
      const { readFileSync } = await import("node:fs");
      for (const [k, v] of Object.entries(JSON.parse(readFileSync(args.get("alias")!, "utf8")) as Record<string, string>)) alias.set(k, v);
    }

    const base = await leerBaseGeneral(rutaBase);
    const { pagos, bajasPorMes } = await leerControlDeCuotas(rutaCuotas, 2026);
    const hoy = hoyISO(timezone);
    const plan = construirPlan(base, pagos, bajasPorMes, {
      anio: 2026,
      mesDelPadron: "2026-09-01",
      mesEnCurso: "2026-10-01",
      hoy,
      planes: new Map([...planIds].map(([n, p]) => [n, { dias: p.dias }])),
      planPorDefecto: "2 días",
      alias,
    });

    const faltantes = [...new Set(plan.alumnos.flatMap((x) => [x.planNombre, ...x.pagos.map((p) => p.planNombre)]))].filter((n) => !planIds.has(n));
    if (faltantes.length) throw new Error(`Planes que no existen en el gimnasio: ${faltantes.join(", ")}`);

    writeFileSync(rutaReporte, informe(plan), "utf8");
    console.log(`Informe: ${rutaReporte}`);
    console.log(`Alumnos ${plan.alumnos.length} · activos ${plan.alumnos.filter((x) => x.vinculo === "ACTIVO").length} · pagos ${plan.alumnos.reduce((s, x) => s + x.pagos.length, 0)} · avisos ${plan.avisos.length}`);

    if (args.has("aplicar")) await aplicar(sql, gymId, plan, planIds);
    else console.log("(modo reporte: no se escribió nada; agregá --aplicar para cargar)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
