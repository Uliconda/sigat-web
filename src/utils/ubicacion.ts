// Ubicación de los equipos (Edificio › Espacio › Área): conteos para el inventario y
// el reporte por edificio. Mismas reglas que la app (SigatRN/src/utils/ubicacion.ts)
// y que las migraciones 20261119000000_edificios.sql y 20261119120000_areas.sql.
import { ESTADOS, esEstado, estaFuera } from "../constants/estados.ts";
import type { Edificio, Equipo } from "../types";

export const SIN_EDIFICIO = "SIN EDIFICIO";
export const SIN_ESPACIO = "SIN ESPACIO";
export const SIN_AREA = "SIN ÁREA";
/** Igual que reclamar_prestamos_vencidos() en Supabase. */
export const HORAS_VENCIMIENTO = 48;
const CATEGORIA_SIN_VENCIMIENTO = "ADMINISTRATIVOS";
const MS_HORA = 60 * 60 * 1000;

export function normalizarUbicacion(nombre: unknown): string | null {
  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return limpio || null;
}

export const edificioDe = (equipo: Pick<Equipo, "edificio">): string => normalizarUbicacion(equipo.edificio) ?? SIN_EDIFICIO;
export const espacioDe = (equipo: Pick<Equipo, "edificio" | "espacio">): string =>
  (normalizarUbicacion(equipo.edificio) && normalizarUbicacion(equipo.espacio)) || SIN_ESPACIO;
/** Sin espacio no hay área (misma regla que el servidor). */
export const areaDe = (equipo: Pick<Equipo, "edificio" | "espacio" | "area">): string =>
  (normalizarUbicacion(equipo.edificio) && normalizarUbicacion(equipo.espacio) && normalizarUbicacion(equipo.area)) || SIN_AREA;

/** "EDIFICIO A › AULA 3 › CONTABILIDAD", "EDIFICIO A › AULA 3", "EDIFICIO A" o "" si no tiene. */
export function describirUbicacion(equipo: Pick<Equipo, "edificio" | "espacio" | "area">): string {
  const edificio = normalizarUbicacion(equipo.edificio);
  if (!edificio) return "";
  const espacio = normalizarUbicacion(equipo.espacio);
  if (!espacio) return edificio;
  const area = normalizarUbicacion(equipo.area);
  return area ? `${edificio} › ${espacio} › ${area}` : `${edificio} › ${espacio}`;
}

const comparar = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
/** Alfabético con "SIN EDIFICIO" / "SIN ESPACIO" / "SIN ÁREA" al final. */
export const compararUbicaciones = (a: string, b: string) => {
  const peso = (x: string) => (x === SIN_EDIFICIO || x === SIN_ESPACIO || x === SIN_AREA ? 1 : 0);
  return peso(a) - peso(b) || comparar(a, b);
};

function fechaPrestamo(valor: unknown): Date | null {
  if (!valor) return null;
  let fecha: Date;
  if (typeof valor === "object") {
    const segundos = (valor as { seconds?: number }).seconds ?? (valor as { _seconds?: number })._seconds;
    if (typeof segundos !== "number") return null;
    fecha = new Date(segundos * 1000);
  } else {
    fecha = new Date(String(valor));
  }
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Vencido = "No responde", o "Prestado" hace más de 48 h (salvo ADMINISTRATIVOS). */
export function esPrestamoVencido(equipo: Equipo, ahora: number = Date.now()): boolean {
  if (esEstado(equipo.estado, ESTADOS.NO_RESPONDE)) return true;
  if (!esEstado(equipo.estado, ESTADOS.PRESTADO)) return false;
  if (String(equipo.categoria ?? "").trim().toUpperCase() === CATEGORIA_SIN_VENCIMIENTO) return false;
  const fecha = fechaPrestamo(equipo.fecha_prestamo);
  return Boolean(fecha && ahora - fecha.getTime() >= HORAS_VENCIMIENTO * MS_HORA);
}

export interface ResumenEdificio {
  edificio: string;
  total: number;
  disponibles: number;
  prestados: number;
  vencidos: number;
  fueraDeServicio: number;
}

const resumenVacio = (edificio: string): ResumenEdificio => ({
  edificio,
  total: 0,
  disponibles: 0,
  prestados: 0,
  vencidos: 0,
  fueraDeServicio: 0,
});

/** Equipos por edificio y estado. Incluye los edificios vacíos del catálogo y,
 * si hay, "SIN EDIFICIO" al final. "Prestados" incluye los vencidos. */
export function resumenPorEdificio(
  equipos: Equipo[],
  edificios: Pick<Edificio, "nombre">[] = [],
  ahora: number = Date.now()
): ResumenEdificio[] {
  const resumen = new Map<string, ResumenEdificio>(edificios.map((e) => [e.nombre, resumenVacio(e.nombre)]));
  for (const equipo of equipos) {
    if (equipo.isTemplate) continue;
    const nombre = edificioDe(equipo);
    const fila = resumen.get(nombre) ?? resumenVacio(nombre);
    fila.total += 1;
    if (!equipo.estado || esEstado(equipo.estado, ESTADOS.DISPONIBLE)) fila.disponibles += 1;
    if (estaFuera(equipo.estado)) fila.prestados += 1;
    if (esPrestamoVencido(equipo, ahora)) fila.vencidos += 1;
    if (esEstado(equipo.estado, ESTADOS.FUERA_DE_SERVICIO)) fila.fueraDeServicio += 1;
    resumen.set(nombre, fila);
  }
  return [...resumen.values()].sort((a, b) => compararUbicaciones(a.edificio, b.edificio));
}

export interface GrupoEdificio {
  edificio: string;
  espacios: { espacio: string; equipos: Equipo[] }[];
}

/** Equipos de los edificios elegidos (vacío = todos) agrupados por espacio y ordenados por área e ID. */
export function equiposPorUbicacion(equipos: Equipo[], edificios: string[] = []): GrupoEdificio[] {
  const elegidos = new Set(edificios);
  const grupos = new Map<string, Map<string, Equipo[]>>();
  for (const equipo of equipos) {
    if (equipo.isTemplate) continue;
    const edificio = edificioDe(equipo);
    if (elegidos.size > 0 && !elegidos.has(edificio)) continue;
    const espacios = grupos.get(edificio) ?? new Map<string, Equipo[]>();
    const espacio = espacioDe(equipo);
    espacios.set(espacio, [...(espacios.get(espacio) ?? []), equipo]);
    grupos.set(edificio, espacios);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => compararUbicaciones(a, b))
    .map(([edificio, espacios]) => ({
      edificio,
      espacios: [...espacios.entries()]
        .sort(([a], [b]) => compararUbicaciones(a, b))
        .map(([espacio, lista]) => ({
          espacio,
          // Dentro del espacio, agrupados por área y luego por ID.
          equipos: [...lista].sort((x, y) => compararUbicaciones(areaDe(x), areaDe(y)) || comparar(x.id, y.id)),
        })),
    }));
}
