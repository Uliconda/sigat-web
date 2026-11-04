// Prueba el esquema de SIGAT en PostgreSQL 16 real (PGlite, sin instalar nada).
// Simula las piezas propias de Supabase: auth.uid(), roles y la publicación de Realtime.
// Uso: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../migrations/20261020000000_initial_schema.sql", import.meta.url));
const schema = readFileSync(schemaPath, "utf8");
const db = new PGlite();

const ids = {
  superadmin: "00000000-0000-0000-0000-000000000001",
  admin: "00000000-0000-0000-0000-000000000002",
  usuario: "00000000-0000-0000-0000-000000000003",
};

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name} ${detail}`);
  }
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
async function as(role) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ids[role] ?? ""]);
}
async function expectError(name, sql, params, pattern) {
  try {
    await db.query(sql, params);
    check(name, false, "(no lanzó error)");
  } catch (error) {
    check(name, pattern.test(error.message), `(mensaje: ${error.message})`);
  }
}
async function carpetaId(...ruta) {
  let parent = null;
  let id = null;
  for (const nombre of ruta) {
    const [row] = await rows(`select id from public.carpetas where parent_id is not distinct from $1 and nombre = $2`, [parent, nombre]);
    id = row?.id ?? null;
    parent = id;
  }
  return id;
}

// --- Piezas de Supabase que el esquema necesita ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  create publication supabase_realtime;
`);

console.log("1. Esquema sobre una base vacía");
await db.exec(schema);
check("se aplica sin errores", true);

