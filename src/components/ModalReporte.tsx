// Ventana común de los reportes PDF (inventario y personal administrativo).
import { useEffect, type ReactNode } from "react";
import "./ModalReporte.css";

interface ModalReporteProps {
  titulo: string;
  descripcion: string;
  textoGenerar: string;
  generando: boolean;
  puedeGenerar: boolean;
  onGenerar: () => void;
  onCerrar: () => void;
  children: ReactNode;
}

export function ModalReporte({
  titulo,
  descripcion,
  textoGenerar,
  generando,
  puedeGenerar,
  onGenerar,
  onCerrar,
  children,
}: ModalReporteProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onCerrar]);

  return (
    <div className="reporte-modal-fondo" onClick={onCerrar}>
      <div
        className="reporte-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporte-modal-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reporte-modal-titulo">{titulo}</h2>
        <p className="reporte-tenue">{descripcion}</p>
        {children}
        <div className="reporte-modal__acciones">
          <button type="button" className="reporte-modal__cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="boton-pdf" onClick={onGenerar} disabled={generando || !puedeGenerar}>
            {generando ? "Generando..." : textoGenerar}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Casilla con texto (y conteo opcional) para las opciones del reporte. */
export function CasillaReporte({
  texto,
  cantidad,
  marcada,
  indeterminada = false,
  destacada = false,
  sangria = false,
  onCambiar,
}: {
  texto: string;
  cantidad?: number;
  marcada: boolean;
  indeterminada?: boolean;
  destacada?: boolean;
  sangria?: boolean;
  onCambiar: () => void;
}) {
  const clases = ["reporte-casilla", destacada && "reporte-casilla--destacada", sangria && "reporte-casilla--sangria"]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={clases}>
      <input
        type="checkbox"
        checked={marcada}
        ref={(input) => {
          if (input) input.indeterminate = indeterminada;
        }}
        onChange={onCambiar}
      />
      {texto}
      {cantidad !== undefined && <span className="reporte-tenue">({cantidad})</span>}
    </label>
  );
}
