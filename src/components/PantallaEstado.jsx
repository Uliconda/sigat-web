import { supabase } from "../config/supabase";
import "./PantallaEstado.css";

// Pantalla centrada para carga, errores y accesos denegados.
// tipo: "cargando" | "error" | "denegado"
export function PantallaEstado({ tipo = "cargando", titulo, mensaje, onReintentar, mostrarCerrarSesion = false }) {
  const iconos = { cargando: null, error: "⚠️", denegado: "🔒" };

  return (
    <div className="pantalla-estado" role={tipo === "cargando" ? "status" : "alert"} aria-live="polite">
      <div className="pantalla-estado__tarjeta">
        {tipo === "cargando" ? (
          <div className="pantalla-estado__spinner" aria-hidden="true" />
        ) : (
          <div className="pantalla-estado__icono" aria-hidden="true">{iconos[tipo]}</div>
        )}
        <h1 className="pantalla-estado__titulo">{titulo ?? (tipo === "cargando" ? "Cargando SIGAT…" : "Algo salió mal")}</h1>
        {mensaje && <p className="pantalla-estado__mensaje">{mensaje}</p>}

        {(onReintentar || mostrarCerrarSesion) && (
          <div className="pantalla-estado__acciones">
            {onReintentar && (
              <button type="button" className="btn btn--primario" onClick={onReintentar}>
                Reintentar
              </button>
            )}
            {mostrarCerrarSesion && (
              <button type="button" className="btn btn--secundario" onClick={() => supabase.auth.signOut()}>
                Cerrar sesión
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