// Datos como los de una instalación anterior: estados en mayúsculas y una plantilla.
for (const [rol, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users values ($1)`, [id]);
  await db.query(`insert into public.profiles (id, nombre, email, rol) values ($1, $2, $3, $4)`, [id, `Cuenta ${rol}`, `${rol}@sigat.mx`, rol]);
}
await db.exec(`alter table public.equipos disable trigger equipos_sync_carpetas`);
for (const [id, data] of [
  ["EQ-001", { nombre: "Laptop Dell", categoria: "Cómputo", subcategoria: "Laptops", subSubcategoria: "Dell", estado: "PRESTADO" }],
  ["EQ-002", { nombre: "Laptop HP", categoria: "CÓMPUTO", subcategoria: "laptops ", subSubcategoria: "HP", estado: "DISPONIBLE" }],
  ["EQ-003", { nombre: "Proyector", categoria: "Audiovisual", estado: "Fuera de Servicio" }],
  ["MOB-1", { nombre: "Plantilla Sistema", categoria: "CÓMPUTO", subcategoria: "MONITORES", subSubcategoria: "GENERAL", estado: "SISTEMA", isTemplate: true }],
]) {
  await db.query(`insert into public.equipos (id, data) values ($1, $2)`, [id, data]);
}
await db.exec(`alter table public.equipos enable trigger equipos_sync_carpetas`);

console.log("2. Migración sobre datos existentes (volver a ejecutar el esquema)");
await db.exec(schema);
check("se aplica otra vez sin errores", true);
const rutas = (await rows(`
  select c1.nombre || '/' || c2.nombre || '/' || c3.nombre as ruta
  from public.carpetas c1
  join public.carpetas c2 on c2.parent_id = c1.id
  join public.carpetas c3 on c3.parent_id = c2.id
  order by 1`)).map((r) => r.ruta);
check("crea las carpetas de todos los equipos, normalizadas", JSON.stringify(rutas) === JSON.stringify([
  "AUDIOVISUAL/GENERAL/GENERAL", "CÓMPUTO/LAPTOPS/DELL", "CÓMPUTO/LAPTOPS/HP", "CÓMPUTO/MONITORES/GENERAL",
]), JSON.stringify(rutas));
check("elimina la plantilla y conserva su carpeta", (await rows(`select 1 from public.equipos where id = 'MOB-1'`)).length === 0);
const estados = Object.fromEntries((await rows(`select id, data->>'estado' as estado from public.equipos`)).map((r) => [r.id, r.estado]));
check("normaliza los estados históricos", estados["EQ-001"] === "Prestado" && estados["EQ-002"] === "Disponible", JSON.stringify(estados));

console.log("3. Idempotencia");
await db.exec(schema);
check("una tercera ejecución no duplica carpetas", (await rows(`select count(*)::int as n from public.carpetas`))[0].n === 9);

console.log("4. Trigger de carpetas");
await db.query(`insert into public.equipos (id, data) values ('EQ-004', '{"nombre":"Switch","categoria":"Redes","subcategoria":"Switches"}')`);
check("un equipo con carpeta nueva la crea sola", Boolean(await carpetaId("REDES", "SWITCHES", "GENERAL")));

console.log("5. Permisos de carpetas");
await as("usuario");
await expectError("un usuario normal no puede crear carpetas", `select public.crear_carpeta(null, 'X')`, [], /Solo un administrador/);
await expectError("un usuario normal no puede renombrar", `select public.renombrar_carpeta($1, 'X')`, [await carpetaId("CÓMPUTO")], /Solo un administrador/);

await as("admin");
console.log("6. Crear carpeta");
const computo = await carpetaId("CÓMPUTO");
await db.query(`select public.crear_carpeta($1, '  impresoras ')`, [computo]);
check("crea la subcategoría normalizada", Boolean(await carpetaId("CÓMPUTO", "IMPRESORAS")));
await expectError("no permite duplicados", `select public.crear_carpeta($1, 'Impresoras')`, [computo], /Ya existe/);
await expectError("no permite un cuarto nivel", `select public.crear_carpeta($1, 'X')`, [await carpetaId("CÓMPUTO", "LAPTOPS", "DELL")], /tres niveles/);

console.log("7. Renombrar carpeta");
await db.query(`select public.renombrar_carpeta($1, 'Portátiles')`, [await carpetaId("CÓMPUTO", "LAPTOPS")]);
const subs = (await rows(`select data->>'subcategoria' as sub from public.equipos where id in ('EQ-001','EQ-002') order by id`)).map((r) => r.sub);
check("actualiza la subcategoría de sus equipos", JSON.stringify(subs) === JSON.stringify(["PORTÁTILES", "PORTÁTILES"]), JSON.stringify(subs));
check("conserva las secciones dentro", Boolean(await carpetaId("CÓMPUTO", "PORTÁTILES", "HP")));
check("no deja la carpeta vieja", !(await carpetaId("CÓMPUTO", "LAPTOPS")));
await expectError("no permite renombrar a un nombre existente", `select public.renombrar_carpeta($1, 'MONITORES')`, [await carpetaId("CÓMPUTO", "PORTÁTILES")], /Ya existe/);
const otra = (await rows(`select data->>'subcategoria' as sub from public.equipos where id = 'EQ-004'`))[0].sub;
check("no toca equipos de otras categorías", otra === "Switches", otra);

console.log("8. Eliminar carpeta");
await db.query(`select public.eliminar_carpeta($1)`, [await carpetaId("CÓMPUTO", "PORTÁTILES", "DELL")]);
const seccion = (await rows(`select data->>'subSubcategoria' as s from public.equipos where id = 'EQ-001'`))[0].s;
check("sus equipos pasan a GENERAL", seccion === "GENERAL", seccion);
check("la carpeta desaparece", !(await carpetaId("CÓMPUTO", "PORTÁTILES", "DELL")));
check("se crea la ruta GENERAL que necesita el equipo", Boolean(await carpetaId("CÓMPUTO", "PORTÁTILES", "GENERAL")));
await expectError("GENERAL no se puede eliminar", `select public.eliminar_carpeta($1)`, [await carpetaId("AUDIOVISUAL", "GENERAL")], /GENERAL no se puede/);

console.log("9. Préstamos de un usuario normal (update_equipo)");
await as("usuario");
await db.query(`select public.update_equipo('EQ-002', '{"estado":"Prestado","alumno_nombre":"Ana"}')`);
check("puede prestar un equipo disponible", (await rows(`select data->>'estado' as e from public.equipos where id = 'EQ-002'`))[0].e === "Prestado");
await expectError("no puede editar otros campos", `select public.update_equipo('EQ-002', '{"nombre":"Otro"}')`, [], /No tienes permiso/);
await expectError("no puede dar de baja", `select public.update_equipo('EQ-002', '{"estado":"Fuera de Servicio"}')`, [], /administrador/);

console.log("10. Eliminar equipos (solo superadmin)");
await as("admin");
const eq3 = (await rows(`select data from public.equipos where id = 'EQ-003'`))[0].data;
await expectError("un admin no puede eliminar equipos", `select public.delete_equipo_if_unchanged('EQ-003', $1)`, [eq3], /superadministrador/);
await as("superadmin");
check("un superadmin sí puede", (await rows(`select public.delete_equipo_if_unchanged('EQ-003', $1) as ok`, [eq3]))[0].ok === true);

console.log("11. Historial con autor verificado");
await as("usuario");
await db.query(`insert into public.historial (id, data) values ('H-1', '{"accion":"PRÉSTAMO","admin":"Nombre Falso"}')`);
const h = (await rows(`select data from public.historial where id = 'H-1'`))[0].data;
check("reemplaza el nombre por el del perfil real", h.admin === "Cuenta usuario", h.admin);
check("guarda quién lo registró y cuándo", h.registrado_por === ids.usuario && Boolean(h.registrado_en));

console.log("12. next_equipo_id");
await expectError("un usuario normal no puede reservar IDs", `select public.next_equipo_id()`, [], /No autorizado/);
await as("admin");
const [{ id: siguiente }] = await rows(`select public.next_equipo_id() as id`);
check("continúa después del mayor EQ-XXX", siguiente === "EQ-005", siguiente);

console.log("13. Historial de cambios de carpetas");
const cambios = await rows(`
  select data from public.historial
  where data->>'tipo' = 'carpeta'
  order by (data->>'registrado_en')::timestamptz, id`);
const acciones = cambios.map((r) => r.data.accion);
check("registra crear, renombrar y eliminar", JSON.stringify(acciones) === JSON.stringify([
  "CARPETA CREADA", "CARPETA RENOMBRADA", "CARPETA ELIMINADA",
]), JSON.stringify(acciones));
const [creada, renombrada, eliminada] = cambios.map((r) => r.data);
check("la creación guarda la ruta completa", creada?.carpeta === "CÓMPUTO › IMPRESORAS", creada?.carpeta);
check("el renombre guarda la ruta anterior y los equipos afectados",
  renombrada?.carpeta === "CÓMPUTO › PORTÁTILES" && renombrada?.observaciones.includes("CÓMPUTO › LAPTOPS") && renombrada?.equiposAfectados === 2,
  JSON.stringify(renombrada));
check("la eliminación guarda cuántos equipos se reasignaron",
  eliminada?.carpeta === "CÓMPUTO › PORTÁTILES › DELL" && eliminada?.equiposAfectados === 1,
  JSON.stringify(eliminada));
check("el autor es la cuenta que hizo el cambio", cambios.every((r) => r.data.admin === "Cuenta admin"));
check("los intentos rechazados no dejan registro", cambios.length === 3);
check("incluye la fecha que usan los reportes de la web", cambios.every((r) => !Number.isNaN(Date.parse(r.data.fecha))));

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
