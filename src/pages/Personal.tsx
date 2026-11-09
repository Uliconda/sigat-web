// src/pages/Personal.tsx — Personal administrativo: consulta y reporte PDF.
// El alta, la edición y las asignaciones se hacen desde la app móvil.
import { Fragment, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { CasillaReporte, ModalReporte } from "../components/ModalReporte";
import Sidebar from "../components/Sidebar";
import { subscribeToAsignaciones, subscribeToEquipos, subscribeToPersonal } from "../services/supabaseData";
import type { Asignacion, Conducta, Equipo, Personal as PersonaAdministrativa } from "../types";
import { mensajeDeError } from "../utils/errores";
import {
  agruparPorDepartamento,
  buscarPersonal,
  departamentoDe,
  departamentosDe,
  equiposDePersona,
  estaActivo,
  formatearFecha,
  formatearFechaHora,
  historialDePersona,
} from "../utils/personal";
import "./Personal.css";

const TONO_CONDUCTA: Record<Conducta, string> = {
  Excelente: "exito",
  Buena: "exito",
  Regular: "aviso",
  Mala: "peligro",
};

const FALTA_MIGRACION = /personal_administrativo|asignaciones_equipo|PGRST205|42P01/i;

export default function Personal() {
  const [personal, setPersonal] = useState<PersonaAdministrativa[] | null>(null);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [verBajas, setVerBajas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [reporteAbierto, setReporteAbierto] = useState(false);

  useEffect(() => {
    const alFallar = (e: unknown) => {
      console.error("Error al cargar personal administrativo:", e);
      setError(
        FALTA_MIGRACION.test(String((e as { message?: string })?.message ?? e))
          ? "Falta aplicar en Supabase la migración 20261106000000_personal_administrativo.sql."
          : mensajeDeError(e)
      );
    };
    const cerrar = [
      subscribeToPersonal((filas) => {
        setPersonal(filas);
        setError(null);
      }, alFallar),
      subscribeToEquipos(setEquipos, alFallar),
      subscribeToAsignaciones(setAsignaciones, alFallar),
    ];
    return () => cerrar.forEach((fn) => fn());
  }, []);

  const lista = useMemo(() => personal ?? [], [personal]);
  const totalBajas = lista.filter((p) => !estaActivo(p)).length;
  const grupos = useMemo(() => {
    const encontrados = buscarPersonal(lista, busqueda);
    // Al buscar se incluye a quien ya no labora; sin búsqueda, según la casilla.
    return agruparPorDepartamento(busqueda.trim() || verBajas ? encontrados : encontrados.filter((p) => estaActivo(p)));
  }, [lista, busqueda, verBajas]);

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <header className="pagina-encabezado">
          <div>
            <h1 className="pagina-titulo">Personal Administrativo</h1>
            <p className="pagina-subtitulo">
              Equipo asignado e historial por departamento. Las altas y asignaciones se hacen desde la app móvil.
            </p>
          </div>
          <button
            type="button"
            className="boton-pdf"
            onClick={() => setReporteAbierto(true)}
            disabled={lista.length === 0}
          >
            📄 Generar reporte PDF
          </button>
        </header>

        <div className="personal-filtros">
          <div className="personal-buscador">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              aria-label="Buscar personal"
              placeholder="Buscar por nombre o departamento..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          {totalBajas > 0 && (
            <label className="personal-casilla">
              <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} />
              Mostrar personal que ya no labora ({totalBajas})
            </label>
          )}
        </div>

        {error && <div className="tarjeta personal-aviso">{error}</div>}
        {personal === null && !error && <div className="tabla-vacia">Cargando personal...</div>}
        {personal !== null && grupos.length === 0 && (
          <div className="tabla-tarjeta">
            <div className="tabla-vacia">
              {busqueda.trim() ? `Nadie coincide con "${busqueda.trim()}".` : "Aún no hay personal registrado."}
            </div>
          </div>
        )}

        {grupos.map(({ departamento, personas }) => (
          <section key={departamento} className="personal-grupo" aria-label={departamento}>
            <h2 className="personal-grupo__titulo">
              {departamento.toUpperCase()} <span>({personas.length})</span>
            </h2>
            <div className="tabla-tarjeta">
              <table className="tabla personal-tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Ingreso</th>
                    <th>Término</th>
                    <th>Conducta</th>
                    <th>Equipo actual</th>
                    <th className="centrado">Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => {
                    const actuales = equiposDePersona(equipos, p.id);
                    const anteriores = historialDePersona(asignaciones, p.id);
                    const activo = estaActivo(p);
                    const expandida = abierta === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr className={activo ? undefined : "personal-fila--baja"}>
                          <td className="negrita">
                            {p.nombre}
                            {!activo && <span className="personal-baja">Ya no labora</span>}
                          </td>
                          <td>{formatearFecha(p.fecha_ingreso) || "—"}</td>
                          <td>{formatearFecha(p.fecha_termino) || "—"}</td>
                          <td>
                            {p.conducta ? (
                              <span className={`etiqueta etiqueta--${TONO_CONDUCTA[p.conducta]}`} title={p.conducta_notas ?? undefined}>
                                {p.conducta}
                              </span>
                            ) : (
                              <span className="personal-tenue">Sin evaluar</span>
                            )}
                          </td>
                          <td>
                            {actuales.length === 0 ? (
                              <span className="personal-tenue">Sin equipo</span>
                            ) : (
                              actuales.map((e) => (
                                <div key={e.id}>
                                  <b>{e.id}</b> {e.nombre}
                                </div>
                              ))
                            )}
                          </td>
                          <td className="centrado">
                            <button
                              type="button"
                              className="personal-ver"
                              onClick={() => setAbierta(expandida ? null : p.id)}
                              aria-expanded={expandida}
                              disabled={anteriores.length === 0}
                            >
                              {anteriores.length === 0 ? "Sin anteriores" : `${expandida ? "▾" : "▸"} ${anteriores.length} anterior${anteriores.length === 1 ? "" : "es"}`}
                            </button>
                          </td>
                        </tr>
                        {expandida && (
                          <tr className="personal-historial">
                            <td colSpan={6}>
                              <ul>
                                {anteriores.map((a) => (
                                  <li key={a.id}>
                                    <b>{a.equipo_id}</b> {a.equipo_nombre} · {formatearFechaHora(a.fecha_inicio)} a{" "}
                                    {formatearFechaHora(a.fecha_fin)}
                                    {a.condicion_devolucion && ` · Devuelto en: ${a.condicion_devolucion}`}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>

      {reporteAbierto && (
        <DialogoReporte
          personal={lista}
          equipos={equipos}
          asignaciones={asignaciones}
          onCerrar={() => setReporteAbierto(false)}
        />
      )}
    </div>
  );
}

function DialogoReporte({
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
