import "dotenv/config";
import postgres from "postgres";
import { leerArgumentos } from "./_compartido";

/**
 * CONCILIACIÓN DE UN MES: por qué "Pagos registrados" no coincide con
 * "Activos hoy" (o con el "X de Y" del Panel). SOLO LECTURA.
 *
 *   npx tsx scripts/db/produccion.ts scripts/db/conciliar-pagos.ts --mes 2026-10
 *   npx tsx scripts/db/conciliar-pagos.ts --mes 2026-10       # base local
 *
 * Existe porque la pregunta ya apareció dos veces (191/192 el 2026-10-22,
 * 197/198 después) y la respuesta correcta nunca es "forzar que den
 * igual": son números de cosas distintas. Este script los cruza, nombra
 * a cada persona que explica la diferencia y además revisa la integridad
 * de los pagos del mes (tramos que faltan, tramos de otro alumno,
 * posibles duplicados, cobertura superpuesta).
 *
 * Corre en una transacción READ ONLY y con el rol de solo lectura cuando
 * está disponible (`DATABASE_URL_READONLY`): no hay forma de que escriba.
 * Imprime nombres de alumnos en la terminal — no pegar la salida en
 * documentos del repositorio, que es público.
 */

interface Fila {
  [columna: string]: unknown;
}

function titulo(texto: string) {
  console.log(`\n── ${texto} ${"─".repeat(Math.max(0, 66 - texto.length))}`);
}

