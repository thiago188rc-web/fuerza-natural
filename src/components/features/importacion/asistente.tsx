"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  Upload,
  Users,
} from "lucide-react";
import type { ContextoDeImportacion } from "@/use-cases/importacion/consultas";
import { detectarSeparador, parsearCSV } from "@/domain/importacion/csv";
import {
  analizarFilas,
  CAMPOS,
  detectarColumnas,
  ETIQUETA_CAMPO,
  type Campo,
  type FilaAnalizada,
} from "@/domain/importacion/analisis";
import { Button } from "@/components/ui/button";
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
 * El análisis que se ve es REAL: parsea el archivo de verdad, aplica las
 * mismas normalizaciones que usa el alta manual y compara contra los
 * alumnos que ya existen en este gimnasio. Lo único que todavía no está
 * disponible es el paso final de escritura, y la pantalla lo dice con esas
 * palabras en vez de simular una importación que no ocurrió.
 */

type Paso = "ARCHIVO" | "COLUMNAS" | "REVISION";

interface ArchivoLeido {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  separador: string;
}

export function AsistenteDeImportacion({ contexto }: { contexto: ContextoDeImportacion }) {
  const quieto = useReducedMotion();
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [columnas, setColumnas] = useState<Record<Campo, number> | null>(null);
  const [paso, setPaso] = useState<Paso>("ARCHIVO");
  const [error, setError] = useState<string | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);

  const analisis = useMemo(() => {
    if (!archivo || !columnas) return null;
    return analizarFilas(archivo.filas, columnas, {
      planes: contexto.planes,
      existentes: contexto.existentes,
      hoy: contexto.hoy,
    });
  }, [archivo, columnas, contexto]);

  async function leer(file: File) {
    setError(null);
    try {
      const texto = await file.text();
      const separador = detectarSeparador(texto);
      const todas = parsearCSV(texto, separador);

      if (todas.length < 2) {
        setError("El archivo no tiene filas de datos, solo el encabezado (o está vacío).");
        return;
      }

      const [encabezados, ...filas] = todas;
      setArchivo({ nombre: file.name, encabezados, filas, separador });
      setColumnas(detectarColumnas(encabezados));
      setPaso("COLUMNAS");
    } catch {
      setError("No pudimos leer el archivo. Tiene que ser un CSV de texto.");
    }
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
            <ZonaDeArchivo onArchivo={leer} error={error} />
          ) : paso === "COLUMNAS" && archivo && columnas ? (
            <MapeoDeColumnas
              archivo={archivo}
              columnas={columnas}
              onCambio={setColumnas}
              onVolver={volverAEmpezar}
              onSeguir={() => setPaso("REVISION")}
            />
          ) : analisis && archivo ? (
            <Revision
              nombreArchivo={archivo.nombre}
              analisis={analisis}
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
}: {
  onArchivo: (file: File) => void;
  error: string | null;
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
          Un archivo CSV exportado de Excel o Google Sheets. El archivo se abre acá, en tu
          computadora: no se sube a ningún lado hasta que decidas importarlo.
        </p>

        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onArchivo(file);
          }}
        />
        <Button type="button" className="mt-5" onClick={() => input.current?.click()}>
          <FileSpreadsheet />
          Elegir un archivo
        </Button>

        {error ? (
          <p role="alert" className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4" strokeWidth={2} />
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Se reconocen las columnas más comunes (nombre, apellido, teléfono, plan, fecha de alta) con
        cualquier separador y con o sin acentos. Después vas a poder corregir el emparejamiento.
      </p>
    </div>
  );
}

function MapeoDeColumnas({
  archivo,
  columnas,
  onCambio,
  onVolver,
  onSeguir,
}: {
  archivo: ArchivoLeido;
  columnas: Record<Campo, number>;
  onCambio: (c: Record<Campo, number>) => void;
  onVolver: () => void;
  onSeguir: () => void;
}) {
  const obligatorios: Campo[] = ["nombre", "apellido", "plan"];
  const faltan = obligatorios.filter((c) => columnas[c] === -1);

  return (
    <div className="superficie overflow-hidden">
      <header className="border-b border-border px-5 py-4">
        <h2 className="t-seccion">Qué es cada columna</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{archivo.nombre}</span> ·{" "}
          <span className="tabular">{archivo.filas.length}</span> filas ·{" "}
          <span className="tabular">{archivo.encabezados.length}</span> columnas · separador{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            {archivo.separador === "\t" ? "tab" : archivo.separador}
          </code>
        </p>
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
              {archivo.encabezados.map((encabezado, i) => (
                <option key={`${encabezado}-${i}`} value={i}>
                  {encabezado || `Columna ${i + 1}`}
                </option>
              ))}
            </select>
            {columnas[campo] >= 0 ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Ej: {archivo.filas[0]?.[columnas[campo]] || "(vacío)"}
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
  soloProblemas,
  onFiltro,
  onVolver,
  onEmpezarDeNuevo,
}: {
  nombreArchivo: string;
  analisis: ReturnType<typeof analizarFilas>;
  soloProblemas: boolean;
  onFiltro: (v: boolean) => void;
  onVolver: () => void;
  onEmpezarDeNuevo: () => void;
}) {
  const { filas, resumen } = analisis;
  const visibles = soloProblemas
    ? filas.filter(
        (f) =>
          f.problemas.length > 0 || f.duplicadoExistente !== null || f.duplicadoEnArchivo !== null,
      )
    : filas;

  return (
    <div className="space-y-4">
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

      {/* El paso final. Se dice exactamente qué falta y por qué, en vez de
          mostrar un botón que finge escribir en la base. */}
      <section className="superficie flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-2.5">
          <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          <p className="max-w-xl text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              La importación definitiva todavía no está habilitada.
            </span>{" "}
            Escribir cientos de alumnos de una vez exige antes resolver la identidad de cada
            persona contra el padrón existente — es la fase de migración, y se hace con los datos
            reales una sola vez. Todo lo que ves acá es análisis real de tu archivo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onVolver}>
            <ArrowLeft />
            Revisar columnas
          </Button>
          <Button type="button" variant="outline" onClick={onEmpezarDeNuevo}>
            Probar otro archivo
          </Button>
        </div>
      </section>
    </div>
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
