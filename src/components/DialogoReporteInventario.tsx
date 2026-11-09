// Elegir qué categorías/subcategorías entran en el PDF del inventario.
import { useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Equipo } from "../types";
import { areasInventario } from "../utils/areasInventario";
import { mensajeDeError } from "../utils/errores";
import { CasillaReporte, ModalReporte } from "./ModalReporte";

export function DialogoReporteInventario({
  equipos,
  busqueda,
  onCerrar,
}: {
  equipos: Equipo[];
  /** Búsqueda activa en el inventario (el reporte solo incluye lo que coincide). */
  busqueda: string;
  onCerrar: () => void;
}) {
  const areas = useMemo(() => areasInventario(equipos), [equipos]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [generando, setGenerando] = useState(false);
  const todo = elegidas.size === 0;

  const cambiar = (claves: string[], marcar: boolean) =>
    setElegidas((prev) => {
      const siguiente = new Set(prev);
      for (const clave of claves) {
        if (marcar) siguiente.add(clave);
        else siguiente.delete(clave);
      }
      return siguiente;
    });

  const alternarAbierta = (categoria: string) =>
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(categoria)) siguiente.delete(categoria);
      else siguiente.add(categoria);
      return siguiente;
    });

  const totalElegido = todo
    ? equipos.length
    : areas.flatMap((a) => a.subcategorias).reduce((n, s) => n + (elegidas.has(s.clave) ? s.cantidad : 0), 0);

  const generar = async () => {
    setGenerando(true);
    try {
      const { descargarReporteInventario } = await import("../utils/reporteInventario");
      const total = await descargarReporteInventario(equipos, [...elegidas]);
      if (total === 0) {
        void Swal.fire("Sin datos", "No se encontraron equipos para esta selección.", "info");
        return;
      }
      onCerrar();
    } catch (e) {
      console.error("Error al generar el PDF del inventario:", e);
      void Swal.fire("No se pudo generar el PDF", mensajeDeError(e), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <ModalReporte
      titulo="Reporte PDF del inventario"
      descripcion={
        busqueda.trim()
          ? `Solo se incluyen los equipos que coinciden con la búsqueda "${busqueda.trim()}". Elige una o varias áreas, o todo.`
          : "Elige una o varias categorías o subcategorías. Sin elegir ninguna, el reporte es completo."
      }
      textoGenerar={todo ? `Generar reporte completo (${totalElegido})` : `Generar (${totalElegido} equipo${totalElegido === 1 ? "" : "s"})`}
      generando={generando}
      puedeGenerar={totalElegido > 0}
      onGenerar={generar}
      onCerrar={onCerrar}
    >
      <fieldset className="reporte-modal__areas">
        <legend>Áreas</legend>
        <CasillaReporte
          texto="Todo el inventario (completo)"
          cantidad={equipos.length}
          marcada={todo}
          destacada
          onCambiar={() => setElegidas(new Set())}
        />
        {areas.map(({ categoria, cantidad, subcategorias }) => {
          const claves = subcategorias.map((s) => s.clave);
          const marcadas = claves.filter((c) => elegidas.has(c)).length;
          // Con una sola subcategoría no hace falta desplegar.
          const desplegable = subcategorias.length > 1;
          const abierta = abiertas.has(categoria);
          return (
            <div key={categoria} className="reporte-categoria">
              <div className="reporte-categoria__fila">
                <CasillaReporte
                  texto={categoria}
                  cantidad={cantidad}
                  marcada={marcadas === claves.length}
                  indeterminada={marcadas > 0 && marcadas < claves.length}
                  onCambiar={() => cambiar(claves, marcadas < claves.length)}
                />
                {desplegable && (
                  <button
                    type="button"
                    className="reporte-categoria__desplegar"
                    onClick={() => alternarAbierta(categoria)}
                    aria-expanded={abierta}
                    aria-label={`${abierta ? "Ocultar" : "Ver"} subcategorías de ${categoria}`}
                  >
                    {abierta ? "▾" : "▸"} {subcategorias.length} subcategorías
                  </button>
                )}
              </div>
              {desplegable &&
                abierta &&
                subcategorias.map((s) => (
                  <CasillaReporte
                    key={s.clave}
                    texto={s.nombre}
                    cantidad={s.cantidad}
                    marcada={elegidas.has(s.clave)}
                    sangria
                    onCambiar={() => cambiar([s.clave], !elegidas.has(s.clave))}
                  />
                ))}
            </div>
          );
        })}
      </fieldset>
    </ModalReporte>
  );
}
