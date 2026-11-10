// Regla única de mantenimiento preventivo. La usan el aviso flotante del menú
// (Sidebar) y la pantalla de Mantenimiento, para que el número del aviso
// coincida siempre con los equipos marcados como "Urgente".
import type { EquipoData } from "../types";

/** Días sin revisión a partir de los cuales el mantenimiento es urgente. */
export const DIAS_URGENTE = 90;
/** Días a partir de los cuales conviene ir programando la revisión. */
export const DIAS_PROXIMO = 60;

const MS_DIA = 24 * 60 * 60 * 1000;

export type NivelMantenimiento = "urgente" | "proximo" | "al-dia" | "sin-revision";

export interface EstadoMantenimiento {
  nivel: NivelMantenimiento;
  etiqueta: string;
  /** Días desde la última revisión (null si nunca se ha revisado). */
  dias: number | null;
  /** Fecha en que vence (o venció) la siguiente revisión. */
  proximaRevision: Date | null;
}

export const NIVELES: { nivel: NivelMantenimiento; etiqueta: string }[] = [
  { nivel: "urgente", etiqueta: "Urgente" },
  { nivel: "proximo", etiqueta: "Próximo" },
  { nivel: "al-dia", etiqueta: "Al día" },
  { nivel: "sin-revision", etiqueta: "Sin revisión" },
];

const ETIQUETAS = Object.fromEntries(NIVELES.map((n) => [n.nivel, n.etiqueta])) as Record<NivelMantenimiento, string>;

/** Fecha de la última revisión (los equipos antiguos la guardaban en "lastCheck"). */
export function fechaUltimaRevision(equipo: EquipoData): Date | null {
  const valor = equipo.fecha_revision || equipo.lastCheck;
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function estadoMantenimiento(equipo: EquipoData, ahora: number = Date.now()): EstadoMantenimiento {
  const fecha = fechaUltimaRevision(equipo);
  if (!fecha) {
    return { nivel: "sin-revision", etiqueta: ETIQUETAS["sin-revision"], dias: null, proximaRevision: null };
  }

  const dias = Math.max(0, Math.floor((ahora - fecha.getTime()) / MS_DIA));
  const nivel: NivelMantenimiento = dias > DIAS_URGENTE ? "urgente" : dias > DIAS_PROXIMO ? "proximo" : "al-dia";
  return {
    nivel,
    etiqueta: ETIQUETAS[nivel],
    dias,
    proximaRevision: new Date(fecha.getTime() + DIAS_URGENTE * MS_DIA),
  };
}

export const esUrgente = (equipo: EquipoData, ahora?: number): boolean =>
  estadoMantenimiento(equipo, ahora).nivel === "urgente";

// Orden de la tabla: primero lo urgente y, dentro de cada grupo, lo más atrasado.
const PRIORIDAD: Record<NivelMantenimiento, number> = { urgente: 0, "sin-revision": 1, proximo: 2, "al-dia": 3 };

export function compararPorPrioridad(a: EstadoMantenimiento, b: EstadoMantenimiento): number {
  return PRIORIDAD[a.nivel] - PRIORIDAD[b.nivel] || (b.dias ?? 0) - (a.dias ?? 0);
}
