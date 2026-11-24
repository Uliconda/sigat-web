// src/pages/Reportes.tsx — todos los reportes en un solo lugar: bitácora en
// Excel, inventario por categoría y por edificio (PDF), personal (PDF) y la
// base para etiquetas P-Touch. Arriba, los conteos por edificio sin descargar nada.
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { DialogoReporteEdificio } from "../components/DialogoReporteEdificio";
import { DialogoReporteInventario } from "../components/DialogoReporteInventario";
import { DialogoReportePersonal } from "../components/DialogoReportePersonal";
import Sidebar from "../components/Sidebar";
import {
  getHistorial,
  subscribeToAsignaciones,
  subscribeToEdificios,
  subscribeToEquipos,
  subscribeToPersonal,
} from "../services/supabaseData";
import type { Asignacion, Edificio, Equipo, Personal } from "../types";
import { mensajeDeError } from "../utils/errores";
import { descargarExcel } from "../utils/excel";
import { describirUbicacion, resumenPorEdificio } from "../utils/ubicacion";
import "./Reportes.css";

type Dialogo = "inventario" | "edificio" | "personal" | null;

const esPlantilla = (e: Equipo) => Boolean(e.isTemplate) || e.nombre?.toLowerCase() === "plantilla sistema";

export default function Reportes() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [periodo, setPeriodo] = useState<"all" | "rango">("all");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");

  useEffect(() => {
    const alFallar = (origen: string) => (e: unknown) => console.error(`Error al cargar ${origen}:`, e);
    const cerrar = [
      subscribeToEquipos(setEquipos, alFallar("equipos")),
      subscribeToEdificios(setEdificios, alFallar("edificios")),
      subscribeToPersonal(setPersonal, alFallar("personal")),
      subscribeToAsignaciones(setAsignaciones, alFallar("asignaciones")),
    ];
    return () => cerrar.forEach((fn) => fn());
  }, []);

  const reales = useMemo(() => equipos.filter((e) => !esPlantilla(e)), [equipos]);
  const resumen = useMemo(() => resumenPorEdificio(reales, edificios), [reales, edificios]);
  const totales = resumen.reduce(
    (t, r) => ({
      total: t.total + r.total,
      disponibles: t.disponibles + r.disponibles,
      prestados: t.prestados + r.prestados,
      vencidos: t.vencidos + r.vencidos,
      fuera: t.fuera + r.fueraDeServicio,
    }),
    { total: 0, disponibles: 0, prestados: 0, vencidos: 0, fuera: 0 }
  );

  // ==========================================
  // BITÁCORA DE MOVIMIENTOS (EXCEL) CON EL ESTADO DE CADA MOMENTO
  // ==========================================
  const descargarBitacora = async () => {
    try {
      let nombreArchivo = `Reporte_SIGAT_Completo_${new Date().toLocaleDateString("es-MX").replace(/\//g, "-")}.xlsx`;
      let start: Date | undefined;
      let end: Date | undefined;

      if (periodo !== "all") {
        if (!inicio || !fin) {
          void Swal.fire("Faltan datos", "Selecciona la fecha de inicio y de fin para generar el reporte.", "warning");
          return;
        }
        start = new Date(inicio);
        start.setHours(0, 0, 0, 0);
        end = new Date(fin);
        end.setHours(23, 59, 59, 999);
        if (start > end) {
          void Swal.fire("Error en las fechas", "La fecha de inicio no puede ser mayor a la fecha de fin.", "error");
          return;
        }
        nombreArchivo = `Reporte_SIGAT_${inicio}_al_${fin}.xlsx`;
      }

      void Swal.fire({ title: "Generando...", text: "Obteniendo datos de la nube", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const historial = await getHistorial({ start, end });
      if (historial.length === 0) {
        void Swal.fire("Sin datos", "No hay movimientos registrados en este rango de fechas.", "info");
        return;
      }

      // Los cambios de carpetas y de edificios (crear, renombrar, eliminar, asignar) van en su propia hoja.
      const esCambioDeOrganizacion = (tipo: unknown) => tipo === "carpeta" || tipo === "edificio";
      const movimientos = historial.filter((d) => !esCambioDeOrganizacion(d.tipo));
      const cambios = historial.filter((d) => esCambioDeOrganizacion(d.tipo));
      const porId = new Map(equipos.map((e) => [e.id, e]));

      const filasHistorial = movimientos.map((data) => {
        const equipo = data.idEquipo ? porId.get(data.idEquipo) : undefined;
        const accion = data.accion ? data.accion.toUpperCase() : "";
        const obs = data.observaciones ? data.observaciones.toUpperCase() : "";

        // Estado y condición que tenía el equipo en ESE movimiento.
        let estado = "DISPONIBLE";
        let condicion = "Buen estado";
        if (accion === "PRÉSTAMO") {
          estado = "PRESTADO";
          condicion = equipo?.condicion_fisica || "Buen estado";
        } else if (accion === "BAJA") {
          estado = "FUERA DE SERVICIO";
          condicion = "Reemplazar / Averiado";
        } else if (accion === "REACTIVACIÓN") {
          condicion = "Buen estado (Reparado)";
        } else if (accion === "DEVOLUCIÓN") {
          // La app móvil guarda la condición física en las observaciones.
          if (obs.includes("ACEPTABLE")) condicion = "Aceptable";
          else if (obs.includes("REEMPLAZAR")) condicion = "Reemplazar";
        }

        return {
          "Fecha y Hora": data.fecha ? new Date(data.fecha).toLocaleString("es-MX") : "Sin fecha",
          "ID Equipo": data.idEquipo,
          "Nombre Equipo": data.nombreEquipo,
          "Categoría": equipo?.categoria || "---",
          "Subcategoría": equipo?.subcategoria || "---",
          "Tipo (Sub-Sub)": equipo?.subSubcategoria || "---",
          "Ubicación actual": (equipo && describirUbicacion(equipo)) || "---",
          "Estado en ese Movimiento": estado,
          "Condición Física en el registro": condicion,
          "Acción efectuada": data.accion,
          "Administrador": data.admin,
          "Observaciones del movimiento": data.observaciones,
        };
      });

      const filasCambios = cambios.map((data) => ({
        "Fecha y Hora": data.fecha ? new Date(data.fecha).toLocaleString("es-MX") : "Sin fecha",
        "Tipo": data.tipo === "edificio" ? "Edificio / espacio" : "Carpeta",
        "Acción efectuada": data.accion,
        "Carpeta o ubicación": data.carpeta,
        "Equipos afectados": data.equiposAfectados ?? 0,
        "Administrador": data.admin,
        "Observaciones": data.observaciones,
      }));

      await descargarExcel(nombreArchivo, [
        { nombre: "Historial", filas: filasHistorial },
        { nombre: "Carpetas y edificios", filas: filasCambios },
      ]);
      void Swal.fire("¡Descarga lista!", "El archivo Excel se ha generado correctamente.", "success");
    } catch (error) {
      console.error("Error al generar Excel:", error);
      void Swal.fire("No se pudo generar el Excel", mensajeDeError(error), "error");
    }
  };

  // ==========================================
  // BASE PARA ETIQUETAS P-TOUCH (CSV)
  // ==========================================
  const descargarPTouch = () => {
    const limpiar = (valor: unknown) => String(valor || "---").replace(/,/g, "");
    const filas = [...reales]
      .sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }))
      .map((e) => [e.id, limpiar(e.nombre), limpiar(e.no_serie), limpiar(describirUbicacion(e)), e.id].join(","));
    const csv = ["ID,Nombre_Equipo,No_Serie,Ubicacion,Datos_QR", ...filas].join("\n") + "\n";
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "Inventario_Etiquetas_PTouch.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    void Swal.fire("Exportado", "Archivo CSV generado para P-Touch Editor", "success");
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <header className="pagina-encabezado">
          <div>
            <h1 className="pagina-titulo">Reportes</h1>
            <p className="pagina-subtitulo">Conteos al momento y todos los reportes para descargar</p>
          </div>
        </header>

        <section className="reportes-conteos" aria-label="Conteos rápidos">
          {[
            { texto: "Equipos", valor: totales.total, tono: "" },
            { texto: "Disponibles", valor: totales.disponibles, tono: "exito" },
            { texto: "Prestados", valor: totales.prestados, tono: "aviso" },
            { texto: "Préstamos vencidos (+48 h)", valor: totales.vencidos, tono: "peligro" },
            { texto: "Fuera de servicio", valor: totales.fuera, tono: "neutro" },
          ].map((c) => (
            <div key={c.texto} className={`tarjeta reportes-conteo${c.tono ? ` reportes-conteo--${c.tono}` : ""}`}>
              <strong>{c.valor.toLocaleString("es-MX")}</strong>
              <span>{c.texto}</span>
            </div>
          ))}
        </section>

        <section className="tabla-tarjeta reportes-tabla" aria-label="Equipos por edificio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Edificio</th>
                <th className="centrado">Equipos</th>
                <th className="centrado">Disponibles</th>
                <th className="centrado">Prestados</th>
                <th className="centrado">Vencidos</th>
                <th className="centrado">Fuera de servicio</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.edificio}>
                  <td className="negrita">{r.edificio}</td>
                  <td className="centrado">{r.total}</td>
                  <td className="centrado">{r.disponibles}</td>
                  <td className="centrado">{r.prestados}</td>
                  <td className="centrado">{r.vencidos > 0 ? <span className="etiqueta etiqueta--peligro">{r.vencidos}</span> : 0}</td>
                  <td className="centrado">{r.fueraDeServicio}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resumen.length === 0 && <div className="tabla-vacia">Aún no hay equipos registrados.</div>}
        </section>

        <section className="reportes-grid">
          <article className="tarjeta reportes-item">
            <h2>📄 Inventario por edificio</h2>
            <p className="reporte-tenue">Resumen por estado y cada edificio con sus espacios y equipos (PDF).</p>
            <button type="button" className="boton-pdf" onClick={() => setDialogo("edificio")} disabled={reales.length === 0}>
              Generar PDF
            </button>
          </article>

          <article className="tarjeta reportes-item">
            <h2>📄 Inventario por categoría</h2>
            <p className="reporte-tenue">Categorías y subcategorías completas o las que elijas (PDF).</p>
            <button type="button" className="boton-pdf" onClick={() => setDialogo("inventario")} disabled={reales.length === 0}>
              Generar PDF
            </button>
          </article>

          <article className="tarjeta reportes-item">
            <h2>📊 Bitácora de movimientos</h2>
            <p className="reporte-tenue">Préstamos, devoluciones, bajas y cambios de carpetas y edificios (Excel).</p>
            <div className="reportes-fechas">
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as "all" | "rango")} aria-label="Periodo del reporte">
                <option value="all">Todo el historial</option>
                <option value="rango">Elegir fechas...</option>
              </select>
              {periodo === "rango" && (
                <>
                  <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Fecha de inicio" />
                  <span>a</span>
                  <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} aria-label="Fecha de fin" />
                </>
              )}
            </div>
            <button type="button" className="btn btn--primario reportes-excel" onClick={descargarBitacora}>
              {periodo === "all" ? "Descargar todo" : "Descargar rango"}
            </button>
          </article>

          <article className="tarjeta reportes-item">
            <h2>📄 Personal administrativo</h2>
            <p className="reporte-tenue">Equipo asignado e historial por departamento (PDF).</p>
            <button type="button" className="boton-pdf" onClick={() => setDialogo("personal")} disabled={personal.length === 0}>
              Generar PDF
            </button>
          </article>

          <article className="tarjeta reportes-item">
            <h2>🖨️ Etiquetas P-Touch</h2>
            <p className="reporte-tenue">ID, nombre, serie y ubicación de cada equipo para P-Touch Editor (CSV).</p>
            <button type="button" className="btn btn--secundario" onClick={descargarPTouch} disabled={reales.length === 0}>
              Exportar CSV
            </button>
          </article>
        </section>
      </main>

      {dialogo === "inventario" && <DialogoReporteInventario equipos={reales} busqueda="" onCerrar={() => setDialogo(null)} />}
      {dialogo === "edificio" && <DialogoReporteEdificio equipos={reales} edificios={edificios} onCerrar={() => setDialogo(null)} />}
      {dialogo === "personal" && (
        <DialogoReportePersonal personal={personal} equipos={equipos} asignaciones={asignaciones} onCerrar={() => setDialogo(null)} />
      )}
    </div>
  );
}
