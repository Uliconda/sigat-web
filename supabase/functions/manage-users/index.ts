import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(origin = "") {
  return {
    "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  const appOrigin = Deno.env.get("APP_ORIGIN");
  if (!appOrigin) {
    console.error("Falta configurar APP_ORIGIN.");
    return jsonResponse({ error: "La función no está configurada." }, 500, origin);
  }
  if (origin && origin !== appOrigin) {
    return jsonResponse({ error: "Origen no permitido." }, 403, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Se requiere una sesión autenticada." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.");
    return jsonResponse({ error: "La función no está configurada." }, 500, origin);
  }

  const token = authorization.slice("Bearer ".length);
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "La sesión no es válida." }, 401, origin);
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("rol, must_change_password")
    .eq("id", callerData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("No se pudo verificar el rol de la sesión:", profileError);
    return jsonResponse({ error: "No se pudo verificar el rol." }, 500, origin);
  }
  let body: {
    action?: string;
    email?: string;
    password?: string;
    newPassword?: string;
    nombre?: string;
    rol?: string;
    userId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "El cuerpo de la solicitud no es JSON válido." }, 400, origin);
  }

  if (body.action === "set-initial-password") {
    if (!callerProfile?.must_change_password) {
      return jsonResponse({ error: "Esta cuenta no requiere cambio inicial de contraseña." }, 409, origin);
    }
    if (!body.newPassword || body.newPassword.length < 12) {
      return jsonResponse({ error: "La nueva contraseña debe tener al menos 12 caracteres." }, 400, origin);
    }

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(
      callerData.user.id,
      { password: body.newPassword }
    );
    if (passwordError) {
      console.error("No se pudo establecer la contraseña inicial:", passwordError);
      return jsonResponse({ error: "No se pudo actualizar la contraseña." }, 400, origin);
    }

    const { data, error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", callerData.user.id)
      .eq("must_change_password", true)
      .select("id")
      .maybeSingle();
    if (profileUpdateError || !data) {
      console.error("La contraseña cambió, pero no se pudo quitar la marca de cambio inicial:", profileUpdateError);
      return jsonResponse(
        { error: "La contraseña cambió, pero no se pudo completar el proceso. Vuelve a intentarlo." },
        500,
        origin
      );
    }

    return jsonResponse({ success: true }, 200, origin);
  }

  if (!callerProfile || !["admin", "superadmin"].includes(callerProfile.rol)) {
    return jsonResponse({ error: "No tienes permisos para gestionar cuentas." }, 403, origin);
  }

  if (body.action === "create") {
    const email = body.email?.trim().toLowerCase();
    const nombre = body.nombre?.trim();
    const password = body.password;
    const rol = body.rol;

    if (!email || !nombre || !password || !rol || !["usuario", "admin", "superadmin"].includes(rol)) {
      return jsonResponse({ error: "Faltan datos válidos para crear la cuenta." }, 400, origin);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400, origin);
    }
    if (rol === "superadmin" && callerProfile.rol !== "superadmin") {
      return jsonResponse({ error: "Solo un superadministrador puede crear otro superadministrador." }, 403, origin);
    }
    if (rol === "admin" && callerProfile.rol !== "superadmin") {
      return jsonResponse({ error: "Solo un superadministrador puede crear administradores." }, 403, origin);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol },
    });
    if (createError || !created.user) {
      console.error("No se pudo crear la cuenta:", createError);
      return jsonResponse({ error: createError?.message ?? "No se pudo crear la cuenta." }, 400, origin);
    }

    const { error: insertError } = await adminClient.from("profiles").insert({
      id: created.user.id,
      nombre,
      email,
      rol,
    });
    if (insertError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (rollbackError) console.error("No se pudo revertir la cuenta sin perfil:", rollbackError);
      console.error("No se pudo guardar el perfil de la cuenta:", insertError);
      return jsonResponse({ error: "No se pudo guardar el perfil de la cuenta." }, 500, origin);
    }

    return jsonResponse({ userId: created.user.id }, 201, origin);
  }

  if (body.action === "delete") {
    if (!body.userId || body.userId === callerData.user.id) {
      return jsonResponse({ error: "No puedes eliminar tu propia cuenta." }, 400, origin);
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("rol")
      .eq("id", body.userId)
      .maybeSingle();

    if (targetError) {
      console.error("No se pudo verificar el perfil seleccionado:", targetError);
      return jsonResponse({ error: "No se pudo verificar la cuenta seleccionada." }, 500, origin);
    }
    if (!targetProfile) {
      return jsonResponse({ error: "La cuenta seleccionada no existe." }, 404, origin);
    }
    if (targetProfile.rol === "superadmin" && callerProfile.rol !== "superadmin") {
      return jsonResponse({ error: "Solo un superadministrador puede eliminar esa cuenta." }, 403, origin);
    }
    if (targetProfile.rol !== "usuario" && callerProfile.rol !== "superadmin") {
      return jsonResponse({ error: "Solo puedes eliminar cuentas de usuario normal." }, 403, origin);
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.userId);
    if (deleteError) {
      console.error("No se pudo eliminar la cuenta:", deleteError);
      return jsonResponse({ error: "No se pudo eliminar la cuenta." }, 500, origin);
    }

    return jsonResponse({ success: true }, 200, origin);
  }

  return jsonResponse({ error: "Acción no reconocida." }, 400, origin);
});
