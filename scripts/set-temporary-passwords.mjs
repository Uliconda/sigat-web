import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) throw new Error(`Falta la variable de entorno ${name}.`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: profiles, error: profilesError } = await supabase
  .from("profiles")
  .select("id, email")
  .not("firebase_uid", "is", null)
  .is("temporary_password_issued_at", null)
  .order("email");

if (profilesError) throw profilesError;
if (profiles.length === 0) {
  console.log("No hay perfiles importados pendientes de contraseña temporal. No se cambió ninguna cuenta.");
  process.exit(0);
}

console.log("Contraseñas temporales (entrégalas individualmente por un canal privado):");
for (const profile of profiles) {
  const temporaryPassword = randomBytes(24).toString("base64url");
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
  if (authError || !authData.user) {
    throw new Error(`No se pudo cargar la cuenta ${profile.email}: ${authError?.message ?? "sin respuesta"}`);
  }

  const { error: updateAuthError } = await supabase.auth.admin.updateUserById(profile.id, {
    password: temporaryPassword,
  });
  if (updateAuthError) {
    throw new Error(`No se pudo establecer la contraseña de ${profile.email}: ${updateAuthError.message}`);
  }

  const { data, error: updateProfileError } = await supabase
    .from("profiles")
    .update({
      must_change_password: true,
      temporary_password_issued_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .is("temporary_password_issued_at", null)
    .select("id")
    .maybeSingle();

  if (updateProfileError || !data) {
    throw new Error(
      `La contraseña de ${profile.email} se actualizó, pero no se pudo activar el cambio obligatorio. ` +
      `No compartas esa contraseña hasta corregirlo. ${updateProfileError?.message ?? ""}`
    );
  }

  console.log(`${profile.email}\t${temporaryPassword}`);
}

console.log(
  "\nCopia cada contraseña directamente a su destinatario por separado. No guardes esta salida en el repositorio."
);
