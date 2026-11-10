// src/pages/Maintenance.tsx
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Swal from "sweetalert2";
import { addHistorial, getHistorialEquipo, subscribeToEquipos, updateEquipo } from "../services/supabaseData";
import { useAuth } from "../context/useAuth";
import type { Equipo, Historial } from "../types";
import { mensajeDeError } from "../utils/errores";
import {
  DIAS_URGENTE,
  NIVELES,
  compararPorPrioridad,
  estadoMantenimiento,
  fechaUltimaRevision,
  type EstadoMantenimiento,
  type NivelMantenimiento,
} from "../utils/mantenimiento";
import "./Maintenance.css";

type Filtro = NivelMantenimiento | "todos";

interface FilaMantenimiento {
  equipo: Equipo;
  estado: EstadoMantenimiento;
}

const TIPOS_MANTENIMIENTO = ["Preventivo", "Correctivo", "Limpieza", "Actualización de software", "Otro"] as const;
const CONDICIONES = ["Buen estado", "Aceptable", "Reemplazar"] as const;

// Algunos equipos antiguos guardaban el nombre en "name".
const nombreDe = (item: Equipo): string => String(item.nombre ?? item.name ?? "") || "Sin nombre";
const esFiltro = (valor: string | null): valor is Filtro =>
  valor === "todos" || NIVELES.some((n) => n.nivel === valor);

const formatoFecha = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const fecha = (valor: Date | string | null | undefined, conHora = false): string => {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return (conHora ? formatoFechaHora : formatoFecha).format(d);
};

function textoDias(estado: EstadoMantenimiento): string {
  if (estado.dias === null) return "Nunca revisado";
  if (estado.dias === 0) return "Hoy";
  return estado.dias === 1 ? "Hace 1 día" : `Hace ${estado.dias} días`;
}

function textoProxima(estado: EstadoMantenimiento): string {
  if (!estado.proximaRevision || estado.dias === null) return "Revisar lo antes posible";
  const restantes = DIAS_URGENTE - estado.dias;
  if (restantes < 0) return `Venció hace ${-restantes} ${-restantes === 1 ? "día" : "días"}`;
  if (restantes === 0) return "Vence hoy";
  return `En ${restantes} ${restantes === 1 ? "día" : "días"} (${fecha(estado.proximaRevision)})`;
}

const esMantenimiento = (h: Historial) => (h.accion ?? "").toUpperCase().includes("MANTENIMIENTO");

