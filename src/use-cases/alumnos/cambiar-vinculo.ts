import { cambiarVinculoSchema, type CambiarVinculoRaw } from "@/schemas/student";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { conflict, notFound, ok, validationError, type Result } from "@/use-cases/_kernel/result";
import {
  actualizarVinculoAlumno,
  buscarAlumnoPorId,
  registrarEventoDeAlumno,
} from "@/data/repositories/students-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { esVinculo, type Vinculo } from "@/domain/alumnos/vinculo";
import {
  mensajeDeRechazo,
  resolverCambioDeVinculo,
  resumenDeCambio,
  type MotivoDeBaja,
} from "@/domain/alumnos/cambio-de-vinculo";
import { nombreCompleto } from "@/domain/alumnos/identidad";
import { hoyISO } from "@/domain/fechas/hoy";

export interface VinculoCambiado {
  id: string;
  vinculo: Vinculo;
}

/**
 * CAMBIO DE ESTADO DEL VÍNCULO — la capacidad técnica básica, no el
 * workflow de bajas.
 *
 * Fase 1 registra el hecho (con lo mínimo que la base exige para que la
 * fila sea coherente) y lo deja en el historial. Fase 3 construye encima:
 * catálogo de motivos del gimnasio, fecha efectiva distinta de hoy,
 * métricas de retención, recuperación. Nada de eso se adelanta acá.
 *
 * Lo que NUNCA hace, ni ahora ni después: borrar al alumno. Una BAJA es un
 * estado, no un DELETE (SPEC V1 §8) — el registro tiene que sobrevivir para
 * que el historial y la futura migración sigan teniendo sentido. El rol de
 * runtime `fn_app` ni siquiera tiene privilegio DELETE sobre la tabla.
 *
 * TODA la decisión de qué columnas quedan escritas la toma una función
 * pura del dominio (`resolverCambioDeVinculo`), que no ve la base ni el
 * reloj. Este caso de uso solo la orquesta.
 */
export const cambiarVinculoAction = withAuth<CambiarVinculoRaw, VinculoCambiado>(
  ["DUENO", "STAFF"],
  async (ctx, rawInput) => {
    const parsed = parseInput(cambiarVinculoSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    return withTenantTx<Result<VinculoCambiado>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return validationError([{ path: "gymId", message: "Gimnasio no encontrado." }]);

      const actual = await buscarAlumnoPorId(tx, ctx, input.id);
      if (!actual) return notFound();
      if (!esVinculo(actual.vinculo)) {
        return conflict("El alumno tiene un estado que este sistema no reconoce.");
      }

      // El motivo de baja se resuelve contra el catálogo del GIMNASIO. Del
      // formulario llega solo el código; la etiqueta la pone el servidor.
      // Aceptarla del cliente permitiría guardar "Se fue contento" bajo el
      // código ECONOMICO, y esa etiqueta queda congelada en la fila.
      let motivo: MotivoDeBaja | null = null;
      if (input.vinculo === "BAJA" && input.motivoCodigo) {
        const config = await obtenerConfiguracion(tx, ctx);
        const catalogo = Array.isArray(config?.motivosBaja)
          ? (config.motivosBaja as { codigo?: string; etiqueta?: string; activo?: boolean }[])
          : [];
        const elegido = catalogo.find((m) => m.codigo === input.motivoCodigo && m.activo !== false);
        if (!elegido?.codigo || !elegido.etiqueta) {
          return validationError([
            { path: "motivoCodigo", message: "Elegí un motivo de la lista." },
          ]);
        }
        motivo = { codigo: elegido.codigo, etiqueta: elegido.etiqueta };
      }

      const hoy = hoyISO(gym.timezone);
      const resultado = resolverCambioDeVinculo(
        { vinculo: actual.vinculo, fechaAltaOriginal: actual.fechaAltaOriginal },
        input.vinculo,
        hoy,
        { pausaHasta: input.pausaHasta, nota: input.nota, motivo },
      );

      if (!resultado.ok) {
        const mensaje = mensajeDeRechazo(resultado.motivo);
        // Los rechazos que el dueño puede arreglar completando el
        // formulario vuelven como error de validación del campo exacto;
        // el resto es un conflicto de estado, no un problema del input.
        if (resultado.motivo === "PAUSA_SIN_DATOS") {
          return validationError([{ path: "nota", message: mensaje }]);
        }
        if (resultado.motivo === "PAUSA_HASTA_EN_EL_PASADO") {
          return validationError([{ path: "pausaHasta", message: mensaje }]);
        }
        return conflict(mensaje);
      }

      const row = await actualizarVinculoAlumno(tx, ctx, input.id, resultado.cambio);
      if (!row) return notFound();

      await registrarEventoDeAlumno(tx, ctx, {
        studentId: row.id,
        tipo: resultado.evento,
        ocurridoEl: hoy,
        datos: {
          desde: actual.vinculo,
          hacia: resultado.cambio.vinculo,
          pausaHasta: resultado.cambio.pausaHasta,
          nota: resultado.cambio.pausaNota,
          motivoEtiqueta: resultado.cambio.bajaMotivoEtiqueta,
          observacion: resultado.cambio.bajaObservacion,
        },
      });

      await logActivity(tx, ctx, {
        accion: "student.status_changed",
        entidad: "student",
        entidadId: row.id,
        resumen: `${nombreCompleto(row.nombre, row.apellido)} — ${resumenDeCambio(
          actual.vinculo,
          resultado.cambio.vinculo,
          resultado.resumen,
        )}`,
        cambios: { vinculo: { antes: actual.vinculo, despues: resultado.cambio.vinculo } },
      });

      return ok({ id: row.id, vinculo: resultado.cambio.vinculo });
    });
  },
);
