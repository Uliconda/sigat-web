// Reporte PDF por edificio: resumen de equipos por estado y, después, cada
// edificio con sus espacios y equipos (con su departamento o área).
import { ESTADOS, esEstado } from "../constants/estados";
import type { Edificio, Equipo } from "../types";
import { cargarPdf, encabezado, fechaArchivo, MARGEN, NARANJA, numerarPaginas, paraArchivo, tituloApartado } from "./pdf";
import { areaDe, equiposPorUbicacion, esPrestamoVencido, resumenPorEdificio, SIN_AREA } from "./ubicacion";

const poseedorDe = (equipo: Equipo) =>
  equipo.alumno_nombre || (esEstado(equipo.estado, ESTADOS.DISPONIBLE) || !equipo.estado ? "En almacén" : "Sin asignar");

const nombreArchivo = (edificios: string[]) => {
  const parte = edificios.length === 0 ? "Todos" : edificios.length <= 2 ? paraArchivo(edificios.join("_")) : `${edificios.length}_edificios`;
  return `Inventario_por_edificio_${parte}_${fechaArchivo()}.pdf`;
};

/** Genera y descarga el PDF. `elegidos` vacío = todos los edificios. Devuelve cuántos equipos incluyó. */
export async function descargarReporteEdificio(equipos: Equipo[], catalogo: Edificio[], elegidos: string[]): Promise<number> {
  const grupos = equiposPorUbicacion(equipos, elegidos);
  const total = grupos.reduce((n, g) => n + g.espacios.reduce((m, s) => m + s.equipos.length, 0), 0);
  if (total === 0) return 0;

  const ahora = Date.now();
  const filtro = new Set(elegidos);
  const resumen = resumenPorEdificio(equipos, catalogo, ahora).filter((r) => (filtro.size === 0 ? r.total > 0 : filtro.has(r.edificio)));

  const { doc, autoTable, finDeTabla } = await cargarPdf("landscape");
  let y = encabezado(
    doc,
    "Inventario por Edificio - SIGAT",
    elegidos.length === 0 ? "Todos los edificios" : elegidos.join(", "),
    `${total} equipo${total === 1 ? "" : "s"}`
  );

  y = tituloApartado(doc, "Resumen", y, { tamano: 13 });
  const suma = (campo: "total" | "disponibles" | "prestados" | "vencidos" | "fueraDeServicio") =>
    resumen.reduce((n, r) => n + r[campo], 0);
  autoTable(doc, {
    startY: y + 3,
    head: [["Edificio", "Equipos", "Disponibles", "Prestados", "Vencidos (+48 h)", "Fuera de servicio"]],
    body: resumen.map((r) => [r.edificio, r.total, r.disponibles, r.prestados, r.vencidos, r.fueraDeServicio].map(String)),
    foot: [["Total", suma("total"), suma("disponibles"), suma("prestados"), suma("vencidos"), suma("fueraDeServicio")].map(String)],
    theme: "grid",
    headStyles: { fillColor: NARANJA, textColor: "#fff" },
    footStyles: { fillColor: "#eeeeee", textColor: "#000", fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: MARGEN, right: MARGEN },
  });
  y = finDeTabla() + 12;

  for (const { edificio, espacios } of grupos) {
    const enEdificio = espacios.reduce((n, s) => n + s.equipos.length, 0);
    // Cada edificio empieza en una hoja nueva para poder imprimirlos por separado.
    doc.addPage();
    y = tituloApartado(doc, `${edificio} (${enEdificio})`, 18, { tamano: 13 });
    y += 7;

    for (const { espacio, equipos: lista } of espacios) {
      y = tituloApartado(doc, `${edificio} › ${espacio} (${lista.length})`, y, { tamano: 10, gris: true });
      autoTable(doc, {
        startY: y + 3,
        head: [["ID", "Nombre / Modelo", "Depto. / Área", "Categoría", "No. Serie", "Estado", "Condición", "Poseedor"]],
        body: lista.map((e) =>
          [
            e.id,
            e.nombre || "Sin nombre",
            areaDe(e) === SIN_AREA ? "---" : areaDe(e),
            [e.categoria, e.subcategoria].filter(Boolean).join(" › ") || "---",
            e.no_serie || "---",
            `${e.estado || "---"}${esPrestamoVencido(e, ahora) ? " (vencido)" : ""}`,
            e.condicion_fisica || "---",
            poseedorDe(e),
          ].map(String)
        ),
        theme: "grid",
        headStyles: { fillColor: NARANJA, textColor: "#fff" },
        styles: { fontSize: 7.5, overflow: "linebreak" },
        columnStyles: { 0: { cellWidth: 22 }, 7: { cellWidth: 45 } },
        margin: { left: MARGEN, right: MARGEN },
      });
      y = finDeTabla() + 8;
    }
  }

  numerarPaginas(doc);
  doc.save(nombreArchivo(elegidos));
  return total;
}