const Maintenance = () => {
  const { userData } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ahora] = useState(() => Date.now());
  const [busqueda, setBusqueda] = useState("");
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [registroId, setRegistroId] = useState<string | null>(null);

  const parametro = searchParams.get("filtro");
  const filtro: Filtro = esFiltro(parametro) ? parametro : "todos";
  const vieneDelAviso = parametro === "urgente";

  const cambiarFiltro = (nuevo: Filtro) => {
    setSearchParams(nuevo === "todos" ? {} : { filtro: nuevo }, { replace: true });
  };

  // En tiempo real: si alguien registra un mantenimiento desde otro lugar, se ve aquí.
  useEffect(
    () =>
      subscribeToEquipos(
        (docs) => {
          setEquipos(docs.filter((e) => !e.isTemplate && e.nombre?.toLowerCase() !== "plantilla sistema"));
          setCargando(false);
        },
        (error) => {
          console.error("Error al cargar equipos desde Supabase:", error);
          setCargando(false);
        }
      ),
    []
  );

  const filas = useMemo<FilaMantenimiento[]>(
    () =>
      equipos
        .map((equipo) => ({ equipo, estado: estadoMantenimiento(equipo, ahora) }))
        .sort((a, b) => compararPorPrioridad(a.estado, b.estado)),
    [equipos, ahora]
  );

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todos: filas.length, urgente: 0, proximo: 0, "al-dia": 0, "sin-revision": 0 };
    filas.forEach((f) => { c[f.estado.nivel] += 1; });
    return c;
  }, [filas]);

  const urgentes = filas.filter((f) => f.estado.nivel === "urgente");

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro !== "todos" && f.estado.nivel !== filtro) return false;
      if (!texto) return true;
      return [f.equipo.id, f.equipo.id_qr, nombreDe(f.equipo), f.equipo.categoria, f.equipo.marca, f.equipo.no_serie]
        .some((campo) => String(campo ?? "").toLowerCase().includes(texto));
    });
  }, [filas, filtro, busqueda]);

  // Al llegar desde el aviso "N equipos con mantenimiento URGENTE" se lleva la vista al primero.
  const primeraFilaRef = useRef<HTMLTableRowElement>(null);
  const yaDesplazado = useRef(false);
  useEffect(() => {
    if (!vieneDelAviso || cargando || yaDesplazado.current || !primeraFilaRef.current) return;
    yaDesplazado.current = true;
    primeraFilaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [vieneDelAviso, cargando, visibles.length]);

  const detalle = filas.find((f) => f.equipo.id === detalleId) ?? null;
  const registro = filas.find((f) => f.equipo.id === registroId) ?? null;

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <header className="pagina-encabezado">
          <div>
            <h1 className="pagina-titulo">Mantenimiento Preventivo</h1>
            <p className="pagina-subtitulo">
              Cada equipo debe revisarse al menos cada {DIAS_URGENTE} días para evitar fallas y alargar su vida útil.
            </p>
          </div>
        </header>

        {/* AVISO DE URGENTES: indica exactamente qué equipos son */}
        {!cargando && urgentes.length > 0 && (
          <div className={`mant-alerta${vieneDelAviso ? " mant-alerta--destacada" : ""}`} role="alert">
            <div className="mant-alerta__texto">
              <strong>
                ⚠️ {urgentes.length === 1 ? "1 equipo necesita" : `${urgentes.length} equipos necesitan`} mantenimiento urgente
              </strong>
              <span>Llevan más de {DIAS_URGENTE} días sin revisión. Haz clic en uno para ver sus detalles.</span>
            </div>
            <div className="mant-alerta__equipos">
              {urgentes.slice(0, 6).map((f) => (
                <button key={f.equipo.id} type="button" className="mant-chip" onClick={() => setDetalleId(f.equipo.id)}>
                  {nombreDe(f.equipo)} <small>· {f.estado.dias} días</small>
                </button>
              ))}
              {urgentes.length > 6 && filtro !== "urgente" && (
                <button type="button" className="mant-chip mant-chip--mas" onClick={() => cambiarFiltro("urgente")}>
                  Ver los {urgentes.length}
                </button>
              )}
            </div>
          </div>
        )}

        {/* RESUMEN Y FILTROS */}
        <div className="mant-resumen" role="group" aria-label="Filtrar por estado de mantenimiento">
          {([{ nivel: "todos", etiqueta: "Todos" } as const, ...NIVELES]).map(({ nivel, etiqueta }) => (
            <button
              key={nivel}
              type="button"
              className={`mant-filtro mant-filtro--${nivel}${filtro === nivel ? " mant-filtro--activo" : ""}`}
              aria-pressed={filtro === nivel}
              onClick={() => cambiarFiltro(nivel)}
            >
              <span className="mant-filtro__valor">{cargando ? "—" : conteo[nivel]}</span>
              <span className="mant-filtro__etiqueta">{etiqueta}</span>
            </button>
          ))}
        </div>

        <div className="mant-barra">
          <input
            type="search"
            className="mant-busqueda"
            placeholder="Buscar por ID, nombre, categoría, marca o serie…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar equipo"
          />
          {(filtro !== "todos" || busqueda) && (
            <button type="button" className="btn btn--secundario" onClick={() => { cambiarFiltro("todos"); setBusqueda(""); }}>
              Quitar filtros
            </button>
          )}
        </div>

        <div className="tabla-tarjeta">
          <table className="tabla mantenimiento-tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Equipo</th>
                <th>Última revisión</th>
                <th>Estado</th>
                <th>Último trabajo</th>
                <th className="centrado">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, indice) => {
                const { equipo, estado } = f;
                const marcarFila = vieneDelAviso && estado.nivel === "urgente";
                return (
                  <tr
                    key={equipo.id}
                    ref={indice === 0 ? primeraFilaRef : undefined}
                    className={`mant-fila${marcarFila ? " mant-fila--resaltada" : ""}`}
                  >
                    <td className="negrita">{equipo.id_qr || equipo.id}</td>
                    <td>
                      <button type="button" className="mant-enlace" onClick={() => setDetalleId(equipo.id)}>
                        {nombreDe(equipo)}
                      </button>
                      {equipo.categoria && <div className="mant-sub">{equipo.categoria}</div>}
                    </td>
                    <td>
                      {fecha(fechaUltimaRevision(equipo))}
                      <div className="mant-sub">{textoDias(estado)}</div>
                    </td>
                    <td>
                      <span className={`mant-nivel mant-nivel--${estado.nivel}`}>{estado.etiqueta}</span>
                    </td>
                    <td className="mantenimiento-observacion" title={equipo.observacion_revision || undefined}>
                      {equipo.observacion_revision || "—"}
                    </td>
                    <td className="centrado">
                      <div className="mant-acciones">
                        <button type="button" className="btn btn--secundario mant-boton" onClick={() => setDetalleId(equipo.id)}>
                          Ver detalles
                        </button>
                        <button type="button" className="btn btn--primario mant-boton" onClick={() => setRegistroId(equipo.id)}>
                          🛠️ Registrar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visibles.length === 0 && (
            <div className="tabla-vacia">
              {cargando
                ? "Cargando equipos…"
                : equipos.length === 0
                  ? "No hay equipos registrados para revisar."
                  : filtro === "urgente" && !busqueda
                    ? "✅ No hay equipos con mantenimiento urgente."
                    : "Ningún equipo coincide con el filtro."}
            </div>
          )}
        </div>
      </main>

      {detalle && (
        <PanelDetalle
          fila={detalle}
          onCerrar={() => setDetalleId(null)}
          onRegistrar={() => setRegistroId(detalle.equipo.id)}
        />
      )}

      {registro && (
        <FormularioMantenimiento
          equipo={registro.equipo}
          responsablePorDefecto={userData?.nombre || ""}
          onCerrar={() => setRegistroId(null)}
        />
      )}
    </div>
  );
};

