// Vista "Por edificio" del inventario: tarjetas de edificios con sus conteos y
// administración del catálogo (crear, renombrar y eliminar edificios, espacios y
// departamentos / áreas).
// Renombrar o eliminar actualiza los equipos en el servidor en una sola transacción.
import Swal from "sweetalert2";
import {
  crearArea,
  crearEdificio,
  crearEspacio,
  eliminarArea,
  eliminarEdificio,
  eliminarEspacio,
  renombrarArea,
  renombrarEdificio,
  renombrarEspacio,
} from "../services/supabaseData";
import type { Area, Edificio, Equipo, Espacio } from "../types";
import { mensajeDeError } from "../utils/errores";
import { areaDe, compararUbicaciones, edificioDe, espacioDe, resumenPorEdificio, SIN_AREA, SIN_EDIFICIO, SIN_ESPACIO } from "../utils/ubicacion";
import "./PanelEdificios.css";

interface PanelEdificiosProps {
  equipos: Equipo[];
  edificios: Edificio[];
  espacios: Espacio[];
  areas: Area[];
  edificio: string | null;
  espacio: string | null;
  area: string | null;
  onEdificio: (nombre: string | null) => void;
  onEspacio: (nombre: string | null) => void;
  onArea: (nombre: string | null) => void;
}

// La función o la tabla todavía no existe en Supabase.
const FALTA_MIGRACION = /(edificio|espacio|area).*(does not exist|could not find|schema cache)|PGRST20[25]/i;

async function pedirNombre(titulo: string, valor = ""): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: titulo,
    input: "text",
    inputValue: valor,
    showCancelButton: true,
    confirmButtonColor: "#FF6F00",
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    inputValidator: (texto) => (texto.trim() ? undefined : "Escribe un nombre."),
  });
  return isConfirmed ? String(value).trim() : null;
}

async function ejecutar(accion: () => Promise<unknown>, exito: string) {
  try {
    await accion();
    void Swal.fire({ title: exito, icon: "success", timer: 1800, showConfirmButton: false });
    return true;
  } catch (error) {
    console.error("Error al actualizar el catálogo de edificios:", error);
    const mensaje = mensajeDeError(error);
    void Swal.fire(
      "No se pudo guardar",
      FALTA_MIGRACION.test(mensaje)
        ? "Falta aplicar en Supabase las migraciones 20261119000000_edificios.sql y 20261119120000_areas.sql."
        : mensaje,
      "error"
    );
    return false;
  }
}

