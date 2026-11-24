// Asignar edificio, espacio y departamento / área a varios equipos a la vez (asignar_ubicacion).
import { useState } from "react";
import Swal from "sweetalert2";
import { asignarUbicacion } from "../services/supabaseData";
import type { Area, Edificio, Espacio } from "../types";
import { mensajeDeError } from "../utils/errores";
import { ModalReporte } from "./ModalReporte";

export function DialogoUbicacion({
  ids,
  edificios,
  espacios,
  areas,
  onListo,
  onCerrar,
}: {
  ids: string[];
  edificios: Edificio[];
  espacios: Espacio[];
  areas: Area[];
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [edificioId, setEdificioId] = useState("");
  const [espacio, setEspacio] = useState("");
  const [area, setArea] = useState("");
  const [guardando, setGuardando] = useState(false);
  const edificio = edificios.find((e) => e.id === edificioId) ?? null;
  const opcionesEspacio = espacios.filter((s) => s.edificio_id === edificioId).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  const espacioId = opcionesEspacio.find((s) => s.nombre === espacio)?.id ?? null;
  const opcionesArea = areas.filter((a) => a.espacio_id === espacioId).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  const n = ids.length;

  const guardar = async () => {
    setGuardando(true);
    try {
      const cambiados = await asignarUbicacion(ids, edificio?.nombre ?? null, espacio || null, area || null);
      void Swal.fire({
        title: "Ubicación actualizada",
        text: `${cambiados} de ${n} equipos cambiaron${cambiados < n ? " (los demás ya estaban ahí)" : ""}.`,
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });
      onListo();
    } catch (e) {
      console.error("Error al asignar ubicación:", e);
      void Swal.fire("No se pudo asignar la ubicación", mensajeDeError(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalReporte
      titulo={`Ubicación de ${n} equipo${n === 1 ? "" : "s"}`}
      descripcion="Elige el edificio y, si quieres, el espacio y el departamento o área. Para quitarles la ubicación deja «Sin edificio»."
      textoGenerar={edificio ? `Asignar a ${n} equipo${n === 1 ? "" : "s"}` : "Quitar ubicación"}
      generando={guardando}
      puedeGenerar={n > 0}
      onGenerar={guardar}
      onCerrar={onCerrar}
    >
      <div className="dialogo-ubicacion">
        <label>
          Edificio
          <select
            value={edificioId}
            onChange={(e) => {
              setEdificioId(e.target.value);
              setEspacio("");
              setArea("");
            }}
          >
            <option value="">— Sin edificio —</option>
            {[...edificios]
              .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
              .map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
          </select>
        </label>
        <label>
          Espacio
          <select
            value={espacio}
            onChange={(e) => {
              setEspacio(e.target.value);
              setArea("");
            }}
            disabled={!edificio}
          >
            <option value="">— Sin espacio —</option>
            {opcionesEspacio.map((s) => (
              <option key={s.id} value={s.nombre}>{s.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Departamento / área
          <select value={area} onChange={(e) => setArea(e.target.value)} disabled={!espacioId}>
            <option value="">— Sin área —</option>
            {opcionesArea.map((a) => (
              <option key={a.id} value={a.nombre}>{a.nombre}</option>
            ))}
          </select>
        </label>
        {edificios.length === 0 && <p className="reporte-tenue">Primero crea un edificio en la vista «Por edificio».</p>}
      </div>
    </ModalReporte>
  );
}