export default Maintenance;

/* ==========================================================
   Panel lateral con todos los detalles del equipo
   ========================================================== */
function PanelDetalle({ fila, onCerrar, onRegistrar }: { fila: FilaMantenimiento; onCerrar: () => void; onRegistrar: () => void }) {
  const { equipo, estado } = fila;
  const [historial, setHistorial] = useState<Historial[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const ultimaRevision = equipo.fecha_revision || equipo.lastCheck;

  // Se recarga cuando cambia la fecha de revisión (p. ej. justo después de registrar uno).
  useEffect(() => {
    let vigente = true;
    getHistorialEquipo(equipo.id)
      .then((movimientos) => { if (vigente) { setHistorial(movimientos.filter(esMantenimiento)); setErrorHistorial(null); } })
      .catch((error) => { if (vigente) setErrorHistorial(mensajeDeError(error)); });
    return () => { vigente = false; };
  }, [equipo.id, ultimaRevision]);

  useCerrarConEscape(onCerrar);

  const avance = estado.dias === null ? 100 : Math.min(100, Math.round((estado.dias / DIAS_URGENTE) * 100));
  const datos: [string, unknown][] = [
    ["ID / QR", equipo.id_qr || equipo.id],
    ["Categoría", [equipo.categoria, equipo.subcategoria, equipo.subSubcategoria].filter(Boolean).join(" › ")],
    ["Marca", equipo.marca],
    ["No. de serie", equipo.no_serie],
    ["Estado de uso", equipo.estado],
    ["Condición física", equipo.condicion_fisica],
    ["Lo tiene", equipo.poseedor_actual],
  ];

  return (
    <div className="mant-fondo" onClick={onCerrar}>
      <aside
        className="mant-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mant-panel-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mant-panel__encabezado">
          <div>
            <h2 id="mant-panel-titulo">{nombreDe(equipo)}</h2>
            <span className={`mant-nivel mant-nivel--${estado.nivel}`}>{estado.etiqueta}</span>
          </div>
          <button type="button" className="mant-cerrar" onClick={onCerrar} aria-label="Cerrar detalles">✕</button>
        </header>

        <section className="mant-bloque">
          <h3>Estado del mantenimiento</h3>
          <div className={`mant-progreso mant-progreso--${estado.nivel}`} aria-hidden="true">
            <div style={{ width: `${avance}%` }} />
          </div>
          <dl className="mant-datos">
            <div><dt>Última revisión</dt><dd>{fecha(fechaUltimaRevision(equipo), true)}</dd></div>
            <div><dt>Tiempo sin revisión</dt><dd>{textoDias(estado)}</dd></div>
            <div><dt>Próxima revisión</dt><dd>{textoProxima(estado)}</dd></div>
            {typeof equipo.tipo_mantenimiento === "string" && (
              <div><dt>Último tipo</dt><dd>{equipo.tipo_mantenimiento}</dd></div>
            )}
          </dl>
          {equipo.observacion_revision && (
            <p className="mant-nota"><b>Último trabajo:</b> {equipo.observacion_revision}</p>
          )}
        </section>

        <section className="mant-bloque">
          <h3>Datos del equipo</h3>
          <dl className="mant-datos">
            {datos.map(([etiqueta, valor]) => (
              <div key={etiqueta}><dt>{etiqueta}</dt><dd>{String(valor || "—")}</dd></div>
            ))}
          </dl>
        </section>

        <section className="mant-bloque">
          <h3>Historial de mantenimientos {historial && `(${historial.length})`}</h3>
          {errorHistorial ? (
            <p className="mant-vacio">No se pudo cargar el historial: {errorHistorial}</p>
          ) : historial === null ? (
            <p className="mant-vacio">Cargando…</p>
          ) : historial.length === 0 ? (
            <p className="mant-vacio">Este equipo aún no tiene mantenimientos registrados.</p>
          ) : (
            <ol className="mant-linea">
              {historial.map((h) => (
                <li key={h.id}>
                  <div className="mant-linea__cabecera">
                    <b>{typeof h.tipoMantenimiento === "string" ? h.tipoMantenimiento : "Mantenimiento"}</b>
                    <time>{fecha(h.fecha, true)}</time>
                  </div>
                  {h.observaciones && <p>{h.observaciones}</p>}
                  <div className="mant-sub">
                    Por {String(h.responsable || h.admin || "—")}
                    {typeof h.condicion === "string" && ` · Condición: ${h.condicion}`}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mant-panel__pie">
          <button type="button" className="btn btn--primario" onClick={onRegistrar}>🛠️ Registrar mantenimiento</button>
        </footer>
      </aside>
    </div>
  );
}

/* ==========================================================
   Formulario para registrar un mantenimiento con detalle
   ========================================================== */
function FormularioMantenimiento({ equipo, responsablePorDefecto, onCerrar }: {
  equipo: Equipo;
  responsablePorDefecto: string;
  onCerrar: () => void;
}) {
  const { userData } = useAuth();
  const [tipo, setTipo] = useState<string>(TIPOS_MANTENIMIENTO[0]);
  const [condicion, setCondicion] = useState<string>(
    CONDICIONES.includes(equipo.condicion_fisica as (typeof CONDICIONES)[number]) ? String(equipo.condicion_fisica) : CONDICIONES[0]
  );
  const [descripcion, setDescripcion] = useState("");
  const [piezas, setPiezas] = useState("");
  const [responsable, setResponsable] = useState(responsablePorDefecto);
  const [guardando, setGuardando] = useState(false);

  useCerrarConEscape(() => { if (!guardando) onCerrar(); });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const trabajo = descripcion.trim();
    if (!trabajo) return;

    setGuardando(true);
    try {
      const fechaRevision = new Date();
      const piezasTexto = piezas.trim();
      const quien = responsable.trim() || userData?.nombre || "Usuario Web";

      await updateEquipo(equipo.id, {
        fecha_revision: fechaRevision.toISOString(),
        observacion_revision: trabajo,
        tipo_mantenimiento: tipo,
        condicion_fisica: condicion,
      });

      // Mismo formato del historial que usa el Inventario para que salga en el Excel.
      await addHistorial({
        idEquipo: equipo.id,
        nombreEquipo: nombreDe(equipo),
        accion: "MANTENIMIENTO",
        fecha: fechaRevision,
        admin: userData?.nombre || "Usuario Web",
        observaciones: `Mantenimiento ${tipo}: ${trabajo}${piezasTexto ? ` | Piezas/materiales: ${piezasTexto}` : ""}`,
        tipoMantenimiento: tipo,
        condicion,
        piezas: piezasTexto || undefined,
        responsable: quien,
      });

      onCerrar();
      Swal.fire({
        title: "¡Mantenimiento registrado!",
        text: `"${nombreDe(equipo)}" queda al día por ${DIAS_URGENTE} días.`,
        icon: "success",
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error al guardar mantenimiento:", error);
      setGuardando(false);
      Swal.fire("No se guardó el mantenimiento", mensajeDeError(error), "error");
    }
  };

  return (
    <div className="mant-fondo mant-fondo--centro" onClick={() => { if (!guardando) onCerrar(); }}>
      <form
        className="mant-formulario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mant-form-titulo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={guardar}
      >
        <h2 id="mant-form-titulo">Registrar mantenimiento</h2>
        <p className="mant-sub">{nombreDe(equipo)} · {equipo.id_qr || equipo.id}</p>

        <label className="mant-campo">
          <span>Tipo de mantenimiento</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_MANTENIMIENTO.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>

        <label className="mant-campo">
          <span>¿Qué se le hizo? *</span>
          <textarea
            required
            rows={4}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Limpieza general, cambio de pasta térmica, ajuste de cableado…"
            autoFocus
          />
        </label>

        <label className="mant-campo">
          <span>Piezas o materiales usados <small>(opcional)</small></span>
          <input value={piezas} onChange={(e) => setPiezas(e.target.value)} placeholder="Ej. Cable HDMI, ventilador 80 mm" />
        </label>

        <div className="mant-campos-fila">
          <label className="mant-campo">
            <span>Condición después</span>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              {CONDICIONES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="mant-campo">
            <span>Responsable</span>
            <input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Quién lo realizó" />
          </label>
        </div>

        <div className="mant-formulario__acciones">
          <button type="button" className="btn btn--secundario" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn--primario" disabled={guardando || !descripcion.trim()}>
            {guardando ? "Guardando…" : "Guardar registro"}
          </button>
        </div>
      </form>
    </div>
  );
}

function useCerrarConEscape(onCerrar: () => void) {
  const ref = useRef(onCerrar);
  useEffect(() => { ref.current = onCerrar; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") ref.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
