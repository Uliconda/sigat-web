import { supabase } from "../config/supabase";
import type {
  AccionNotificacion,
  Asignacion,
  Equipo,
  EquipoData,
  EquipoRow,
  Historial,
  HistorialData,
  HistorialRow,
  Perfil,
  PerfilRow,
  Personal,
  ResultadoNotificacion,
  Rol,
} from "../types";
import { errorDeFuncion } from "../utils/errores";
import { crearSuscripcionCompartida, type CambioTiempoReal, type OpcionesSuscripcion } from "./realtimeStore";

function throwIfError(error: unknown): void {
  if (error) throw error;
}

function mapRecord<Data extends object>(record: { id: string; data: Data }): Data & { id: string } {
  return { ...record.data, id: record.id };
}

type ConsultaTabla = ReturnType<ReturnType<typeof supabase.from>["select"]>;

interface OpcionesTabla<Fila, Salida> extends Omit<OpcionesSuscripcion<Fila, Salida>, "cargar" | "conectar"> {
  columnas?: string;
  filtrar?: (consulta: ConsultaTabla) => ConsultaTabla;
}

// Nombre único para cada canal de tiempo real. crypto.randomUUID solo existe en
// contextos seguros (HTTPS o localhost): al abrir la web por la IP de la red
// (http://192.168.x.x) no está disponible y el Dashboard quedaba en blanco.
let canalesCreados = 0;
function idCanal(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  canalesCreados += 1;
  return `${Date.now().toString(36)}-${canalesCreados}-${Math.random().toString(36).slice(2, 10)}`;
}

// Una suscripción compartida por tabla: una sola conexión y cambios incrementales.
function tablaEnTiempoReal<Fila extends object, Salida>(
  table: string,
  { columnas = "*", filtrar = (consulta) => consulta, ...opciones }: OpcionesTabla<Fila, Salida>
) {
  return crearSuscripcionCompartida<Fila, Salida>({
    ...opciones,
    cargar: async () => {
      const { data, error } = await filtrar(supabase.from(table).select(columnas));
      throwIfError(error);
      return (data ?? []) as unknown as Fila[];
    },
    conectar: (onCambio, onEstado) => {
      const channel = supabase
        .channel(`${table}-cambios-${idCanal()}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, (payload) =>
          onCambio(payload as unknown as CambioTiempoReal<Fila>)
        )
        .subscribe(onEstado);
      return () => void supabase.removeChannel(channel);
    },
  });
}

function mapProfile(profile: PerfilRow): Perfil {
  return {
    id: profile.id,
    firebase_uid: profile.firebase_uid,
    nombre: profile.nombre,
    email: profile.email,
    rol: profile.rol,
    must_change_password: profile.must_change_password,
    createdAt: profile.created_at,
  };
}

const COLUMNAS_PERFIL = "id, firebase_uid, nombre, email, rol, must_change_password, created_at";

// El Dashboard solo grafica la actividad reciente; así no descarga todo el historial.
export const DIAS_HISTORIAL_DASHBOARD = 90;
const inicioHistorial = () => new Date(Date.now() - DIAS_HISTORIAL_DASHBOARD * 24 * 60 * 60 * 1000);

export const subscribeToEquipos = tablaEnTiempoReal<EquipoRow, Equipo>("equipos", { mapear: mapRecord });

export const subscribeToHistorial = tablaEnTiempoReal<HistorialRow, Historial>("historial", {
  columnas: "id, fecha, data",
  filtrar: (consulta) => consulta.gte("fecha", inicioHistorial().toISOString()),
  incluir: (fila) => Boolean(fila.fecha) && new Date(fila.fecha as string) >= inicioHistorial(),
  mapear: mapRecord,
});

export const subscribeToProfiles = tablaEnTiempoReal<PerfilRow, Perfil>("profiles", {
  columnas: COLUMNAS_PERFIL,
  mapear: mapProfile,
});

// Personal administrativo y su historial de equipos (lo escriben la app móvil y
// los triggers de equipos; la web solo los consulta).
export const subscribeToPersonal = tablaEnTiempoReal<Personal, Personal>("personal_administrativo", {
  columnas: "id, nombre, departamento, fecha_ingreso, fecha_termino, conducta, conducta_notas",
});

export const subscribeToAsignaciones = tablaEnTiempoReal<Asignacion, Asignacion>("asignaciones_equipo", {
  columnas:
    "id, personal_id, equipo_id, equipo_nombre, fecha_inicio, fecha_fin, asignado_por, recibido_por, condicion_devolucion, observaciones, origen",
});

export async function getEquipos(): Promise<Equipo[]> {
  const { data, error } = await supabase.from("equipos").select("*");
  throwIfError(error);
  return ((data ?? []) as EquipoRow[]).map(mapRecord);
}

export async function getHistorial({ start, end }: { start?: Date; end?: Date } = {}): Promise<Historial[]> {
  let request = supabase.from("historial").select("id, fecha, data");

  if (start) request = request.gte("fecha", start.toISOString());
  if (end) request = request.lte("fecha", end.toISOString());

  const { data, error } = await request.order("fecha", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as HistorialRow[]).map(mapRecord);
}

// Movimientos de un solo equipo (más reciente primero), p. ej. su historial de mantenimiento.
export async function getHistorialEquipo(idEquipo: string): Promise<Historial[]> {
  const { data, error } = await supabase
    .from("historial")
    .select("id, fecha, data")
    .eq("data->>idEquipo", idEquipo)
    .order("fecha", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as HistorialRow[]).map(mapRecord);
}

export async function updateEquipo(id: string, changes: Partial<EquipoData>): Promise<void> {
  const { error } = await supabase.rpc("update_equipo", {
    p_id: id,
    p_changes: changes,
  });
  throwIfError(error);
}

export async function addHistorial(entry: HistorialData): Promise<void> {
  const parsedDate = entry.fecha ? new Date(entry.fecha) : null;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    throw new Error("La fecha del movimiento no es válida.");
  }

  const { error } = await supabase.from("historial").insert({
    data: entry,
    fecha: parsedDate?.toISOString() ?? null,
  });
  throwIfError(error);
}

export async function getProfile(id: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(COLUMNAS_PERFIL)
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  return data ? mapProfile(data as PerfilRow) : null;
}

export async function updateProfile(id: string, changes: { nombre?: string; rol?: Rol }): Promise<void> {
  const fields: { nombre?: string; rol?: Rol } = {};
  if (Object.hasOwn(changes, "nombre")) fields.nombre = changes.nombre;
  if (Object.hasOwn(changes, "rol")) fields.rol = changes.rol;

  const { data, error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwIfError(error);
  if (!data) throw new Error("El perfil no existe o no tienes permiso para editarlo.");
}

// Llama a la Edge Function de notificaciones (los correos se envían en el servidor).
export async function notificarPrestamo(action: AccionNotificacion, equipoId?: string): Promise<ResultadoNotificacion> {
  const { data, error } = await supabase.functions.invoke<ResultadoNotificacion>("notificaciones-prestamos", {
    body: { action, equipoId },
  });
  if (error) throw await errorDeFuncion(error);
  if (!data) throw new Error("La función no devolvió respuesta.");
  return data;
}

// Pide el correo de "restablecer contraseña". Lo envía la Edge Function
// recuperar-contrasena con EmailJS; el enlace regresa a esta misma página.
export async function solicitarRecuperacion(email: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ mensaje: string }>("recuperar-contrasena", {
    body: { email, redirectTo: window.location.origin },
  });
  if (error) throw await errorDeFuncion(error);
  return data?.mensaje ?? "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";
}
