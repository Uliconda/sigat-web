// Elegir qué edificios entran en el reporte PDF por edificio.
import { useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Edificio, Equipo } from "../types";
import { mensajeDeError } from "../utils/errores";
import { resumenPorEdificio } from "../utils/ubicacion";
import { CasillaReporte, ModalReporte } from "./ModalReporte";

export function DialogoReporteEdificio({
  equipos,
  edificios,
  onCerrar,
}: {
  equipos: Equipo[];
  edificios: Edificio[];
  onCerrar: () => void;
}) {
  const resumen = useMemo(() => resumenPorEdificio(equipos, edificios).filter((r) => r.total > 0), [equipos, edificios]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [generando, setGenerando] = useState(false);
  const todos = elegidos.size === 0;
  const totalElegido = resumen.reduce((n, r) => n + (todos || elegidos.has(r.edificio) ? r.total : 0), 0);

  const alternar = (edificio: string) =>
    setElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(edificio)) siguiente.delete(edificio);
      else siguiente.add(edificio);
      return siguiente;
    });

  const generar = async () => {
    setGenerando(true);
    try {
      const { descargarReporteEdificio } = await import("../utils/reporteEdificio");
      const total = await descargarReporteEdificio(equipos, edificios, [...elegidos]);
      if (total === 0) {
        void Swal.fire("Sin datos", "No hay equipos en los edificios seleccionados.", "info");
        return;
      }
      onCerrar();
    } catch (e) {
      console.error("Error al generar el PDF por edificio:", e);
      void Swal.fire("No se pudo generar el PDF", mensajeDeError(e), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <ModalReporte
      titulo="Reporte PDF por edificio"
      descripcion="Incluye un resumen por estado y, después, cada edificio con sus espacios. Sin elegir ninguno, el reporte incluye todos."
      textoGenerar={todos ? `Generar reporte completo (${totalElegido})` : `Generar (${totalElegido} equipo${totalElegido === 1 ? "" : "s"})`}
      generando={generando}
      puedeGenerar={totalElegido > 0}
      onGenerar={generar}
      onCerrar={onCerrar}
    >
      <fieldset className="reporte-modal__areas">
        <legend>Edificios</legend>
        <CasillaReporte
          texto="Todos los edificios"
          cantidad={resumen.reduce((n, r) => n + r.total, 0)}
          marcada={todos}
          destacada
          onCambiar={() => setElegidos(new Set())}
        />
        {resumen.map((r) => (
          <CasillaReporte
            key={r.edificio}
            texto={r.edificio}
            cantidad={r.total}
            marcada={elegidos.has(r.edificio)}
            onCambiar={() => alternar(r.edificio)}
          />
        ))}
      </fieldset>
    </ModalReporte>
  );
}
