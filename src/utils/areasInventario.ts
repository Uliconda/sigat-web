// Áreas del inventario (categoría > subcategoría) para elegir qué entra en el
// reporte PDF. Funciones puras: las usan el diálogo y el generador del PDF.
import type { Equipo } from "../types";

export const GENERAL = "GENERAL";
export const SIN_CATEGORIA = "SIN CATEGORÍA";

const limpio = (valor: unknown) => String(valor ?? "").trim().toUpperCase();
export const categoriaDe = (equipo: Equipo) => limpio(equipo.categoria) || SIN_CATEGORIA;
export const subcategoriaDe = (equipo: Equipo) => limpio(equipo.subcategoria) || GENERAL;
export const seccionDe = (equipo: Equipo) => {
  const seccion = limpio(equipo.subSubcategoria);
  return seccion === GENERAL ? "" : seccion;
};

/** Clave de una subcategoría en la selección. */
export const claveArea = (categoria: string, subcategoria: string) => `${categoria}|${subcategoria}`;

const comparar = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
// Alfabético con GENERAL y SIN CATEGORÍA al final.
const compararAreas = (a: string, b: string) => {
  const peso = (x: string) => (x === GENERAL || x === SIN_CATEGORIA ? 1 : 0);
  return peso(a) - peso(b) || comparar(a, b);
};

export interface AreaInventario {
  categoria: string;
  cantidad: number;
  subcategorias: { nombre: string; clave: string; cantidad: number }[];
}

/** Categorías con sus subcategorías y cuántos equipos tiene cada una. */
export function areasInventario(equipos: Equipo[]): AreaInventario[] {
  const conteo = new Map<string, Map<string, number>>();
  for (const equipo of equipos) {
    const subs = conteo.get(categoriaDe(equipo)) ?? new Map<string, number>();
    subs.set(subcategoriaDe(equipo), (subs.get(subcategoriaDe(equipo)) ?? 0) + 1);
    conteo.set(categoriaDe(equipo), subs);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => compararAreas(a, b))
    .map(([categoria, subs]) => ({
      categoria,
      cantidad: [...subs.values()].reduce((suma, n) => suma + n, 0),
      subcategorias: [...subs.entries()]
        .sort(([a], [b]) => compararAreas(a, b))
        .map(([nombre, cantidad]) => ({ nombre, clave: claveArea(categoria, nombre), cantidad })),
    }));
}

export interface GrupoReporte {
  categoria: string;
  subcategorias: { nombre: string; equipos: Equipo[] }[];
}

/** Equipos de las subcategorías elegidas (vacío = todo), agrupados y ordenados por sección e ID. */
export function equiposParaReporte(equipos: Equipo[], claves: string[]): GrupoReporte[] {
  const elegidas = new Set(claves);
  const incluidos = equipos.filter(
    (e) => elegidas.size === 0 || elegidas.has(claveArea(categoriaDe(e), subcategoriaDe(e)))
  );
  return areasInventario(incluidos).map(({ categoria, subcategorias }) => ({
    categoria,
    subcategorias: subcategorias.map(({ nombre }) => ({
      nombre,
      equipos: incluidos
        .filter((e) => categoriaDe(e) === categoria && subcategoriaDe(e) === nombre)
        .sort((a, b) => comparar(seccionDe(a), seccionDe(b)) || comparar(a.id, b.id)),
    })),
  }));
}

/** Texto de las áreas elegidas: "CÓMPUTO (completo), MOBILIARIO > SILLAS". */
export function describirSeleccion(areas: AreaInventario[], claves: string[]): string {
  if (claves.length === 0) return "Todo el inventario";
  const elegidas = new Set(claves);
  return areas
    .flatMap(({ categoria, subcategorias }) => {
      const marcadas = subcategorias.filter((s) => elegidas.has(s.clave));
      if (marcadas.length === 0) return [];
      if (marcadas.length === subcategorias.length) return [`${categoria} (completo)`];
      return marcadas.map((s) => `${categoria} > ${s.nombre}`);
    })
    .join(", ");
}
