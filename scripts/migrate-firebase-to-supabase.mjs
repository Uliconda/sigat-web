import { randomBytes } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of requiredEnv) {
  if (!process.env[name]) throw new Error(`Falta la variable de entorno ${name}.`);
}

const firebaseApp = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
const sourceAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const sendPasswordResets = process.argv.includes("--send-password-resets");
const resetRedirect = process.env.SUPABASE_PASSWORD_RESET_REDIRECT;

if (sendPasswordResets && !resetRedirect) {
  throw new Error(
    "Define SUPABASE_PASSWORD_RESET_REDIRECT con una URL permitida en Supabase antes de enviar restablecimientos."
  );
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    if (typeof value.path === "string" && typeof value.isEqual === "function") {
      return value.path;
    }
    if (typeof value.latitude === "number" && typeof value.longitude === "number") {
      return { latitude: value.latitude, longitude: value.longitude };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item)])
    );
  }
  return value;
}

async function getExistingAuthUsers() {
  const usersByEmail = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user);
    }
    if (!data.nextPage) return usersByEmail;
    page = data.nextPage;
  }
}

async function getExistingProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, firebase_uid, email, must_change_password, temporary_password_issued_at");
  if (error) throw error;
  return {
    byFirebaseUid: new Map(data.map((profile) => [profile.firebase_uid, profile])),
    byEmail: new Map(data.map((profile) => [profile.email.toLowerCase(), profile])),
  };
}

async function upsertInBatches(table, rows, conflict) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(offset, offset + 500), { onConflict: conflict });
    if (error) throw error;
  }
}

const profileSnapshots = await firestore.collection("Usuarios").get();
const existingUsers = await getExistingAuthUsers();
const existingProfiles = await getExistingProfiles();
const profiles = [];
const resetEmails = new Set();
let createdUsers = 0;

for (const snapshot of profileSnapshots.docs) {
  const firebaseUid = snapshot.id;
  const sourceProfile = normalizeValue(snapshot.data());
  let sourceUser = null;
  try {
    sourceUser = await sourceAuth.getUser(firebaseUid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }

  const email = String(sourceProfile.email ?? sourceUser?.email ?? "").trim().toLowerCase();
  const nombre = String(sourceProfile.nombre ?? sourceUser?.displayName ?? "").trim();
  const rol = sourceProfile.rol;
  if (!email || !nombre || !["usuario", "admin", "superadmin"].includes(rol)) {
    throw new Error(`El perfil Firebase "${firebaseUid}" carece de email, nombre o rol válido.`);
  }

  const linkedProfile = existingProfiles.byFirebaseUid.get(firebaseUid);
  const profileWithEmail = existingProfiles.byEmail.get(email);
  if (profileWithEmail && profileWithEmail.firebase_uid !== firebaseUid) {
    throw new Error(
      `El correo ${email} ya está vinculado a otro UID Firebase en Supabase. Revisa ese perfil antes de continuar.`
    );
  }

  let targetUser = existingUsers.get(email);
  if (linkedProfile) {
    const { data, error } = await supabase.auth.admin.getUserById(linkedProfile.id);
    if (error || !data.user) {
      throw new Error(`No se encontró la cuenta Supabase vinculada a ${firebaseUid}.`);
    }
    targetUser = data.user;
    if (targetUser.email?.toLowerCase() !== email) {
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
        targetUser.id,
        { email, email_confirm: true }
      );
      if (updateError || !updated.user) {
        throw new Error(`No se pudo actualizar el correo de ${email}: ${updateError?.message ?? "sin respuesta"}`);
      }
      targetUser = updated.user;
    }
  }
  if (!targetUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { nombre, rol, firebase_uid: firebaseUid },
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear la cuenta ${email}: ${error?.message ?? "sin respuesta"}`);
    }
    targetUser = data.user;
    existingUsers.set(email, targetUser);
    createdUsers += 1;
  }
  if (targetUser.email) existingUsers.set(targetUser.email.toLowerCase(), targetUser);

  const createdAt = sourceProfile.createdAt;
  profiles.push({
    id: targetUser.id,
    firebase_uid: firebaseUid,
    nombre,
    email,
    rol,
    must_change_password: existingProfiles.byFirebaseUid.get(firebaseUid)?.must_change_password ?? false,
    temporary_password_issued_at: existingProfiles.byFirebaseUid.get(firebaseUid)?.temporary_password_issued_at ?? null,
    ...(typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt))
      ? { created_at: new Date(createdAt).toISOString() }
      : {}),
  });
  existingProfiles.byFirebaseUid.set(firebaseUid, {
    id: targetUser.id,
    firebase_uid: firebaseUid,
    email,
    must_change_password: existingProfiles.byFirebaseUid.get(firebaseUid)?.must_change_password ?? false,
    temporary_password_issued_at: existingProfiles.byFirebaseUid.get(firebaseUid)?.temporary_password_issued_at ?? null,
  });
  existingProfiles.byEmail.set(email, {
    id: targetUser.id,
    firebase_uid: firebaseUid,
    email,
    must_change_password: existingProfiles.byFirebaseUid.get(firebaseUid)?.must_change_password ?? false,
    temporary_password_issued_at: existingProfiles.byFirebaseUid.get(firebaseUid)?.temporary_password_issued_at ?? null,
  });
  resetEmails.add(email);
}

const equipmentSnapshots = await firestore.collection("Equipos").get();
const equipmentRows = equipmentSnapshots.docs.map((snapshot) => ({
  id: snapshot.id,
  data: normalizeValue(snapshot.data()),
}));

const historySnapshots = await firestore.collection("Historial").get();
const historyRows = historySnapshots.docs.map((snapshot) => {
  const data = normalizeValue(snapshot.data());
  const parsedDate = data.fecha ? new Date(data.fecha) : null;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    throw new Error(`El movimiento "${snapshot.id}" tiene una fecha que no se puede convertir.`);
  }
  return {
    id: snapshot.id,
    data,
    fecha: parsedDate?.toISOString() ?? null,
  };
});

await upsertInBatches("equipos", equipmentRows, "id");
await upsertInBatches("historial", historyRows, "id");
await upsertInBatches("profiles", profiles, "firebase_uid");

if (sendPasswordResets) {
  for (const email of resetEmails) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirect,
    });
    if (error) throw new Error(`No se pudo enviar el restablecimiento a ${email}: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

console.log(
  JSON.stringify(
    {
      equipos: equipmentRows.length,
      historial: historyRows.length,
      perfiles: profiles.length,
      cuentasNuevas: createdUsers,
      restablecimientosSolicitados: sendPasswordResets ? resetEmails.size : 0,
    },
    null,
    2
  )
);
