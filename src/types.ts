// Tipos del dominio SIGAT. Siguen los de la app móvil (SigatRN/src/types.ts).

export type Rol = "usuario" | "admin" | "superadmin";

/** Perfil SIGAT de una cuenta (tabla profiles). */
export interface Perfil {
  id: string;
  firebase_uid: string | null;
  nombre: string;
  email: string;
  rol: Rol;
  must_change_password: boolean;
  createdAt: string;
}

/** Fila de profiles tal como llega de Supabase. */
export interface PerfilRow {
  id: string;
  firebase_uid: string | null;
  nombre: string;
  email: string;
  rol: Rol;
  must_change_password: boolean;
  created_at: string;
}

/** Campos de un equipo; se guardan en la columna jsonb `data` de la tabla equipos. */
export interface EquipoData {
  nombre?: string;
  marca?: string;
  numeroSerie?: string;
  categoria?: string;
  subcategoria?: string;
  subSubcategoria?: string;
  estado?: string;
  condicion_fisica?: string;
  usuarioActual?: string;
  alumno_nombre?: string;
  alumno_matricula?: string;
  matricula?: string;
  poseedor_actual?: string;
  fecha_prestamo?: string;
  fecha_revision?: string;
  observacion_revision?: string;
  lastCheck?: string;
  alerta_enviada?: boolean;
  id_qr?: string;
  /** Equipos "Plantilla Sistema" de versiones anteriores; ya no se crean. */
  isTemplate?: boolean;
  [campo: string]: unknown;
}

export interface Equipo extends EquipoData {
  id: string;
}

/** Fila de equipos tal como llega de Supabase. */
export interface EquipoRow {
  id: string;
  data: EquipoData;
}

/** Movimiento del historial (préstamo, devolución, baja, carpeta, ...). */
export interface HistorialData {
  idEquipo?: string;
  nombreEquipo?: string;
  accion?: string;
  fecha?: string | Date | null;
  admin?: string;
  observaciones?: string;
  tipo?: string;
  carpeta?: string;
  equiposAfectados?: number;
  [campo: string]: unknown;
}

export interface Historial extends HistorialData {
  id: string;
}

export interface HistorialRow {
  id: string;
  fecha: string | null;
  data: HistorialData;
}

/** Respuesta de la Edge Function notificaciones-prestamos. */
export interface ResultadoNotificacion {
  correo: string;
}

export type AccionNotificacion = "marcar-falta" | "reenviar-correo" | "revisar-vencidos";
