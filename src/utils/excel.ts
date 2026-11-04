// Genera y descarga un archivo .xlsx con una o varias hojas.
// SheetJS se carga solo al exportar para no aumentar la carga inicial de la app.

export type FilaExcel = Record<string, unknown>;

export interface HojaExcel {
  nombre: string;
  filas: FilaExcel[];
}

export async function descargarExcel(nombreArchivo: string, hojas: HojaExcel[]): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  for (const { nombre, filas } of hojas) {
    if (!filas.length) continue;
    const sheet = XLSX.utils.json_to_sheet(filas);
    const columnas = Object.keys(filas[0]);

    // Ancho según el contenido más largo, con un tope razonable.
    sheet["!cols"] = columnas.map((key) => ({
      wch: Math.min(
        60,
        Math.max(key.length, ...filas.map((fila) => String(fila[key] ?? "").length)) + 2
      ),
    }));
    // Filtros en el encabezado.
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };

    XLSX.utils.book_append_sheet(workbook, sheet, nombre);
  }

  XLSX.writeFile(workbook, nombreArchivo, { compression: true });
}
