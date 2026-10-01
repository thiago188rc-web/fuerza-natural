"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  Loader2,
  Upload,
  Users,
} from "lucide-react";
import type { ContextoDeImportacion } from "@/use-cases/importacion/consultas";
import { importarAlumnos } from "@/app/(app)/importar/actions";
import { leerArchivo, type ResultadoDeLectura } from "./leer-archivo";
import { recortarAColumnasUsadas } from "@/domain/importacion/planilla";
import {
  analizarFilas,
  CAMPOS,
  detectarColumnas,
  ETIQUETA_CAMPO,
  separarNombreCompleto,
  type Campo,
  type FilaAnalizada,
} from "@/domain/importacion/analisis";
import { Button } from "@/components/ui/button";
import { BotonLink } from "@/components/boton-link";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * EL ASISTENTE DE IMPORTACIÓN.
 *
 * ARCHIVO → COLUMNAS → REVISIÓN → IMPORTAR, con el archivo abriéndose
 * entero en el navegador. Nada se sube a ningún lado mientras se mira: una
 * planilla de alumnos son datos personales de cientos de personas, y
 * mandarla a un servidor "para previsualizar" es exponerla sin necesidad.
 *
 * El análisis que se ve es REAL: lee el archivo de verdad (.xlsx o CSV),
 * aplica las mismas normalizaciones que usa el alta manual y compara
 * contra los alumnos que ya existen en este gimnasio. Al confirmar, el
 * servidor vuelve a correr ese mismo análisis contra su propio padrón y
 * escribe solo las filas limpias (ver importar-alumnos.ts).
 */

type Paso = "ARCHIVO" | "COLUMNAS" | "REVISION";

type ArchivoLeido = Extract<ResultadoDeLectura, { ok: true }>;