export function PanelEdificios({
  equipos,
  edificios,
  espacios,
  areas,
  edificio,
  espacio,
  area,
  onEdificio,
  onEspacio,
  onArea,
}: PanelEdificiosProps) {
  const resumen = resumenPorEdificio(equipos, edificios);
  const actual = edificios.find((e) => e.nombre === edificio) ?? null;
  const delEdificio = edificio ? equipos.filter((e) => edificioDe(e) === edificio) : [];
  const conteoEspacio = (nombre: string) => delEdificio.filter((e) => espacioDe(e) === nombre).length;
  const espaciosActuales = actual
    ? [...espacios.filter((s) => s.edificio_id === actual.id).map((s) => s.nombre), ...(conteoEspacio(SIN_ESPACIO) > 0 ? [SIN_ESPACIO] : [])]
        .sort(compararUbicaciones)
    : [];
  const filaEspacio = actual && espacio ? espacios.find((s) => s.edificio_id === actual.id && s.nombre === espacio) ?? null : null;
  const delEspacio = espacio ? delEdificio.filter((e) => espacioDe(e) === espacio) : [];
  const conteoArea = (nombre: string) => delEspacio.filter((e) => areaDe(e) === nombre).length;
  const areasActuales = filaEspacio
    ? [...areas.filter((a) => a.espacio_id === filaEspacio.id).map((a) => a.nombre), ...(conteoArea(SIN_AREA) > 0 ? [SIN_AREA] : [])]
        .sort(compararUbicaciones)
    : [];

  const nuevoEdificio = async () => {
    const nombre = await pedirNombre("Nuevo edificio");
    if (nombre) await ejecutar(() => crearEdificio(nombre), "Edificio creado");
  };

  const renombrar = async (e: Edificio) => {
    const nombre = await pedirNombre(`Renombrar ${e.nombre}`, e.nombre);
    if (!nombre || nombre.toUpperCase() === e.nombre) return;
    if (await ejecutar(() => renombrarEdificio(e.id, nombre), "Edificio renombrado")) onEdificio(null);
  };

  const eliminar = async (e: Edificio, cantidad: number) => {
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar ${e.nombre}?`,
      text: cantidad > 0 ? `Sus ${cantidad} equipos quedarán "Sin edificio" (no se borran).` : "No tiene equipos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (isConfirmed && (await ejecutar(() => eliminarEdificio(e.id), "Edificio eliminado"))) onEdificio(null);
  };

  const nuevoEspacio = async () => {
    if (!actual) return;
    const nombre = await pedirNombre(`Nuevo espacio en ${actual.nombre}`);
    if (nombre) await ejecutar(() => crearEspacio(actual.id, nombre), "Espacio creado");
  };

  const espacioDelCatalogo = (nombre: string) => espacios.find((s) => s.edificio_id === actual?.id && s.nombre === nombre);

  const renombrarEsp = async (nombreActual: string) => {
    const fila = espacioDelCatalogo(nombreActual);
    if (!fila) return;
    const nombre = await pedirNombre(`Renombrar ${nombreActual}`, nombreActual);
    if (!nombre || nombre.toUpperCase() === nombreActual) return;
    if (await ejecutar(() => renombrarEspacio(fila.id, nombre), "Espacio renombrado")) onEspacio(null);
  };

  const eliminarEsp = async (nombreActual: string) => {
    const fila = espacioDelCatalogo(nombreActual);
    if (!fila) return;
    const cantidad = conteoEspacio(nombreActual);
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar ${nombreActual}?`,
      text: cantidad > 0 ? `Sus ${cantidad} equipos se quedan en ${actual?.nombre}, sin espacio.` : "No tiene equipos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (isConfirmed && (await ejecutar(() => eliminarEspacio(fila.id), "Espacio eliminado"))) onEspacio(null);
  };

  const nuevaArea = async () => {
    if (!filaEspacio) return;
    const nombre = await pedirNombre(`Nuevo departamento o área en ${filaEspacio.nombre}`);
    if (nombre) await ejecutar(() => crearArea(filaEspacio.id, nombre), "Área creada");
  };

  const areaDelCatalogo = (nombre: string) => areas.find((a) => a.espacio_id === filaEspacio?.id && a.nombre === nombre);

  const renombrarAr = async (nombreActual: string) => {
    const fila = areaDelCatalogo(nombreActual);
    if (!fila) return;
    const nombre = await pedirNombre(`Renombrar ${nombreActual}`, nombreActual);
    if (!nombre || nombre.toUpperCase() === nombreActual) return;
    if (await ejecutar(() => renombrarArea(fila.id, nombre), "Área renombrada")) onArea(null);
  };

  const eliminarAr = async (nombreActual: string) => {
    const fila = areaDelCatalogo(nombreActual);
    if (!fila) return;
    const cantidad = conteoArea(nombreActual);
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar ${nombreActual}?`,
      text: cantidad > 0 ? `Sus ${cantidad} equipos se quedan en ${filaEspacio?.nombre}, sin área.` : "No tiene equipos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (isConfirmed && (await ejecutar(() => eliminarArea(fila.id), "Área eliminada"))) onArea(null);
  };

  return (
    <section className="panel-edificios" aria-label="Edificios">
      <div className="panel-edificios__tarjetas">
        {resumen.map((r) => {
          const fila = edificios.find((e) => e.nombre === r.edificio);
          const activo = edificio === r.edificio;
          return (
            <div key={r.edificio} className={`panel-edificios__tarjeta${activo ? " panel-edificios__tarjeta--activa" : ""}`}>
              <button type="button" className="panel-edificios__elegir" onClick={() => onEdificio(activo ? null : r.edificio)} aria-pressed={activo}>
                <span className="panel-edificios__nombre">{r.edificio === SIN_EDIFICIO ? "📦" : "🏢"} {r.edificio}</span>
                <span className="panel-edificios__total">{r.total} equipos</span>
                <span className="panel-edificios__detalle">
                  {r.prestados} prestados · {r.vencidos > 0 ? <b>{r.vencidos} vencidos</b> : "0 vencidos"} · {r.fueraDeServicio} baja
                </span>
              </button>
              {fila && (
                <div className="panel-edificios__acciones">
                  <button type="button" onClick={() => renombrar(fila)} title="Renombrar">✏️</button>
                  <button type="button" onClick={() => eliminar(fila, r.total)} title="Eliminar">🗑️</button>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="panel-edificios__nuevo" onClick={nuevoEdificio}>
          ＋ Nuevo edificio
        </button>
      </div>

      {actual && (
        <div className="panel-edificios__espacios">
          <span className="panel-edificios__etiqueta">Espacios de {actual.nombre}:</span>
          <button type="button" className={`chip${espacio === null ? " chip--activo" : ""}`} onClick={() => onEspacio(null)}>
            Todos ({delEdificio.length})
          </button>
          {espaciosActuales.map((nombre) => (
            <span key={nombre} className={`chip${espacio === nombre ? " chip--activo" : ""}`}>
              <button type="button" onClick={() => onEspacio(espacio === nombre ? null : nombre)}>
                {nombre} ({conteoEspacio(nombre)})
              </button>
              {nombre !== SIN_ESPACIO && (
                <>
                  <button type="button" onClick={() => renombrarEsp(nombre)} title="Renombrar espacio" aria-label={`Renombrar ${nombre}`}>✏️</button>
                  <button type="button" onClick={() => eliminarEsp(nombre)} title="Eliminar espacio" aria-label={`Eliminar ${nombre}`}>✕</button>
                </>
              )}
            </span>
          ))}
          <button type="button" className="chip chip--nuevo" onClick={nuevoEspacio}>
            ＋ Nuevo espacio
          </button>
        </div>
      )}

      {filaEspacio && (
        <div className="panel-edificios__espacios">
          <span className="panel-edificios__etiqueta">Departamentos / áreas de {filaEspacio.nombre}:</span>
          <button type="button" className={`chip${area === null ? " chip--activo" : ""}`} onClick={() => onArea(null)}>
            Todas ({delEspacio.length})
          </button>
          {areasActuales.map((nombre) => (
            <span key={nombre} className={`chip${area === nombre ? " chip--activo" : ""}`}>
              <button type="button" onClick={() => onArea(area === nombre ? null : nombre)}>
                {nombre} ({conteoArea(nombre)})
              </button>
              {nombre !== SIN_AREA && (
                <>
                  <button type="button" onClick={() => renombrarAr(nombre)} title="Renombrar área" aria-label={`Renombrar ${nombre}`}>✏️</button>
                  <button type="button" onClick={() => eliminarAr(nombre)} title="Eliminar área" aria-label={`Eliminar ${nombre}`}>✕</button>
                </>
              )}
            </span>
          ))}
          <button type="button" className="chip chip--nuevo" onClick={nuevaArea}>
            ＋ Nueva área
          </button>
        </div>
      )}
    </section>
  );
}
