// Notificaciones de préstamos de SIGAT. Envía los correos con EmailJS desde el
// servidor, así las claves nunca llegan al navegador.
//
// Acciones (POST JSON):
//   { action: "revisar-vencidos" }            → cron (x-cron-secret) o un admin
//   { action: "marcar-falta", equipoId }      → admin: marca "No responde" y avisa
//   { action: "reenviar-correo", equipoId }   → admin: vuelve a enviar el aviso
//
// Secretos: APP_ORIGIN, CRON_SECRET, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
// EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY. Opcionales: ALUMNOS_EMAIL_DOMAIN
// (cesba-queretaro.edu.mx), HORAS_LIMITE_PRESTAMO (48).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowedOrigins, getCorsHeaders, isOriginAllowed, jsonResponse } from "../_shared/cors.ts";

type Equipo = {
  id: string;
  nombre?: string;
  estado?: string;
  categoria?: string;
  id_qr?: string;
  matricula?: string;
  alumno_matricula?: string;
  alumno_nombre?: string;
  poseedor_actual?: string;
};

const env = (name: string) => Deno.env.get(name) ?? "";

// Compara secretos sin revelar por el tiempo de respuesta cuántos caracteres coinciden.
function secretosIguales(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Única regla para obtener el correo del alumno a partir del equipo.
export function correoDelAlumno(equipo: Equipo, dominio: string) {
  const matricula = String(
    equipo.matricula || equipo.alumno_matricula || (equipo.poseedor_actual ?? "").match(/\d+/)?.[0] || ""
  ).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(matricula)) return null;
  return `${matricula}@${dominio}`;
}

async function enviarCorreo(equipo: Equipo, correo: string) {
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: env("EMAILJS_SERVICE_ID"),
      template_id: env("EMAILJS_TEMPLATE_ID"),
      user_id: env("EMAILJS_PUBLIC_KEY"),
      accessToken: env("EMAILJS_PRIVATE_KEY"),
      template_params: {
        correo_destino: correo,
        nombre_alumno: equipo.poseedor_actual || equipo.alumno_nombre || "Alumno",
        nombre_equipo: equipo.nombre ?? "",
        id_equipo: equipo.id_qr || equipo.id,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`EmailJS respondió ${response.status}: ${await response.text()}`);
  }
}

async function registrarHistorial(
  client: SupabaseClient,
  equipo: Equipo,
  accion: string,
  admin: string,
  observaciones: string
) {
  const fecha = new Date().toISOString();
  const { error } = await client.from("historial").insert({
    fecha,
    data: { idEquipo: equipo.id, nombreEquipo: equipo.nombre, accion, fecha, admin, observaciones },
  });
  if (error) console.error(`No se pudo registrar "${accion}" de ${equipo.id}:`, error);
}