export function AsistenteDeImportacion({ contexto }: { contexto: ContextoDeImportacion }) {
  const quieto = useReducedMotion();
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [columnas, setColumnas] = useState<Record<Campo, number> | null>(null);
  const [paso, setPaso] = useState<Paso>("ARCHIVO");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [soloProblemas, setSoloProblemas] = useState(false);

  const hoja = archivo ? archivo.hojas[archivo.hoja] : undefined;

  const analisis = useMemo(() => {
    if (!hoja || !columnas) return null;
    return analizarFilas(hoja.filas, columnas, {
      planes: contexto.planes,
      existentes: contexto.existentes,
      hoy: contexto.hoy,
      lineas: hoja.lineas,
    });
  }, [hoja, columnas, contexto]);

  async function leer(file: File) {
    setError(null);
    setLeyendo(true);
    try {
      const leido = await leerArchivo(file);
      if (!leido.ok) {
        setError(leido.error);
        return;
      }
      setArchivo(leido);
      setColumnas(detectarColumnas(leido.hojas[leido.hoja]!.encabezados));
      setPaso("COLUMNAS");
    } finally {
      setLeyendo(false);
    }
  }

  function cambiarHoja(indice: number) {
    if (!archivo) return;
    setArchivo({ ...archivo, hoja: indice });
    setColumnas(detectarColumnas(archivo.hojas[indice]!.encabezados));
  }

  function volverAEmpezar() {
    setArchivo(null);
    setColumnas(null);
    setError(null);
    setPaso("ARCHIVO");
  }

  return (
    <div className="space-y-5">
      <Pasos actual={paso} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso}
          initial={quieto ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={quieto ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: DURACION.normal, ease: SALIDA }}
        >
          {paso === "ARCHIVO" ? (
            <ZonaDeArchivo onArchivo={leer} error={error} leyendo={leyendo} />
          ) : paso === "COLUMNAS" && archivo && columnas ? (
            <MapeoDeColumnas
              archivo={archivo}
              columnas={columnas}
              onCambio={setColumnas}
              onCambiarHoja={cambiarHoja}
              onVolver={volverAEmpezar}
              onSeguir={() => setPaso("REVISION")}
            />
          ) : analisis && archivo && hoja && columnas ? (
            <Revision
              nombreArchivo={archivo.nombre}
              analisis={analisis}
              filasParaImportar={() => ({
                ...recortarAColumnasUsadas(hoja.filas, columnas),
                lineas: hoja.lineas,
              })}
              soloProblemas={soloProblemas}
              onFiltro={setSoloProblemas}
              onVolver={() => setPaso("COLUMNAS")}
              onEmpezarDeNuevo={volverAEmpezar}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const ETIQUETAS_DE_PASO: { id: Paso; etiqueta: string }[] = [
  { id: "ARCHIVO", etiqueta: "Archivo" },
  { id: "COLUMNAS", etiqueta: "Columnas" },
  { id: "REVISION", etiqueta: "Revisión" },
];

function Pasos({ actual }: { actual: Paso }) {
  const quieto = useReducedMotion();
  const indiceActual = ETIQUETAS_DE_PASO.findIndex((p) => p.id === actual);

  return (
    <ol className="flex items-center gap-2 text-xs">
      {ETIQUETAS_DE_PASO.map((paso, i) => {
        const hecho = i < indiceActual;
        const activo = i === indiceActual;
        return (
          <li key={paso.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors duration-200",
                activo
                  ? "bg-foreground text-background"
                  : hecho
                    ? "text-cubierto"
                    : "text-muted-foreground",
              )}
            >
              {hecho ? (
                <CheckCircle2 className="size-3.5" strokeWidth={2} />
              ) : (
                <span className="tabular font-mono">{i + 1}</span>
              )}
              {paso.etiqueta}
            </span>
            {i < ETIQUETAS_DE_PASO.length - 1 ? (
              <span aria-hidden className="h-px w-6 bg-border">
                <motion.span
                  className="block h-px bg-cubierto"
                  initial={false}
                  animate={{ scaleX: hecho ? 1 : 0 }}
                  style={{ transformOrigin: "left" }}
                  transition={{ duration: quieto ? 0 : DURACION.normal, ease: SALIDA }}
                />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ZonaDeArchivo({
  onArchivo,
  error,
  leyendo,
}: {
  onArchivo: (file: File) => void;
  error: string | null;
  leyendo: boolean;
}) {
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          const file = e.dataTransfer.files[0];
          if (file) onArchivo(file);
        }}
        className={cn(
          "superficie flex flex-col items-center px-6 py-16 text-center transition-colors duration-200",
          encima && "border-verde bg-verde-suave/40",
        )}
      >
        <span
          className={cn(
            "grid size-12 place-items-center rounded-full transition-colors duration-200",
            encima ? "bg-verde text-background" : "bg-muted text-muted-foreground",
          )}
        >
          <Upload className="size-5" strokeWidth={1.75} />
        </span>

        <h2 className="mt-4 t-seccion">
          Arrastrá la planilla de alumnos
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Una planilla de Excel (.xlsx) o un CSV. El archivo se abre acá, en tu computadora: no se
          sube a ningún lado hasta que decidas importarlo.
        </p>

        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Vaciar el input: elegir el MISMO archivo de nuevo (después de
            // corregirlo en Excel) tiene que volver a leerlo.
            e.target.value = "";
            if (file) onArchivo(file);
          }}
        />
        <Button type="button" className="mt-5" disabled={leyendo} onClick={() => input.current?.click()}>
          {leyendo ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {leyendo ? "Leyendo la planilla…" : "Elegir un archivo"}
        </Button>

        {error ? (
          <p role="alert" className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4" strokeWidth={2} />
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Se reconocen las columnas más comunes (nombre, apellido, teléfono, plan, fecha de alta), con
        o sin acentos, aunque la planilla tenga un título arriba de la tabla. Después vas a poder
        corregir el emparejamiento. Un Excel antiguo (.xls) hay que guardarlo antes como .xlsx.
      </p>
    </div>
  );
}

function MapeoDeColumnas({
  archivo,
  columnas,
  onCambio,
  onCambiarHoja,
  onVolver,
  onSeguir,
}: {
  archivo: ArchivoLeido;
  columnas: Record<Campo, number>;
  onCambio: (c: Record<Campo, number>) => void;
  onCambiarHoja: (indice: number) => void;
  onVolver: () => void;
  onSeguir: () => void;
}) {
  const obligatorios: Campo[] = ["nombre", "apellido", "plan"];
  const faltan = obligatorios.filter((c) => columnas[c] === -1);
  const hoja = archivo.hojas[archivo.hoja]!;
  // "NOMBRE Y APELLIDO" en una sola columna: el ejemplo muestra cómo se
  // separa, no la celda entera dos veces.
  const juntos = columnas.nombre >= 0 && columnas.nombre === columnas.apellido;

  function ejemplo(campo: Campo): string {
    const celda = hoja.filas[0]?.[columnas[campo]] ?? "";
    if (!juntos || (campo !== "nombre" && campo !== "apellido")) return celda;
    const separado = separarNombreCompleto(celda);
    if (!separado) return `${celda} (sin coma: no se puede separar)`;
    return campo === "nombre" ? separado.nombre : separado.apellido;
  }

  return (
    <div className="superficie overflow-hidden">
      <header className="border-b border-border px-5 py-4">
        <h2 className="t-seccion">Qué es cada columna</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{archivo.nombre}</span> ·{" "}
          <span className="tabular">{hoja.filas.length}</span> filas ·{" "}
          <span className="tabular">{hoja.encabezados.length}</span> columnas
          {archivo.formato === "csv" && archivo.separador ? (
            <>
              {" "}
              · separador{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                {archivo.separador === "\t" ? "tab" : archivo.separador}
              </code>
            </>
          ) : null}
        </p>

        {/* Un libro de Excel puede tener varias hojas (alumnos, pagos,
            una por mes...). Se abre la primera con datos; si no es la de
            alumnos, se elige acá. */}
        {archivo.hojas.length > 1 ? (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Hoja</span>
            <select
              value={archivo.hoja}
              onChange={(e) => onCambiarHoja(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-card px-2 text-sm focus-visible:border-verde focus-visible:ring-2 focus-visible:ring-verde/25 focus-visible:outline-none"
            >
              {archivo.hojas.map((h, i) => (
                <option key={`${h.nombre}-${i}`} value={i}>
                  {h.nombre} ({h.filas.length} filas)
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
        {CAMPOS.map((campo) => (
          <div key={campo}>
            <label htmlFor={`col-${campo}`} className="block text-sm font-medium">
              {ETIQUETA_CAMPO[campo]}
              {obligatorios.includes(campo) ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">obligatorio</span>
              ) : null}
            </label>
            <select
              id={`col-${campo}`}
              value={columnas[campo]}
              onChange={(e) => onCambio({ ...columnas, [campo]: Number(e.target.value) })}
              className={cn(
                "mt-1.5 h-9 w-full rounded-lg border bg-card px-2.5 text-sm transition-colors duration-150",
                "focus-visible:border-verde focus-visible:ring-2 focus-visible:ring-verde/25 focus-visible:outline-none",
                columnas[campo] === -1 && obligatorios.includes(campo)
                  ? "border-destructive"
                  : "border-border",
              )}
            >
              <option value={-1}>— no está en el archivo —</option>
              {hoja.encabezados.map((encabezado, i) => (
                <option key={`${encabezado}-${i}`} value={i}>
                  {encabezado || `Columna ${i + 1}`}
                </option>
              ))}
            </select>
            {columnas[campo] >= 0 ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Ej: {ejemplo(campo) || "(vacío)"}
              </p>
            ) : null}
            {juntos && campo === "apellido" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Misma columna que el nombre: se separa por la coma, como{" "}
                <span className="font-medium text-foreground">APELLIDO, NOMBRE</span>. Si alguna
                fila no tiene coma, queda marcada para corregirla.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <Button type="button" variant="ghost" onClick={onVolver}>
          <ArrowLeft />
          Otro archivo
        </Button>
        <div className="flex items-center gap-3">
          {faltan.length > 0 ? (
            <p className="text-xs text-destructive">
              Falta indicar: {faltan.map((c) => ETIQUETA_CAMPO[c]).join(", ")}
            </p>
          ) : null}
          <Button type="button" onClick={onSeguir} disabled={faltan.length > 0}>
            Analizar las filas
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Revision({
  nombreArchivo,
  analisis,
  filasParaImportar,
  soloProblemas,
  onFiltro,
  onVolver,
  onEmpezarDeNuevo,
}: {
  nombreArchivo: string;
  analisis: ReturnType<typeof analizarFilas>;
  /** Las filas con solo las columnas mapeadas, en el orden de CAMPOS, y su línea en el archivo. */
  filasParaImportar: () => FilasParaImportar;
  soloProblemas: boolean;
  onFiltro: (v: boolean) => void;
  onVolver: () => void;
  onEmpezarDeNuevo: () => void;
}) {
  const { filas, resumen } = analisis;
  // Después de importar, la vista previa se oculta: recalculada contra el
  // padrón que ya incluye a esos alumnos los mostraría a todos como
  // "duplicados", y eso se lee como un error justo cuando salió bien.
  const [importado, setImportado] = useState(false);
  const visibles = soloProblemas
    ? filas.filter(
        (f) =>
          f.problemas.length > 0 || f.duplicadoExistente !== null || f.duplicadoEnArchivo !== null,
      )
    : filas;

  return (
    <div className="space-y-4">
      {importado ? null : (
        <>
          <section className="superficie px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="t-seccion">
                {resumen.total} filas analizadas
              </h2>
              <span className="text-xs text-muted-foreground">{nombreArchivo}</span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Contador etiqueta="Listas" valor={resumen.listas} tono="text-cubierto" />
              <Contador etiqueta="Con avisos" valor={resumen.conAvisos} tono="text-revisar" />
              <Contador etiqueta="Con errores" valor={resumen.conErrores} tono="text-descubierto" />
              <Contador etiqueta="Duplicadas" valor={resumen.duplicadas} tono="text-foreground" />
            </dl>

            {resumen.planesDesconocidos.length > 0 ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-revisar-suave px-3 py-2 text-xs text-revisar">
                <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={2} />
                <span>
                  El archivo menciona planes que no existen en el gimnasio:{" "}
                  <strong className="font-medium">{resumen.planesDesconocidos.join(", ")}</strong>.
                  Creálos en Configuración o corregí la planilla antes de importar.
                </span>
              </p>
            ) : null}
          </section>

          <section className="superficie overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h3 className="text-sm font-medium">Fila por fila</h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={soloProblemas}
                  onChange={(e) => onFiltro(e.target.checked)}
                  className="size-3.5 accent-[var(--verde)]"
                />
                Mostrar solo las que necesitan atención
              </label>
            </header>

            {visibles.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No hay filas con problemas. Todo el archivo se entiende.
              </p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                {visibles.slice(0, 300).map((fila) => (
                  <FilaDeRevision key={fila.linea} fila={fila} />
                ))}
              </ul>
            )}

            {visibles.length > 300 ? (
              <p className="hundido border-t border-border px-5 py-2 text-xs text-muted-foreground">
                Se muestran las primeras 300 de {visibles.length}.
              </p>
            ) : null}
          </section>
        </>
      )}

      <Importacion
        nombreArchivo={nombreArchivo}
        importables={resumen.listas}
        afuera={resumen.total - resumen.listas}
        filasParaImportar={filasParaImportar}
        onImportado={() => setImportado(true)}
        onVolver={onVolver}
        onEmpezarDeNuevo={onEmpezarDeNuevo}
      />
    </div>
  );
}

type RespuestaDeImportacion = Awaited<ReturnType<typeof importarAlumnos>>;
type FilasParaImportar = ReturnType<typeof recortarAColumnasUsadas> & { lineas: number[] };

/**
 * El paso final. Dos clics a propósito — "Importar" y "Sí, importar" — sin
 * un diálogo del navegador: crear cientos de alumnos de una vez no se
 * hace con un clic distraído, y la confirmación dice exactamente cuántos.
 *
 * Lo que se manda son las filas tal como se leyeron: el servidor vuelve a
 * analizarlas contra su propio padrón y decide él qué entra (ver
 * importar-alumnos.ts). Por eso el resultado puede diferir de la vista
 * previa en una sola dirección: alguien cargado entre medio queda afuera.
 */
function Importacion({
  nombreArchivo,
  importables,
  afuera,
  filasParaImportar,
  onImportado,
  onVolver,
  onEmpezarDeNuevo,
}: {
  nombreArchivo: string;
  importables: number;
  afuera: number;
  filasParaImportar: () => FilasParaImportar;
  onImportado: () => void;
  onVolver: () => void;
  onEmpezarDeNuevo: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaDeImportacion | null>(null);
  const [importando, startTransition] = useTransition();

  function importar() {
    startTransition(async () => {
      try {
        const r = await importarAlumnos({ nombreArchivo, ...filasParaImportar() });
        setRespuesta(r);
        if (r.ok) onImportado();
      } catch {
        setRespuesta({ ok: false, mensaje: "No pudimos conectar con el sistema. Probá de nuevo en un momento." });
      } finally {
        setConfirmando(false);
      }
    });
  }

  if (respuesta?.ok) {
    const { importados, omitidos } = respuesta.data;
    return (
      <section className="superficie px-5 py-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-cubierto" strokeWidth={2} />
          <div>
            <h3 className="t-seccion">
              {importados === 1 ? "Se importó 1 alumno" : `Se importaron ${importados} alumnos`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Quedaron activos, con su alta en el historial. La importación está registrada en
              Actividad.
              {omitidos.length > 0
                ? ` ${omitidos.length} ${omitidos.length === 1 ? "fila quedó" : "filas quedaron"} afuera:`
                : ""}
            </p>
          </div>
        </div>

        {omitidos.length > 0 ? (
          <ul className="mt-3 max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {omitidos.slice(0, 200).map((o) => (
              <li key={o.linea} className="flex gap-3 px-3 py-2">
                <span className="tabular w-14 shrink-0 text-xs text-muted-foreground">línea {o.linea}</span>
                <span className="min-w-0">
                  <span className="font-medium">{o.nombre || "(sin nombre)"}</span>
                  <span className="text-muted-foreground"> · {o.motivo}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <BotonLink href="/alumnos">
            <Users />
            Ver alumnos
          </BotonLink>
          <Button type="button" variant="outline" onClick={onEmpezarDeNuevo}>
            Importar otro archivo
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="superficie flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-2.5">
        <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <div className="max-w-xl text-sm text-muted-foreground">
          {importables === 0 ? (
            <p>
              <span className="font-medium text-foreground">No hay filas para importar.</span>{" "}
              Todas tienen errores o ya existen en el padrón. Corregí la planilla y volvé a probar.
            </p>
          ) : confirmando ? (
            <p>
              <span className="font-medium text-foreground">
                Se van a crear {importables} {importables === 1 ? "alumno" : "alumnos"}, activos.
              </span>{" "}
              {afuera > 0
                ? `Las ${afuera} filas con errores o duplicadas quedan afuera.`
                : "No queda ninguna fila afuera."}
            </p>
          ) : (
            <p>
              <span className="font-medium text-foreground">
                {importables} {importables === 1 ? "fila lista" : "filas listas"} para importar.
              </span>{" "}
              Las que tienen errores o están duplicadas no se importan; las que tienen avisos
              entran como dice cada aviso.
            </p>
          )}
          {respuesta && !respuesta.ok ? (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-destructive">
              <CircleAlert className="size-4" strokeWidth={2} />
              {respuesta.mensaje}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {confirmando ? (
          <>
            <Button type="button" variant="ghost" disabled={importando} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={importando} onClick={importar}>
              {importando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {importando ? "Importando…" : "Sí, importar"}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onVolver}>
              <ArrowLeft />
              Revisar columnas
            </Button>
            <Button type="button" variant="outline" onClick={onEmpezarDeNuevo}>
              Otro archivo
            </Button>
            <Button type="button" disabled={importables === 0} onClick={() => setConfirmando(true)}>
              <Upload />
              Importar {importables} {importables === 1 ? "alumno" : "alumnos"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function Contador({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: number;
  tono: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("tabular mt-1 font-heading text-2xl leading-none font-semibold", tono)}>
        {valor}
      </dd>
    </div>
  );
}

function FilaDeRevision({ fila }: { fila: FilaAnalizada }) {
  const conError = fila.problemas.some((p) => p.gravedad === "ERROR");
  const duplicada = fila.duplicadoExistente !== null || fila.duplicadoEnArchivo !== null;
  const conAviso = fila.problemas.some((p) => p.gravedad === "AVISO");

  return (
    <li className="flex gap-3 px-5 py-2.5">
      <span className="tabular w-8 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground/70">
        {fila.linea}
      </span>

      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-[2px]",
          conError
            ? "bg-descubierto"
            : duplicada
              ? "bg-muted-foreground/50"
              : conAviso
                ? "bg-revisar"
                : "bg-cubierto",
        )}
      />

      <span className="min-w-0 flex-1">
        <span className="block text-sm">
          {fila.nombre || fila.apellido ? (
            <>
              {fila.apellido}
              {fila.apellido && fila.nombre ? ", " : ""}
              {fila.nombre}
            </>
          ) : (
            <span className="text-muted-foreground">(fila sin nombre)</span>
          )}
          {fila.plan ? (
            <span className="ml-2 text-xs text-muted-foreground">{fila.plan}</span>
          ) : null}
        </span>

        {fila.duplicadoExistente ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Ya existe en el padrón como{" "}
            <strong className="font-medium text-foreground">{fila.duplicadoExistente}</strong>
          </span>
        ) : null}
        {fila.duplicadoEnArchivo ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Repetida: ya aparece en la línea{" "}
            <span className="tabular font-medium text-foreground">{fila.duplicadoEnArchivo}</span>
          </span>
        ) : null}

        {fila.problemas.map((problema, i) => (
          <span
            key={i}
            className={cn(
              "mt-0.5 block text-xs",
              problema.gravedad === "ERROR" ? "text-descubierto" : "text-revisar",
            )}
          >
            {problema.mensaje}
          </span>
        ))}
      </span>
    </li>
  );
}
