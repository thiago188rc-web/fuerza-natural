"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { etiquetaVinculo, VINCULOS } from "@/domain/alumnos/vinculo";
import { ESTADO_FILTRO_TODOS } from "@/schemas/student";

/**
 * Búsqueda y filtro del listado. El estado real vive en la URL, no en
 * React: así el dueño puede volver atrás, recargar o guardarse un link a
 * "los pausados" y encontrar lo mismo.
 *
 * La búsqueda se dispara al enviar (Enter o el botón), no en cada tecla.
 * Con teclado y 200 alumnos, una consulta por pulsación no mejora nada y
 * hace parpadear la tabla; el filtro de estado sí navega al instante
 * porque es un solo clic deliberado.
 */
const OPCIONES_ESTADO = [
  { value: ESTADO_FILTRO_TODOS, label: "Todos los estados" },
  ...VINCULOS.map((v) => ({ value: v, label: etiquetaVinculo(v) })),
];

export function FiltrosAlumnos({ q, estado }: { q: string; estado: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [termino, setTermino] = useState(q);
  const [pendiente, iniciarTransicion] = useTransition();

  function navegar(nuevoTermino: string, nuevoEstado: string) {
    const params = new URLSearchParams();
    if (nuevoTermino.trim()) params.set("q", nuevoTermino.trim());
    if (nuevoEstado !== ESTADO_FILTRO_TODOS) params.set("estado", nuevoEstado);
    // Cualquier cambio de filtro vuelve a la página 1: quedarse en la 4 de
    // un resultado que ahora tiene 2 páginas muestra una tabla vacía.
    const query = params.toString();
    iniciarTransicion(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        navegar(termino, estado);
      }}
    >
      <div className="relative min-w-56 flex-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder="Buscar por nombre o apellido…"
          aria-label="Buscar alumnos por nombre o apellido"
          className="pl-8"
        />
      </div>

      <Select
        name="estado"
        value={estado}
        items={OPCIONES_ESTADO}
        onValueChange={(valor) => {
          if (typeof valor === "string") navegar(termino, valor);
        }}
      >
        <SelectTrigger className="w-48" aria-label="Filtrar por estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCIONES_ESTADO.map((opcion) => (
            <SelectItem key={opcion.value} value={opcion.value}>
              {opcion.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="outline" disabled={pendiente}>
        {pendiente ? "Buscando…" : "Buscar"}
      </Button>
    </form>
  );
}
