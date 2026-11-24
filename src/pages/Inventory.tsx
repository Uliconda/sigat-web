// src/pages/Inventory.tsx — Inventario con tres vistas: Todos, Por edificio y
// Por categoría. Los reportes están en /reportes.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import Swal from "sweetalert2";
import { DialogoUbicacion } from "../components/DialogoUbicacion";
import { PanelEdificios } from "../components/PanelEdificios";
import Sidebar from "../components/Sidebar";
import { ESTADOS, esEstado } from "../constants/estados";
import { useAuth } from "../context/useAuth";
import {
  addHistorial,
  subscribeToAreas,
  subscribeToEdificios,
  subscribeToEquipos,
  subscribeToEspacios,
  updateEquipo,
} from "../services/supabaseData";
import type { Area, Edificio, Equipo, Espacio } from "../types";
import { areasInventario, categoriaDe, subcategoriaDe } from "../utils/areasInventario";
import { mensajeDeError } from "../utils/errores";
import { escapeHtml } from "../utils/html";
import { areaDe, describirUbicacion, edificioDe, espacioDe } from "../utils/ubicacion";
import "../components/PanelEdificios.css";
import "./Inventory.css";

type Vista = "todos" | "edificio" | "categoria";
const VISTAS: { clave: Vista; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "edificio", texto: "Por edificio" },
  { clave: "categoria", texto: "Por categoría" },
];

