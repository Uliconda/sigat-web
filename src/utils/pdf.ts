// Piezas comunes de los reportes PDF (inventario y personal administrativo).
import type { jsPDF } from "jspdf";

export const NARANJA = "#ff6600";
export const MARGEN = 14;

/** Carga jsPDF solo al generar un reporte, para no aumentar la carga inicial. */
export async function cargarPdf(orientacion: "portrait" | "landscape" = "portrait") {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPDF(orientacion);
  // Altura donde terminó la última tabla.
  const finDeTabla = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;
  return { doc, autoTable, finDeTabla };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Fecha local AAAA-MM-DD (para nombres de archivo). */
export const fechaArchivo = (ahora = new Date()) =>
  `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;

/** Título, áreas incluidas y fecha de generación. Devuelve la altura donde sigue el contenido. */
export function encabezado(doc: jsPDF, titulo: string, areas: string, resumen: string): number {
  const ahora = new Date();
  doc.setFontSize(16);
  doc.text(titulo, MARGEN, 16);
  doc.setFontSize(10);
  doc.setTextColor(90);
  const lineas = doc.splitTextToSize(`Áreas: ${areas}`, doc.internal.pageSize.getWidth() - MARGEN * 2) as string[];
  doc.text(lineas, MARGEN, 23);
  const y = 23 + lineas.length * 5;
  const fecha = `${dosDigitos(ahora.getDate())}/${dosDigitos(ahora.getMonth() + 1)}/${ahora.getFullYear()}`;
  const hora = ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  doc.text(`Generado el ${fecha} a las ${hora} · ${resumen}`, MARGEN, y);
  doc.setTextColor(0);
  return y + 8;
}

/** Título de un apartado; si no cabe con algo de contenido, pasa a la hoja siguiente. */
export function tituloApartado(doc: jsPDF, texto: string, y: number, { tamano = 12, gris = false } = {}): number {
  let posicion = y;
  if (posicion > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    posicion = 18;
  }
  doc.setFontSize(tamano);
  doc.setFont("helvetica", gris ? "normal" : "bold");
  if (gris) doc.setTextColor(90);
  doc.text(texto, MARGEN, posicion);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  return posicion;
}

/** "Página X de Y" en cada hoja. */
export function numerarPaginas(doc: jsPDF): void {
  const paginas = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.text(`Página ${pagina} de ${paginas}`, ancho - MARGEN, alto - 8, { align: "right" });
  }
}

/** Texto apto para nombre de archivo: sin acentos ni símbolos. */
export const paraArchivo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "");
