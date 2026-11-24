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
  /** Número de serie (así lo guarda la app móvil). */
  no_serie?: string;
  categoria?: string;
  subcategoria?: string;
  subSubcategoria?: string;
  /** Ubicación (catálogo edificios › espacios › áreas). null = sin edificio / espacio / área. */
  edificio?: string | null;
  espacio?: string | null;
  /** Departamento o área dentro del espacio. */
  area?: string | null;
  estado?: string;
  condicion_fisica?: string;
  usuarioActual?: string;
  alumno_nombre?: string;
  alumno_matricula?: string;
  matricula?: string;
  poseedor_actual?: string;
  /** Persona de personal_administrativo que tiene el equipo (null = nadie). */
  personal_id?: string | null;
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

/** Conducta respecto al uso del equipo (restricción en Supabase). */
export type Conducta = "Excelente" | "Buena" | "Regular" | "Mala";

/** Fila de personal_administrativo. Fechas en formato AAAA-MM-DD. */
export interface Personal {
  id: string;
  nombre: string;
  departamento: string | null;
  fecha_ingreso: string | null;
  fecha_termino: string | null;
  conducta: Conducta | null;
  conducta_notas: string | null;
}

/** Fila de asignaciones_equipo (fecha_fin null = la persona aún lo tiene). */
export interface Asignacion {
  id: string;
  personal_id: string;
  equipo_id: string;
  equipo_nombre: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  asignado_por: string | null;
  recibido_por: string | null;
  condicion_devolucion: string | null;
  observaciones: string | null;
  origen: string;
}

/** Fila de edificios (catálogo de ubicaciones). */
export interface Edificio {
  id: string;
  nombre: string;
}

/** Fila de espacios (aula, oficina, laboratorio...) dentro de un edificio. */
export interface Espacio {
  id: string;
  edificio_id: string;
  nombre: string;
}

/** Fila de áreas: departamento o área dentro de un espacio. */
export interface Area {
  id: string;
  espacio_id: string;
  nombre: string;
}
