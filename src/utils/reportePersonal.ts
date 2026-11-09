// Reporte PDF del Personal administrativo: un apartado por departamento con su
// personal en orden alfabético y, si se pide, el historial de equipos anteriores.
import type { Asignacion, Equipo, Personal } from "../types";
import { cargarPdf, encabezado, fechaArchivo, MARGEN, NARANJA, numerarPaginas, paraArchivo, tituloApartado } from "./pdf";
import {
  equiposDePersona,
  estaActivo,
  formatearFecha,
  formatearFechaHora,
  historialDePersona,
  type OpcionesReporte,
  seleccionarParaReporte,
} from "./personal";

const nombreArchivo = (departamentos: string[]) => {
  const parte =
    departamentos.length === 0
      ? "Completo"
      : departamentos.length <= 3
        ? paraArchivo(departamentos.join("_"))
        : `${departamentos.length}_areas`;
  return `Personal_Administrativo_${parte}_${fechaArchivo()}.pdf`;
};

/** Genera y descarga el PDF. Devuelve cuántas personas incluyó (0 = no se generó). */
export async function descargarReportePersonal(
  personal: Personal[],
  equipos: Equipo[],
  asignaciones: Asignacion[],
  opciones: OpcionesReporte
): Promise<number> {
  const grupos = seleccionarParaReporte(personal, opciones);
  const total = grupos.reduce((suma, g) => suma + g.personas.length, 0);
  if (total === 0) return 0;

  const { doc, autoTable, finDeTabla } = await cargarPdf();
  let y = encabezado(
    doc,
    "Reporte de Personal Administrativo - SIGAT",
    opciones.departamentos.length === 0 ? "Todas las áreas" : opciones.departamentos.join(", "),
    `${total} persona${total === 1 ? "" : "s"}${opciones.incluirBajas ? " (incluye personal que ya no labora)" : ""}`
  );

  for (const { departamento, personas } of grupos) {
    y = tituloApartado(doc, `${departamento.toUpperCase()} (${personas.length})`, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Nombre", "Ingreso", "Término", "Situación", "Conducta", "Equipo asignado actualmente"]],
      body: personas.map((p) => [
        p.nombre,
        formatearFecha(p.fecha_ingreso) || "---",
        formatearFecha(p.fecha_termino) || "---",
        estaActivo(p) ? "Laborando" : "Ya no labora",
        [p.conducta || "Sin evaluar", p.conducta_notas].filter(Boolean).join("\n"),
        equiposDePersona(equipos, p.id)
          .map((e) => `${e.id} - ${e.nombre || "Sin nombre"}${e.no_serie ? ` (S/N ${e.no_serie})` : ""}`)
          .join("\n") || "Sin equipo",
      ]),
      theme: "grid",
      headStyles: { fillColor: NARANJA, textColor: "#fff" },
      styles: { fontSize: 8, overflow: "linebreak", valign: "top" },
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 19 }, 2: { cellWidth: 19 }, 3: { cellWidth: 20 }, 4: { cellWidth: 28 } },
      margin: { left: MARGEN, right: MARGEN },
    });
    y = finDeTabla() + 6;

    if (!opciones.incluirHistorial) {
      y += 4;
      continue;
    }
    const filas = personas.flatMap((p) =>
      historialDePersona(asignaciones, p.id).map((a) => [
        p.nombre,
        `${a.equipo_id}${a.equipo_nombre ? ` - ${a.equipo_nombre}` : ""}`,
        formatearFechaHora(a.fecha_inicio),
        formatearFechaHora(a.fecha_fin),
        a.condicion_devolucion || "---",
      ])
    );
    y = tituloApartado(doc, `Historial de equipos anteriores - ${departamento}`, y, { tamano: 10, gris: true });
    if (filas.length === 0) {
      doc.setFontSize(9);
      doc.text("Sin equipos anteriores registrados.", MARGEN, y + 6);
      y += 14;
      continue;
    }
    autoTable(doc, {
      startY: y + 3,
      head: [["Persona", "Equipo", "Desde", "Hasta", "Devuelto en"]],
      body: filas,
      theme: "striped",
      headStyles: { fillColor: "#757575", textColor: "#fff" },
      styles: { fontSize: 7.5, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 38 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 }, 4: { cellWidth: 30 } },
      margin: { left: MARGEN, right: MARGEN },
    });
    y = finDeTabla() + 10;
  }

  numerarPaginas(doc);
  doc.save(nombreArchivo(opciones.departamentos));
  return total;
}
