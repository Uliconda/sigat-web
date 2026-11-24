// Elegir departamentos y opciones del reporte PDF de personal administrativo.
// Se abre desde Personal y desde Reportes.
import { useState } from "react";
import Swal from "sweetalert2";
import type { Asignacion, Equipo, Personal as PersonaAdministrativa } from "../types";
import { mensajeDeError } from "../utils/errores";
import { departamentoDe, departamentosDe, estaActivo } from "../utils/personal";
import { CasillaReporte, ModalReporte } from "./ModalReporte";

export function DialogoReportePersonal({
  personal,
  equipos,
  asignaciones,
  onCerrar,
}: {
  personal: PersonaAdministrativa[];
  equipos: Equipo[];
  asignaciones: Asignacion[];
  onCerrar: () => void;
}) {
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [incluirHistorial, setIncluirHistorial] = useState(true);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [generando, setGenerando] = useState(false);

  // Las áreas listadas dependen de si se incluye al personal que ya no labora.
  const visibles = incluirBajas ? personal : personal.filter((p) => estaActivo(p));
  const areas = departamentosDe(visibles);
  const cuantos = (area: string) => visibles.filter((p) => departamentoDe(p) === area).length;
  const todas = elegidos.size === 0;
  const seleccionadas = areas.filter((a) => elegidos.has(a));

  const alternar = (area: string) =>
    setElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(area)) siguiente.delete(area);
      else siguiente.add(area);
      return siguiente;
    });

  const generar = async () => {
    setGenerando(true);
    try {
      const { descargarReportePersonal } = await import("../utils/reportePersonal");
      const total = await descargarReportePersonal(personal, equipos, asignaciones, {
        departamentos: todas ? [] : seleccionadas,
        incluirBajas,
        incluirHistorial,
      });
      if (total === 0) {
        void Swal.fire("Sin datos", "No hay personal en las áreas seleccionadas.", "info");
        return;
      }
      onCerrar();
    } catch (e) {
      console.error("Error al generar el PDF de personal:", e);
      void Swal.fire("No se pudo generar el PDF", mensajeDeError(e), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <ModalReporte
      titulo="Reporte PDF de personal"
      descripcion="Elige uno o varios departamentos. Sin elegir ninguno, el reporte es completo."
      textoGenerar={
        todas
          ? "Generar reporte completo"
          : `Generar (${seleccionadas.length} área${seleccionadas.length === 1 ? "" : "s"})`
      }
      generando={generando}
      puedeGenerar={todas || seleccionadas.length > 0}
      onGenerar={generar}
      onCerrar={onCerrar}
    >
      <fieldset className="reporte-modal__areas">
        <legend>Departamentos</legend>
        <CasillaReporte
          texto="Todos los departamentos (completo)"
          cantidad={visibles.length}
          marcada={todas}
          destacada
          onCambiar={() => setElegidos(new Set())}
        />
        {areas.map((area) => (
          <CasillaReporte
            key={area}
            texto={area}
            cantidad={cuantos(area)}
            marcada={elegidos.has(area)}
            onCambiar={() => alternar(area)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>Incluir</legend>
        <CasillaReporte
          texto="Historial de equipos anteriores"
          marcada={incluirHistorial}
          onCambiar={() => setIncluirHistorial((v) => !v)}
        />
        <CasillaReporte
          texto="Personal que ya no labora"
          marcada={incluirBajas}
          onCambiar={() => setIncluirBajas((v) => !v)}
        />
      </fieldset>
    </ModalReporte>
  );
}
