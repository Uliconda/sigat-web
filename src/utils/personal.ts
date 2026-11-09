// Funciones puras del Personal administrativo (las usa la página y el reporte PDF).
// Siguen las de la app móvil (SigatRN/src/utils/personal.ts).
import type { Asignacion, Equipo, Personal } from "../types";

export const SIN_DEPARTAMENTO = "Sin departamento";

/** Fecha local de hoy en formato AAAA-MM-DD. */
export function hoyISO(ahora = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/** Sigue laborando si no tiene fecha de término o si es hoy o posterior. */
export const estaActivo = (persona: Pick<Personal, "fecha_termino">, hoy = hoyISO()): boolean =>
  !persona.fecha_termino || persona.fecha_termino >= hoy;

/** "2026-03-15" → "15/03/2026". */
export function formatearFecha(iso?: string | null): string {
  if (!iso) return "";
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso;
}

/** Timestamp → "15/03/2026" en hora local. */
export function formatearFechaHora(iso?: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : formatearFecha(hoyISO(fecha));
}

export const departamentoDe = (persona: Pick<Personal, "departamento">): string =>
  persona.departamento?.trim() || SIN_DEPARTAMENTO;

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const compararNombres = (a: string, b: string) => a.localeCompare(b, "es");

/** Busca por nombre o departamento sin distinguir mayúsculas ni acentos; todas las palabras deben coincidir. */
export function buscarPersonal<T extends Pick<Personal, "nombre" | "departamento">>(lista: T[], texto: string): T[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  return lista.filter((persona) => {
    const contenido = normalizar(`${persona.nombre} ${persona.departamento ?? ""}`);
    return palabras.every((palabra) => contenido.includes(palabra));
  });
}

/** Departamentos presentes en la lista: alfabético y "Sin departamento" al final. */
export function departamentosDe(lista: Pick<Personal, "departamento">[]): string[] {
  return [...new Set(lista.map(departamentoDe))].sort((a, b) =>
    a === SIN_DEPARTAMENTO ? 1 : b === SIN_DEPARTAMENTO ? -1 : compararNombres(a, b)
  );
}

/** Agrupa por departamento (mismo orden que departamentosDe) y dentro por nombre. */
export function agruparPorDepartamento<T extends Pick<Personal, "nombre" | "departamento">>(
  lista: T[]
): { departamento: string; personas: T[] }[] {
  return departamentosDe(lista).map((departamento) => ({
    departamento,
    personas: lista
      .filter((persona) => departamentoDe(persona) === departamento)
      .sort((a, b) => compararNombres(a.nombre, b.nombre)),
  }));
}

/** Equipos que la persona tiene ahora según el inventario. */
export const equiposDePersona = (equipos: Equipo[], personalId: string): Equipo[] =>
  equipos.filter((equipo) => equipo.personal_id === personalId).sort((a, b) => a.id.localeCompare(b.id));

/** Equipos que tuvo antes (asignaciones cerradas), del más reciente al más antiguo. */
export const historialDePersona = (asignaciones: Asignacion[], personalId: string): Asignacion[] =>
  asignaciones
    .filter((a) => a.personal_id === personalId && a.fecha_fin)
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));

export interface OpcionesReporte {
  /** Departamentos a incluir; vacío = todos. */
  departamentos: string[];
  incluirBajas: boolean;
  incluirHistorial: boolean;
}

/** Personal que entra en el reporte, ya agrupado por departamento. */
export function seleccionarParaReporte<T extends Pick<Personal, "nombre" | "departamento" | "fecha_termino">>(
  lista: T[],
  { departamentos, incluirBajas }: Pick<OpcionesReporte, "departamentos" | "incluirBajas">,
  hoy = hoyISO()
) {
  const elegidos = new Set(departamentos);
  return agruparPorDepartamento(
    lista.filter(
      (persona) =>
        (elegidos.size === 0 || elegidos.has(departamentoDe(persona))) && (incluirBajas || estaActivo(persona, hoy))
    )
  );
}
