// Estados de un equipo. Son los mismos que usa la app móvil
// (SigatRN/src/constants/estados.ts) y los únicos que acepta la base de datos
// (restricción equipos_estado_valido).
export const ESTADOS = Object.freeze({
  DISPONIBLE: "Disponible",
  PRESTADO: "Prestado",
  SIN_ENTREGAR: "Sin entregar",
  NO_RESPONDE: "No responde",
  FUERA_DE_SERVICIO: "Fuera de Servicio",
} as const);

export type Estado = (typeof ESTADOS)[keyof typeof ESTADOS];

const normalizar = (estado: unknown): string => String(estado ?? "").trim().toUpperCase();

// ¿El estado coincide con alguno de los valores? Ignora mayúsculas y espacios,
// porque hay datos antiguos guardados como "PRESTADO".
export function esEstado(estado: string | null | undefined, ...valores: Estado[]): boolean {
  const actual = normalizar(estado);
  return valores.some((valor) => normalizar(valor) === actual);
}

// Alguien tiene el equipo (incluye las faltas).
export const estaFuera = (estado: string | null | undefined): boolean =>
  esEstado(estado, ESTADOS.PRESTADO, ESTADOS.SIN_ENTREGAR, ESTADOS.NO_RESPONDE);