function tabla(filas: Fila[], vacio = "  (ninguno)") {
  if (filas.length === 0) {
    console.log(vacio);
    return;
  }
  console.table(filas);
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const url = process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL;
  if (!url) throw new Error("No hay DATABASE_URL_READONLY ni DATABASE_URL.");

  const mesArg = args.get("mes");
  if (mesArg && !/^\d{4}-\d{2}$/.test(mesArg)) throw new Error("--mes tiene que ser AAAA-MM.");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
  try {
    let gymId = args.get("gym-id") ?? "";
    if (!gymId) gymId = await idDelGimnasio(url);

    await sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`select set_config('app.gym_id', ${gymId}, true)`;

      const [gym] = await tx<{ nombre: string; timezone: string; hoy: string }[]>`
        select nombre, timezone, (now() at time zone timezone)::date::text as hoy
        from app.gyms where id = ${gymId}`;
      if (!gym) throw new Error("No se encontró el gimnasio (¿RLS sin contexto?).");

      const desde = mesArg ? `${mesArg}-01` : `${gym.hoy.slice(0, 7)}-01`;
      const [{ hasta }] = await tx<{ hasta: string }[]>`
        select ((${desde}::date + interval '1 month')::date - 1)::text as hasta`;

      console.log(`Gimnasio: ${gym.nombre} (${gymId})   Hoy: ${gym.hoy}   Mes: ${desde} → ${hasta}`);

      // ── Los números tal como los muestran las pantallas ──────────────
      const [pagos] = await tx<
        { vigentes: number; anulados: number; personas: number; total: string }[]
      >`
        select count(*) filter (where anulado_en is null)::int as vigentes,
               count(*) filter (where anulado_en is not null)::int as anulados,
               count(distinct student_id) filter (where anulado_en is null)::int as personas,
               coalesce(sum(monto) filter (where anulado_en is null), 0)::text as total
        from app.payments
        where gym_id = ${gymId} and fecha_pago between ${desde} and ${hasta}`;

      const vinculos = await tx<{ vinculo: string; n: number }[]>`
        select vinculo, count(*)::int as n from app.students
        where gym_id = ${gymId} group by vinculo order by vinculo`;
      const activos = vinculos.find((v) => v.vinculo === "ACTIVO")?.n ?? 0;

      // Activos que HOY caen dentro de un tramo vigente: lo que el Panel
      // muestra como "X de Y con el mes cubierto" (sin la gracia ni la
      // tolerancia de alta, que solo cambian el color, no este conteo).
      const [{ cubiertosHoy }] = await tx<{ cubiertosHoy: number }[]>`
        select count(distinct s.id)::int as "cubiertosHoy"
        from app.students s
        join app.payment_periods pp on pp.student_id = s.id and pp.gym_id = s.gym_id
        join app.payments p on p.id = pp.payment_id and p.anulado_en is null
        where s.gym_id = ${gymId} and s.vinculo = 'ACTIVO'
          and ${gym.hoy}::date between pp.cubre_desde and pp.cubre_hasta`;

      titulo("Lo que muestran las pantallas");
      console.log(`  Pagos registrados (vigentes, por fecha de cobro): ${pagos!.vigentes}`);
      console.log(`  Anulados en el mes (no cuentan en ningún total):   ${pagos!.anulados}`);
      console.log(`  Alumnos que pagaron (personas distintas):          ${pagos!.personas}`);
      console.log(`  Total cobrado:                                      $${Number(pagos!.total).toLocaleString("es-AR")}`);
      console.log(`  Activos hoy (padrón):                               ${activos}`);
      console.log(`  Activos cubiertos hoy (Panel):                      ${cubiertosHoy}`);
      console.log(`  Padrón completo: ${vinculos.map((v) => `${v.vinculo} ${v.n}`).join(" · ")}`);

      // ── Lo que explica la diferencia ─────────────────────────────────
      const masDeUnPago = await tx<Fila[]>`
        select s.apellido || ', ' || s.nombre as alumno, s.vinculo,
               count(*)::int as pagos,
               string_agg(p.fecha_pago::text || ' $' || p.monto::int::text
                 || ' cubre ' || coalesce((select min(cubre_desde)::text || '→' || max(cubre_hasta)::text
                                           from app.payment_periods where payment_id = p.id), 'NADA'),
                          '  |  ' order by p.fecha_pago, p.created_at) as detalle
        from app.payments p join app.students s on s.id = p.student_id
        where p.gym_id = ${gymId} and p.anulado_en is null
          and p.fecha_pago between ${desde} and ${hasta}
        group by s.id having count(*) > 1 order by s.apellido, s.nombre`;

      const pagaronYNoEstanActivos = await tx<Fila[]>`
        select s.apellido || ', ' || s.nombre as alumno, s.vinculo,
               s.baja_fecha::text as baja, s.pausa_hasta::text as pausa_hasta,
               count(*)::int as pagos
        from app.payments p join app.students s on s.id = p.student_id
        where p.gym_id = ${gymId} and p.anulado_en is null
          and p.fecha_pago between ${desde} and ${hasta}
          and s.vinculo <> 'ACTIVO'
        group by s.id order by s.apellido, s.nombre`;

      const activosSinPagoEnElMes = await tx<Fila[]>`
        select s.apellido || ', ' || s.nombre as alumno, s.fecha_alta_original::text as alta,
               (select max(pp.cubre_hasta)::text from app.payment_periods pp
                  join app.payments p2 on p2.id = pp.payment_id and p2.anulado_en is null
                 where pp.student_id = s.id) as cubierto_hasta,
               (select max(p3.fecha_pago)::text from app.payments p3
                 where p3.student_id = s.id and p3.anulado_en is null) as ultimo_pago
        from app.students s
        where s.gym_id = ${gymId} and s.vinculo = 'ACTIVO'
          and not exists (select 1 from app.payments p
                          where p.student_id = s.id and p.anulado_en is null
                            and p.fecha_pago between ${desde} and ${hasta})
        order by s.apellido, s.nombre`;

      const extras = pagos!.vigentes - pagos!.personas;
      const personasActivas = pagos!.personas - pagaronYNoEstanActivos.length;

      titulo("Cómo se cruzan");
      console.log(`  ${pagos!.vigentes} pagos = ${pagos!.personas} personas + ${extras} pago(s) de más de quienes pagaron más de una vez`);
      console.log(`  ${pagos!.personas} personas = ${personasActivas} hoy ACTIVAS + ${pagaronYNoEstanActivos.length} hoy NO activas`);
      console.log(`  ${activos} activos = ${personasActivas} que pagaron en el mes + ${activosSinPagoEnElMes.length} sin pago con fecha en el mes`);
      console.log(`  Diferencia pagos − activos = ${pagos!.vigentes - activos} = ${extras} + ${pagaronYNoEstanActivos.length} − ${activosSinPagoEnElMes.length}`);

      titulo("Pagaron más de una vez en el mes");
      tabla(masDeUnPago);
      titulo("Pagaron en el mes y hoy no están activos");
      tabla(pagaronYNoEstanActivos);
      titulo("Activos sin ningún pago con fecha en el mes");
      tabla(activosSinPagoEnElMes);

      // ── Integridad: lo que NO debería existir ────────────────────────
      const sinTramos = await tx<Fila[]>`
        select p.id, p.fecha_pago::text as fecha, p.monto::int as monto, s.apellido || ', ' || s.nombre as alumno
        from app.payments p join app.students s on s.id = p.student_id
        where p.gym_id = ${gymId} and p.fecha_pago between ${desde} and ${hasta}
          and not exists (select 1 from app.payment_periods pp where pp.payment_id = p.id)`;

      const tramoDeOtroAlumno = await tx<Fila[]>`
        select p.id as pago, p.student_id as alumno_del_pago, pp.student_id as alumno_del_tramo
        from app.payment_periods pp join app.payments p on p.id = pp.payment_id
        where p.gym_id = ${gymId} and pp.student_id <> p.student_id`;

      // Mismo alumno, misma fecha de cobro: el doble registro que NO se
      // superpone (el segundo cae solo en el mes siguiente). Puede ser
      // legítimo —pagó el atrasado y el actual—; por eso se lista con lo
      // que cubre cada uno, para decidir mirándolo.
      const posiblesDuplicados = await tx<Fila[]>`
        select s.apellido || ', ' || s.nombre as alumno, p.fecha_pago::text as fecha,
               count(*)::int as veces,
               string_agg('$' || p.monto::int::text || ' cubre ' || coalesce(
                 (select min(cubre_desde)::text || '→' || max(cubre_hasta)::text
                    from app.payment_periods where payment_id = p.id), 'NADA'), '  |  ') as cubren
        from app.payments p join app.students s on s.id = p.student_id
        where p.gym_id = ${gymId} and p.anulado_en is null
          and p.fecha_pago between ${desde} and ${hasta}
        group by s.id, p.fecha_pago having count(*) > 1`;

      // Dos pagos vigentes del mismo alumno que cubren algún día en común.
      // Puede ser legítimo (un ajuste confirmado), pero tiene que verse.
      const superpuestos = await tx<Fila[]>`
        select s.apellido || ', ' || s.nombre as alumno,
               a.cubre_desde::text || '→' || a.cubre_hasta::text as tramo_a,
               b.cubre_desde::text || '→' || b.cubre_hasta::text as tramo_b
        from app.payment_periods a
        join app.payments pa on pa.id = a.payment_id and pa.anulado_en is null
        join app.payment_periods b on b.student_id = a.student_id and b.payment_id > a.payment_id
        join app.payments pb on pb.id = b.payment_id and pb.anulado_en is null
        join app.students s on s.id = a.student_id
        where a.gym_id = ${gymId}
          and a.cubre_desde <= b.cubre_hasta and b.cubre_desde <= a.cubre_hasta
          and (pa.fecha_pago between ${desde} and ${hasta} or pb.fecha_pago between ${desde} and ${hasta})
        order by 1`;

      titulo("Integridad");
      console.log(`  Pagos del mes sin tramos (no cubren nada):          ${sinTramos.length}`);
      console.log(`  Tramos cuyo alumno no es el del pago (todo el hist.): ${tramoDeOtroAlumno.length}`);
      console.log(`  Mismo alumno y fecha de cobro (revisar qué cubren): ${posiblesDuplicados.length}`);
      console.log(`  Coberturas superpuestas entre pagos vigentes:       ${superpuestos.length}`);
      if (sinTramos.length) tabla(sinTramos);
      if (tramoDeOtroAlumno.length) tabla(tramoDeOtroAlumno);
      if (posiblesDuplicados.length) tabla(posiblesDuplicados);
      if (superpuestos.length) tabla(superpuestos);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * El único gimnasio real. `fn_readonly` no puede listarlos (`app_users`
 * tiene RLS y sin `app.gym_id` no devuelve filas), así que esto usa el
 * dueño del esquema si está — siempre dentro de una transacción READ ONLY.
 */
async function idDelGimnasio(urlPorDefecto: string): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL_OWNER || urlPorDefecto, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connect_timeout: 15,
  });
  try {
    const todos = await sql.begin("read only", async (tx) => {
      const ids = await tx<{ gym_id: string }[]>`select distinct gym_id from app.app_users`;
      const salida: { id: string; nombre: string }[] = [];
      for (const { gym_id } of ids) {
        await tx`select set_config('app.gym_id', ${gym_id}, true)`;
        const [gym] = await tx<{ nombre: string }[]>`select nombre from app.gyms where id = ${gym_id}`;
        salida.push({ id: gym_id, nombre: gym?.nombre ?? "(sin nombre)" });
      }
      return salida;
    });
    const reales = todos.filter((g) => !/demo/i.test(g.nombre));
    if (reales.length !== 1) {
      throw new Error(
        `Hay ${reales.length} gimnasios posibles: pasá --gym-id. ` +
          reales.map((g) => `${g.nombre} = ${g.id}`).join(" · "),
      );
    }
    return reales[0]!.id;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