const esPlantilla = (e: Equipo) => Boolean(e.isTemplate) || e.nombre === "Plantilla Sistema";
const normalizar = (texto: unknown) => String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Inventory() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [areasCatalogo, setAreasCatalogo] = useState<Area[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [params, setParams] = useSearchParams();
  const vista: Vista = VISTAS.some((v) => v.clave === params.get("vista")) ? (params.get("vista") as Vista) : "todos";
  const [edificio, setEdificio] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [subcategoria, setSubcategoria] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [asignando, setAsignando] = useState(false);

  const { userData } = useAuth();

  // ==========================================
  // 1. Equipos y catálogo de edificios en tiempo real
  // ==========================================
  useEffect(() => {
    const alFallar = (origen: string) => (error: unknown) => console.error(`Error al cargar ${origen} desde Supabase:`, error);
    const cerrar = [
      subscribeToEquipos(setEquipos, alFallar("equipos")),
      subscribeToEdificios(setEdificios, alFallar("edificios")),
      subscribeToEspacios(setEspacios, alFallar("espacios")),
      subscribeToAreas(setAreasCatalogo, alFallar("áreas")),
    ];
    return () => cerrar.forEach((fn) => fn());
  }, []);

  const cambiarVista = (clave: Vista) => {
    setParams(clave === "todos" ? {} : { vista: clave }, { replace: true });
    setEdificio(null);
    setEspacio(null);
    setArea(null);
    setCategoria(null);
    setSubcategoria(null);
  };

  const reales = useMemo(() => equipos.filter((e) => !esPlantilla(e)), [equipos]);
  const areas = useMemo(() => areasInventario(reales), [reales]);
  const subcategorias = areas.find((a) => a.categoria === categoria)?.subcategorias ?? [];

  // FILTRADO Y ORDEN ASCENDENTE POR ID (001, 002, ... 010, 100). "numeric"
  // compara los números por su valor, así "010" va después de "009".
  const busqueda = normalizar(searchTerm.trim());
  const filteredEquipos = reales
    .filter((item) => {
      if (vista === "edificio" && edificio && edificioDe(item) !== edificio) return false;
      if (vista === "edificio" && edificio && espacio && espacioDe(item) !== espacio) return false;
      if (vista === "edificio" && edificio && espacio && area && areaDe(item) !== area) return false;
      if (vista === "categoria" && categoria && categoriaDe(item) !== categoria) return false;
      if (vista === "categoria" && categoria && subcategoria && subcategoriaDe(item) !== subcategoria) return false;
      if (!busqueda) return true;
      return [item.nombre, item.id, describirUbicacion(item)].some((campo) => normalizar(campo).includes(busqueda));
    })
    .sort((a, b) => (a.id || "").localeCompare(b.id || "", "es", { numeric: true, sensitivity: "base" }));

  // Selección para asignar ubicación a varios equipos.
  const todosMarcados = filteredEquipos.length > 0 && filteredEquipos.every((e) => seleccion.has(e.id));
  const alternarTodos = () =>
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      filteredEquipos.forEach((e) => (todosMarcados ? siguiente.delete(e.id) : siguiente.add(e.id)));
      return siguiente;
    });
  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  // ==========================================
  // 2. FUNCIÓN PARA CAMBIAR ESTADO NORMAL
  // ==========================================
  const handleToggleStatus = async (equipo: Equipo) => {
    const esDisponible = esEstado(equipo.estado, ESTADOS.DISPONIBLE);
    const nuevoEstado = esDisponible ? ESTADOS.PRESTADO : ESTADOS.DISPONIBLE;

    const result = await Swal.fire({
      title: '¿Confirmar cambio?',
      text: `El equipo "${equipo.nombre}" pasará a estar ${nuevoEstado}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#28a745', 
      cancelButtonColor: '#d33',     
      confirmButtonText: 'Sí, cambiar estado',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return; 

    try {
      await updateEquipo(equipo.id, {
        estado: nuevoEstado,
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addHistorial({
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: nuevoEstado === ESTADOS.PRESTADO ? "PRÉSTAMO" : "DEVOLUCIÓN",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Desconocido",
        observaciones: "Cambio de estado manual desde la Web",
      });

      Swal.fire({ title: '¡Actualizado!', text: `El equipo ahora está ${nuevoEstado}.`, icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al actualizar:", error);
      Swal.fire('No se guardó el movimiento', mensajeDeError(error), 'error');
    }
  };

  // ==========================================
  // 3. FUNCIÓN PARA DAR DE BAJA (Fuera de Servicio)
  // ==========================================
  const handleDiscardEquipment = async (equipo: Equipo) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: 'Dar de Baja Equipo',
      text: `¿Por qué vas a dar de baja el equipo "${equipo.nombre}"?`,
      input: 'text',
      inputPlaceholder: 'Ej. Pantalla rota, se quemó, extraviado...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, dar de baja',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) return '¡Necesitas escribir un motivo para el historial!';
      }
    });

    if (!isConfirmed) return;

    try {
      await updateEquipo(equipo.id, {
        estado: ESTADOS.FUERA_DE_SERVICIO,
        usuarioActual: userData?.nombre || "Usuario Web", 
      });

      await addHistorial({
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: "BAJA",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Web",
        observaciones: `Baja del sistema. Motivo: ${motivo}`,
      });

      Swal.fire({ title: '¡Equipo Dado de Baja!', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al dar de baja:", error);
      Swal.fire('No se pudo dar de baja', mensajeDeError(error), 'error');
    }
  };

  // ==========================================
  // 4. FUNCIÓN PARA REACTIVAR EQUIPO (Reparado)
  // ==========================================
  const handleRestoreEquipment = async (equipo: Equipo) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: 'Reactivar Equipo',
      text: `¿Por qué se vuelve a activar el equipo "${equipo.nombre}"?`,
      input: 'text',
      inputPlaceholder: 'Ej. Se reparó, se cambió la pieza...',
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, reactivar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) return '¡Necesitas escribir cómo o por qué se reparó!';
      }
    });

    if (!isConfirmed) return;

    try {
      await updateEquipo(equipo.id, {
        estado: ESTADOS.DISPONIBLE,
        usuarioActual: userData?.nombre || "Usuario Web", 
      }); 
      
      await addHistorial({
        idEquipo: equipo.id,
        nombreEquipo: equipo.nombre,
        accion: "REACTIVACIÓN",
        fecha: new Date(),
        admin: userData?.nombre || "Usuario Web",
        observaciones: `Equipo reactivado tras reparación. Motivo/Detalle: ${motivo}`,
      });

      Swal.fire({ title: '¡Equipo Reactivado!', text: 'El equipo ahora está Disponible nuevamente.', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error("Error al reactivar:", error);
      Swal.fire('No se pudo reactivar', mensajeDeError(error), 'error');
    }
  };

  // ==========================================
  // 5. FUNCIÓN PARA GENERAR QR, DESCARGAR E IMPRIMIR
  // ==========================================
  const handleGenerateQR = async (equipo: Equipo) => {
    // El QR se genera en el navegador: no depende de servicios externos.
    let qrUrl;
    try {
      qrUrl = await QRCode.toDataURL(String(equipo.id), { width: 500, margin: 2 });
    } catch (error) {
      console.error("Error al generar el QR:", error);
      Swal.fire("Error", "No se pudo generar el código QR de este equipo.", "error");
      return;
    }
    const nombreSeguro = escapeHtml(equipo.nombre);
    const idSeguro = escapeHtml(equipo.id);

    const result = await Swal.fire({
      title: `QR del Equipo`,
      html: `<b>${nombreSeguro}</b><br/><small>ID: ${idSeguro}</small>`,
      imageUrl: qrUrl,
      imageWidth: 200,
      imageHeight: 200,
      imageAlt: `Código QR de ${equipo.id}`,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: '#FF6F00',
      denyButtonColor: '#28a745', 
      cancelButtonColor: '#17a2b8', 
      confirmButtonText: 'Cerrar',
      denyButtonText: '📥 Descargar',
      cancelButtonText: '🖨️ Imprimir',
      footer: '<span style="color: gray; font-size: 13px;">Puedes escanear este código desde la App Móvil</span>'
    });

    if (result.isDenied) {
      const link = document.createElement('a');
      link.href = qrUrl;
      link.download = `QR_${equipo.id}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    else if (result.dismiss === Swal.DismissReason.cancel) {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        Swal.fire("Ventana bloqueada", "Permite las ventanas emergentes de este sitio para imprimir el QR.", "warning");
        return;
      }
      printWindow.document.write(`
        <html lang="es">
          <head>
            <title>Imprimir QR - ${nombreSeguro}</title>
            <style>
              body { text-align: center; font-family: Arial, sans-serif; margin-top: 50px; }
              img { margin-top: 20px; }
              @media print { @page { margin: 0; } body { margin: 1.6cm; } }
            </style>
          </head>
          <body>
            <h2>${nombreSeguro}</h2>
            <p><strong>ID:</strong> ${idSeguro}</p>
            <img src="${qrUrl}" width="250" height="250" alt="Código QR" />
          </body>
        </html>
      `);
      printWindow.document.close();
      // Se imprime desde aquí: la ventana no ejecuta scripts propios.
      const imprimir = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      };
      const img = printWindow.document.querySelector("img");
      if (img?.complete) imprimir();
      else img?.addEventListener("load", imprimir, { once: true });
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <header className="pagina-encabezado">
          <div>
            <h1 className="pagina-titulo">Inventario</h1>
            <p className="pagina-subtitulo">Consulta los equipos por edificio o categoría y asígnales su ubicación</p>
          </div>
          <div className="inventario-acciones">
            <Link to="/reportes" className="btn btn--secundario">📄 Reportes PDF y Excel</Link>
          </div>
        </header>

        <div className="inventario-vistas" role="tablist" aria-label="Vista del inventario">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              role="tab"
              aria-selected={vista === v.clave}
              className={`inventario-vista${vista === v.clave ? " inventario-vista--activa" : ""}`}
              onClick={() => cambiarVista(v.clave)}
            >
              {v.texto}
            </button>
          ))}
        </div>

        {vista === "edificio" && (
          <PanelEdificios
            equipos={reales}
            edificios={edificios}
            espacios={espacios}
            areas={areasCatalogo}
            edificio={edificio}
            espacio={espacio}
            area={area}
            onEdificio={(nombre) => {
              setEdificio(nombre);
              setEspacio(null);
              setArea(null);
            }}
            onEspacio={(nombre) => {
              setEspacio(nombre);
              setArea(null);
            }}
            onArea={setArea}
          />
        )}

        {vista === "categoria" && (
          <section className="inventario-categorias" aria-label="Categorías">
            <div className="inventario-categorias__lista">
              {areas.map((a) => (
                <button
                  key={a.categoria}
                  type="button"
                  className={`chip${categoria === a.categoria ? " chip--activo" : ""}`}
                  onClick={() => {
                    setCategoria(categoria === a.categoria ? null : a.categoria);
                    setSubcategoria(null);
                  }}
                >
                  {a.categoria} ({a.cantidad})
                </button>
              ))}
            </div>
            {categoria && subcategorias.length > 1 && (
              <div className="inventario-categorias__lista">
                <span className="panel-edificios__etiqueta">Subcategoría:</span>
                {subcategorias.map((s) => (
                  <button
                    key={s.clave}
                    type="button"
                    className={`chip${subcategoria === s.nombre ? " chip--activo" : ""}`}
                    onClick={() => setSubcategoria(subcategoria === s.nombre ? null : s.nombre)}
                  >
                    {s.nombre} ({s.cantidad})
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="inventario-buscador">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            aria-label="Buscar equipos"
            placeholder="Buscar por nombre, ID o ubicación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {seleccion.size > 0 && (
          <div className="inventario-seleccion" role="status">
            <span><b>{seleccion.size}</b> equipo{seleccion.size === 1 ? "" : "s"} seleccionado{seleccion.size === 1 ? "" : "s"}</span>
            <button type="button" className="btn btn--primario" onClick={() => setAsignando(true)}>📍 Asignar ubicación</button>
            <button type="button" className="btn btn--secundario" onClick={() => setSeleccion(new Set())}>Quitar selección</button>
          </div>
        )}

        <div className="tabla-tarjeta">
          <table className="tabla inventario-tabla">
            <thead>
              <tr>
                <th className="centrado">
                  <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Seleccionar todos los equipos de la lista" />
                </th>
                <th>ID EQUIPO</th>
                <th>NOMBRE / MODELO</th>
                <th>UBICACIÓN</th>
                <th>ESTADO</th>
                <th>ÚLTIMO USUARIO</th>
                <th className="centrado">QR</th>
                <th className="centrado">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipos.map((item) => (
                <tr key={item.id}>
                  <td className="centrado">
                    <input type="checkbox" checked={seleccion.has(item.id)} onChange={() => alternar(item.id)} aria-label={`Seleccionar ${item.id}`} />
                  </td>
                  <td className="negrita">{item.id}</td>
                  <td>{item.nombre}</td>
                  <td>{describirUbicacion(item) || <span className="reporte-tenue">Sin edificio</span>}</td>
                  <td>
                    <span className={`etiqueta inventario-estado--${claseEstado(item.estado)}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>{item.usuarioActual || "---"}</td>

                  <td className="centrado">
                    <button type="button" onClick={() => handleGenerateQR(item)} className="inventario-qr" title="Ver Código QR del equipo">🔳 QR</button>
                  </td>

                  <td className="centrado">
                    <div className="inventario-fila-acciones">
                      {!esEstado(item.estado, ESTADOS.FUERA_DE_SERVICIO) ? (
                        <>
                          <button type="button" onClick={() => handleToggleStatus(item)} className="inventario-accion" title="Cambiar estado (Prestar/Devolver)">🔄 Estado</button>
                          <button type="button" onClick={() => handleDiscardEquipment(item)} className="inventario-accion inventario-accion--baja" title="Marcar como descompuesto o fuera de servicio">🚫 Baja</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => handleRestoreEquipment(item)} className="inventario-accion inventario-accion--reactivar" title="Volver a activar este equipo">✅ Reactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEquipos.length === 0 && (
            <div className="tabla-vacia">No se encontraron equipos que coincidan.</div>
          )}
        </div>
      </main>

      {asignando && (
        <DialogoUbicacion
          ids={[...seleccion]}
          edificios={edificios}
          espacios={espacios}
          areas={areasCatalogo}
          onListo={() => {
            setAsignando(false);
            setSeleccion(new Set());
          }}
          onCerrar={() => setAsignando(false)}
        />
      )}
    </div>
  );
}

// Clase CSS según el estado del equipo (los colores están en Inventory.css).
function claseEstado(estado?: string): string {
  if (esEstado(estado, ESTADOS.DISPONIBLE)) return "disponible";
  if (esEstado(estado, ESTADOS.PRESTADO, ESTADOS.SIN_ENTREGAR)) return "prestado";
  if (esEstado(estado, ESTADOS.NO_RESPONDE)) return "falta";
  return "otro";
}
