import { supabase } from "../config/supabase";
import { errorDeFuncion } from "../utils/errores";
import { crearSuscripcionCompartida } from "./realtimeStore";

function throwIfError(error) {
  if (error) throw error;
}

function mapRecord(record) {
  return { ...record.data, id: record.id };
}

// Una suscripción compartida por tabla: una sola conexión y cambios incrementales.
function tablaEnTiempoReal(table, { columnas = "*", filtrar = (consulta) => consulta, ...opciones } = {}) {
  return crearSuscripcionCompartida({
    ...opciones,
    cargar: async () => {
      const { data, error } = await filtrar(supabase.from(table).select(columnas));
      throwIfError(error);
      return data;
    },
    conectar: (onCambio, onEstado) => {
      const channel = supabase
        .channel(`${table}-cambios-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, onCambio)
        .subscribe(onEstado);
      return () => void supabase.removeChannel(channel);
    },
  });
}

function mapProfile(profile) {
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

// El Dashboard solo grafica la actividad reciente; así no descarga todo el historial.
export const DIAS_HISTORIAL_DASHBOARD = 90;
const inicioHistorial = () => new Date(Date.now() - DIAS_HISTORIAL_DASHBOARD * 24 * 60 * 60 * 1000);

export const subscribeToEquipos = tablaEnTiempoReal("equipos", { mapear: mapRecord });

export const subscribeToHistorial = tablaEnTiempoReal("historial", {
  columnas: "id, fecha, data",
  filtrar: (consulta) => consulta.gte("fecha", inicioHistorial().toISOString()),
  incluir: (fila) => Boolean(fila.fecha) && new Date(fila.fecha) >= inicioHistorial(),
  mapear: mapRecord,
});

export const subscribeToProfiles = tablaEnTiempoReal("profiles", {
  columnas: "id, firebase_uid, nombre, email, rol, must_change_password, created_at",
  mapear: mapProfile,
});

export async function getEquipos() {
  const { data, error } = await supabase.from("equipos").select("*");
  throwIfError(error);
  return data.map(mapRecord);
}

export async function getHistorial({ start, end } = {}) {
  let request = supabase.from("historial").select("id, fecha, data");

  if (start) request = request.gte("fecha", start.toISOString());
  if (end) request = request.lte("fecha", end.toISOString());

  const { data, error } = await request.order("fecha", { ascending: false });
  throwIfError(error);
  return data.map(mapRecord);
}

export async function updateEquipo(id, changes) {
  const { error } = await supabase.rpc("update_equipo", {
    p_id: id,
    p_changes: changes,
  });
  throwIfError(error);
}

export async function addHistorial(entry) {
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

export async function getProfile(id) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, firebase_uid, nombre, email, rol, must_change_password, created_at")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return {
    id: data.id,
    firebase_uid: data.firebase_uid,
    nombre: data.nombre,
    email: data.email,
    rol: data.rol,
    must_change_password: data.must_change_password,
    createdAt: data.created_at,
  };
}

export async function updateProfile(id, changes) {
  const fields = {};
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
// action: "marcar-falta" | "reenviar-correo" | "revisar-vencidos"
export async function notificarPrestamo(action, equipoId) {
  const { data, error } = await supabase.functions.invoke("notificaciones-prestamos", {
    body: { action, equipoId },
  });
  if (error) throw await errorDeFuncion(error);
  return data;
}
