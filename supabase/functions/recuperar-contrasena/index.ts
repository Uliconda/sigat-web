// Restablecimiento de contraseñas de SIGAT.
//
// Genera el enlace oficial de recuperación de Supabase Auth y lo envía con
// EmailJS (los correos de Supabase saldrían del modo de prueba de Resend, que
// solo entrega al dueño de la cuenta).
//
// POST { email, redirectTo? }
//   · Pública: la usa quien olvidó su contraseña desde el inicio de sesión.
//   · Responde siempre lo mismo exista o no la cuenta, para no revelar qué
//     correos están registrados. Solo un administrador con sesión ve el error
//     real (lo usa la pantalla Usuarios).
//   · Límites por correo e IP en la tabla solicitudes_recuperacion.
//
// Secretos: APP_ORIGIN, EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY,
// EMAILJS_PRIVATE_KEY, EMAILJS_TEMPLATE_RECUPERACION.
// Opcional: VIGENCIA_ENLACE (texto para el correo, por defecto "1 hora").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowedOrigins, getCorsHeaders, isOriginAllowed, jsonResponse } from "../_shared/cors.ts";
import { enviarConEmailjs, faltanSecretosEmailjs } from "../_shared/emailjs.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESPUESTA_GENERICA = {
  mensaje: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
};

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
  const faltantes = faltanSecretosEmailjs(["EMAILJS_TEMPLATE_RECUPERACION"]);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || faltantes.length) {
    console.error("Faltan secretos de la función:", faltantes.join(", ") || "variables de Supabase");
    return jsonResponse({ error: "La función no está configurada." }, 500, origin);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { email?: unknown; redirectTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "El cuerpo de la solicitud no es JSON válido." }, 400, origin);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!CORREO_VALIDO.test(email) || email.length > 254) {
    return jsonResponse({ error: "Escribe un correo electrónico válido." }, 400, origin);
  }

  // El enlace solo puede regresar a un origen permitido de la app.
  const pedido = typeof body.redirectTo === "string" ? body.redirectTo.replace(/\/+$/, "") : "";
  const redirectTo = allowedOrigins().includes(pedido) ? pedido : allowedOrigins()[0];

  // ¿Lo pide un administrador con sesión? Entonces puede ver el error real.
  let esAdmin = false;
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await caller.auth.getUser(authorization.slice("Bearer ".length));
    if (data.user) {
      const { data: perfil } = await admin
        .from("profiles")
        .select("rol, must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();
      esAdmin = Boolean(perfil && !perfil.must_change_password && ["admin", "superadmin"].includes(perfil.rol));
    }
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { data: permitido, error: limiteError } = await admin.rpc("registrar_solicitud_recuperacion", {
    p_email: email,
    p_ip: esAdmin ? null : ip,
  });
  if (limiteError) {
    console.error("No se pudo registrar la solicitud:", limiteError);
    return jsonResponse({ error: "No se pudo procesar la solicitud. Inténtalo más tarde." }, 500, origin);
  }
  if (!permitido) {
    return jsonResponse(
      { error: "Ya se envió un enlace hace poco. Espera un minuto y revisa tu bandeja de entrada y spam." },
      429,
      origin
    );
  }

  const { data: enlace, error: enlaceError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (enlaceError || !enlace?.properties?.action_link) {
    // Lo normal aquí es que el correo no tenga cuenta: se responde igual que si existiera.
    console.warn("No se generó enlace de recuperación:", enlaceError?.message);
    return esAdmin
      ? jsonResponse({ error: "Ese correo no tiene una cuenta en SIGAT." }, 404, origin)
      : jsonResponse(RESPUESTA_GENERICA, 200, origin);
  }

  const { data: nombre } = await admin.rpc("nombre_para_recuperacion", { p_email: email });
  try {
    await enviarConEmailjs(env("EMAILJS_TEMPLATE_RECUPERACION"), {
      correo_destino: email,
      nombre_usuario: typeof nombre === "string" && nombre ? nombre : "usuario",
      enlace: enlace.properties.action_link,
      vigencia: env("VIGENCIA_ENLACE") || "1 hora",
    });
  } catch (error) {
    console.error("No se pudo enviar el correo de recuperación:", error);
    return esAdmin
      ? jsonResponse({ error: "No se pudo enviar el correo. Inténtalo de nuevo." }, 502, origin)
      : jsonResponse(RESPUESTA_GENERICA, 200, origin);
  }

  return jsonResponse(RESPUESTA_GENERICA, 200, origin);
});