// Revisión automática: reclama los préstamos vencidos y envía un correo por cada uno.
async function revisarVencidos(admin: SupabaseClient, dominio: string) {
  const horas = Number(env("HORAS_LIMITE_PRESTAMO")) || 48;
  const { data, error } = await admin.rpc("reclamar_prestamos_vencidos", { p_horas: horas });
  if (error) throw error;

  const resultado = { revisados: data.length, enviados: 0, sinCorreo: 0, fallidos: 0 };
  for (const fila of data as { id: string; data: Record<string, unknown> }[]) {
    const equipo = { ...fila.data, id: fila.id } as Equipo;
    const correo = correoDelAlumno(equipo, dominio);

    if (!correo) {
      // Queda marcado como falta, pero sin correo: lo revisa un administrador.
      resultado.sinCorreo++;
      await registrarHistorial(admin, equipo, `FALTA AUTOMÁTICA (${horas} Hrs)`, "Sistema Automático",
        "No se envió correo: el préstamo no tiene matrícula registrada.");
      continue;
    }

    try {
      await enviarCorreo(equipo, correo);
      resultado.enviados++;
      await registrarHistorial(admin, equipo, `FALTA AUTOMÁTICA (${horas} Hrs)`, "Sistema Automático",
        `Correo enviado a: ${correo}`);
    } catch (sendError) {
      // Se libera para reintentarlo en la siguiente ejecución.
      resultado.fallidos++;
      console.error(`No se pudo avisar del equipo ${equipo.id}:`, sendError);
      const { error: liberarError } = await admin.rpc("liberar_alerta_prestamo", { p_id: equipo.id });
      if (liberarError) console.error(`No se pudo liberar ${equipo.id}:`, liberarError);
    }
  }
  return resultado;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  if (!allowedOrigins().length) {
    console.error("Falta configurar APP_ORIGIN.");
    return jsonResponse({ error: "La función no está configurada." }, 500, origin);
  }
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: "Origen no permitido." }, 403, origin);
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405, origin);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const faltantes = ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"]
    .filter((name) => !env(name));
  if (!supabaseUrl || !anonKey || !serviceRoleKey || faltantes.length) {
    console.error("Faltan secretos de la función:", faltantes.join(", ") || "variables de Supabase");
    return jsonResponse({ error: "La función no está configurada." }, 500, origin);
  }
  const dominio = env("ALUMNOS_EMAIL_DOMAIN") || "cesba-queretaro.edu.mx";
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { action?: string; equipoId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "El cuerpo de la solicitud no es JSON válido." }, 400, origin);
  }

  // --- Ejecución programada (pg_cron) ---
  const cronSecret = env("CRON_SECRET");
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader !== null) {
    if (!cronSecret || !secretosIguales(cronHeader, cronSecret)) {
      return jsonResponse({ error: "Secreto de cron inválido." }, 401, origin);
    }
    if (body.action !== "revisar-vencidos") {
      return jsonResponse({ error: "Acción no permitida para el cron." }, 400, origin);
    }
    try {
      return jsonResponse(await revisarVencidos(adminClient, dominio), 200, origin);
    } catch (error) {
      console.error("Error en la revisión automática:", error);
      return jsonResponse({ error: "No se pudo completar la revisión." }, 500, origin);
    }
  }

  // --- Acciones de un administrador con sesión ---
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Se requiere una sesión autenticada." }, 401, origin);
  }
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(
    authorization.slice("Bearer ".length)
  );
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "La sesión no es válida." }, 401, origin);
  }
  const { data: perfil, error: perfilError } = await adminClient
    .from("profiles")
    .select("nombre, rol, must_change_password")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (perfilError) {
    console.error("No se pudo verificar el rol:", perfilError);
    return jsonResponse({ error: "No se pudo verificar el rol." }, 500, origin);
  }
  if (!perfil || perfil.must_change_password || !["admin", "superadmin"].includes(perfil.rol)) {
    return jsonResponse({ error: "No tienes permisos para enviar notificaciones." }, 403, origin);
  }

  if (body.action === "revisar-vencidos") {
    try {
      return jsonResponse(await revisarVencidos(adminClient, dominio), 200, origin);
    } catch (error) {
      console.error("Error en la revisión manual:", error);
      return jsonResponse({ error: "No se pudo completar la revisión." }, 500, origin);
    }
  }

  if (body.action !== "marcar-falta" && body.action !== "reenviar-correo") {
    return jsonResponse({ error: "Acción no reconocida." }, 400, origin);
  }
  if (typeof body.equipoId !== "string" || !body.equipoId) {
    return jsonResponse({ error: "Falta el equipo." }, 400, origin);
  }

  // Lectura con la sesión del administrador: respeta sus permisos (RLS).
  const { data: fila, error: equipoError } = await callerClient
    .from("equipos")
    .select("id, data")
    .eq("id", body.equipoId)
    .maybeSingle();
  if (equipoError) {
    console.error("No se pudo leer el equipo:", equipoError);
    return jsonResponse({ error: "No se pudo leer el equipo." }, 500, origin);
  }
  if (!fila) return jsonResponse({ error: "El equipo no existe." }, 404, origin);

  const equipo = { ...fila.data, id: fila.id } as Equipo;
  const estado = (equipo.estado ?? "").toLowerCase();
  const correo = correoDelAlumno(equipo, dominio);
  if (!correo) {
    return jsonResponse({ error: "El préstamo no tiene una matrícula registrada; no se puede enviar el correo." }, 422, origin);
  }

  if (body.action === "marcar-falta") {
    if (estado !== "prestado") {
      return jsonResponse({ error: "Solo se puede marcar falta a un equipo prestado." }, 409, origin);
    }
    const { error: updateError } = await callerClient.rpc("update_equipo", {
      p_id: equipo.id,
      p_changes: { estado: "No responde", alerta_enviada: true },
    });
    if (updateError) {
      console.error("No se pudo marcar la falta:", updateError);
      return jsonResponse({ error: "No se pudo marcar la falta." }, 500, origin);
    }
    try {
      await enviarCorreo(equipo, correo);
    } catch (sendError) {
      console.error("No se pudo enviar el aviso:", sendError);
      // Se revierte para que el administrador pueda intentarlo de nuevo.
      await callerClient.rpc("update_equipo", {
        p_id: equipo.id,
        p_changes: { estado: "Prestado", alerta_enviada: false },
      });
      return jsonResponse({ error: "No se pudo enviar el correo. La falta no se registró." }, 502, origin);
    }
    await registrarHistorial(callerClient, equipo, "MARCA DE FALTA", perfil.nombre, `Correo enviado a: ${correo}`);
    return jsonResponse({ correo }, 200, origin);
  }

  // reenviar-correo
  if (estado !== "prestado" && estado !== "no responde") {
    return jsonResponse({ error: "El equipo no está prestado." }, 409, origin);
  }
  try {
    await enviarCorreo(equipo, correo);
  } catch (sendError) {
    console.error("No se pudo reenviar el aviso:", sendError);
    return jsonResponse({ error: "No se pudo enviar el correo." }, 502, origin);
  }
  await registrarHistorial(callerClient, equipo, "REENVÍO DE CORREO", perfil.nombre, `Reenvío manual a: ${correo}`);
  return jsonResponse({ correo }, 200, origin);
});
