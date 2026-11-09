// Reporte PDF del inventario: un apartado por categoría y dentro cada
// subcategoría con sus equipos (ordenados por sección e ID).
import { ESTADOS, esEstado } from "../constants/estados";
import type { Equipo } from "../types";
import { areasInventario, describirSeleccion, equiposParaReporte, seccionDe } from "./areasInventario";
import { cargarPdf, encabezado, fechaArchivo, MARGEN, NARANJA, numerarPaginas, paraArchivo, tituloApartado } from "./pdf";

const poseedorDe = (equipo: Equipo) =>
  equipo.alumno_nombre || (esEstado(equipo.estado, ESTADOS.DISPONIBLE) || !equipo.estado ? "En almacén" : "Sin asignar");

const nombreArchivo = (claves: string[]) => {
  const parte =
    claves.length === 0
      ? "Completo"
      : claves.length <= 2
        ? paraArchivo(claves.join("_").replace(/\|/g, "_"))
        : `${claves.length}_areas`;
  return `Inventario_${parte}_${fechaArchivo()}.pdf`;
};

/** Genera y descarga el PDF. Devuelve cuántos equipos incluyó (0 = no se generó). */
export async function descargarReporteInventario(equipos: Equipo[], claves: string[]): Promise<number> {
  const grupos = equiposParaReporte(equipos, claves);
  const total = grupos.reduce((suma, g) => suma + g.subcategorias.reduce((n, s) => n + s.equipos.length, 0), 0);
  if (total === 0) return 0;

  const { doc, autoTable, finDeTabla } = await cargarPdf("landscape");
  let y = encabezado(
    doc,
    claves.length === 0 ? "Estado Actual del Inventario - SIGAT (Completo)" : "Reporte de Inventario - SIGAT",
    describirSeleccion(areasInventario(equipos), claves),
    `${total} equipo${total === 1 ? "" : "s"}`
  );

  for (const { categoria, subcategorias } of grupos) {
    const enCategoria = subcategorias.reduce((n, s) => n + s.equipos.length, 0);
    y = tituloApartado(doc, `${categoria} (${enCategoria})`, y, { tamano: 13 });
    y += 7;

    for (const { nombre, equipos: lista } of subcategorias) {
      y = tituloApartado(doc, `${categoria} > ${nombre} (${lista.length})`, y, { tamano: 10, gris: true });
      autoTable(doc, {
        startY: y + 3,
        head: [["ID", "Nombre / Modelo", "No. Serie", "Sección", "Estado", "Condición", "Último usuario", "Poseedor"]],
        body: lista.map((e) =>
          [
            e.id,
            e.nombre || "Sin nombre",
            e.no_serie || "---",
            seccionDe(e) || "---",
            e.estado || "---",
            e.condicion_fisica || "---",
            e.usuarioActual || "---",
            poseedorDe(e),
          ].map((valor) => String(valor))
        ),
        theme: "grid",
        headStyles: { fillColor: NARANJA, textColor: "#fff" },
        styles: { fontSize: 7.5, overflow: "linebreak" },
        columnStyles: { 0: { cellWidth: 22 }, 7: { cellWidth: 50 } },
        margin: { left: MARGEN, right: MARGEN },
      });
      y = finDeTabla() + 8;
    }
    y += 2;
  }

  numerarPaginas(doc);
  doc.save(nombreArchivo(claves));
  return total;
}
