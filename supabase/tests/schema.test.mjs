// Prueba el esquema de SIGAT en PostgreSQL 16 real (PGlite, sin instalar nada).
// Simula las piezas propias de Supabase: auth.uid(), roles y la publicación de Realtime.
// Uso: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Todas las migraciones, en orden, como las aplicaría Supabase.
const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));
const schema = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n");
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
  create role service_role;
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
// Simula una instalación anterior: sin carpetas automáticas ni estados fijos.
await db.exec(`
  alter table public.equipos disable trigger equipos_sync_carpetas;
  alter table public.equipos disable trigger equipos_a_preparar_estado;
  alter table public.equipos drop constraint equipos_estado_valido;
`);
for (const [id, data] of [
  ["EQ-001", { nombre: "Laptop Dell", categoria: "Cómputo", subcategoria: "Laptops", subSubcategoria: "Dell", estado: "PRESTADO" }],
  ["EQ-002", { nombre: "Laptop HP", categoria: "CÓMPUTO", subcategoria: "laptops ", subSubcategoria: "HP", estado: "DISPONIBLE" }],
  ["EQ-003", { nombre: "Proyector", categoria: "Audiovisual", estado: "Fuera de Servicio" }],
  ["MOB-1", { nombre: "Plantilla Sistema", categoria: "CÓMPUTO", subcategoria: "MONITORES", subSubcategoria: "GENERAL", estado: "SISTEMA", isTemplate: true }],
]) {
  await db.query(`insert into public.equipos (id, data) values ($1, $2)`, [id, data]);
}
await db.exec(`
  alter table public.equipos enable trigger equipos_sync_carpetas;
  alter table public.equipos enable trigger equipos_a_preparar_estado;
`);

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

console.log("14. Alertas de préstamos vencidos");
await as("");
const haceHoras = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
for (const [id, data] of [
  ["AL-1", { nombre: "Vencido", categoria: "Cómputo", estado: "Prestado", fecha_prestamo: haceHoras(50) }],
  ["AL-2", { nombre: "Reciente", categoria: "Cómputo", estado: "Prestado", fecha_prestamo: haceHoras(10) }],
  ["AL-3", { nombre: "Administrativo", categoria: "administrativos", estado: "Prestado", fecha_prestamo: haceHoras(72) }],
  ["AL-4", { nombre: "Ya avisado", categoria: "Cómputo", estado: "Prestado", alerta_enviada: true, fecha_prestamo: haceHoras(72) }],
  ["AL-5", { nombre: "Firestore", categoria: "Audio", estado: "PRESTADO", fecha_prestamo: { seconds: Math.floor(Date.now() / 1000) - 60 * 3600 } }],
  ["AL-6", { nombre: "Fecha rota", categoria: "Audio", estado: "Prestado", fecha_prestamo: "no es fecha" }],
  ["AL-7", { nombre: "Disponible", categoria: "Audio", estado: "Disponible", fecha_prestamo: haceHoras(99) }],
]) {
  await db.query(`insert into public.equipos (id, data) values ($1, $2)`, [id, data]);
}
const reclamados = (await rows(`select id from public.reclamar_prestamos_vencidos(48) order by id`)).map((r) => r.id);
check("reclama solo los préstamos de más de 48 h (ISO y Firestore)", JSON.stringify(reclamados) === JSON.stringify(["AL-1", "AL-5"]), JSON.stringify(reclamados));
const [al1] = await rows(`select data from public.equipos where id = 'AL-1'`);
check("los marca como No responde con alerta enviada", al1.data.estado === "No responde" && al1.data.alerta_enviada === true, JSON.stringify(al1.data));
check("una segunda ejecución no los vuelve a reclamar", (await rows(`select * from public.reclamar_prestamos_vencidos(48)`)).length === 0);
check("liberar devuelve el equipo a Prestado", (await rows(`select public.liberar_alerta_prestamo('AL-1') as ok`))[0].ok === true);
check("liberado, se vuelve a reclamar en la siguiente revisión",
  JSON.stringify((await rows(`select id from public.reclamar_prestamos_vencidos(48)`)).map((r) => r.id)) === '["AL-1"]');
check("no libera un equipo que ya cambió", (await rows(`select public.liberar_alerta_prestamo('AL-2') as ok`))[0].ok === false);

await db.query(`update public.equipos set data = data || '{"estado":"Disponible"}' where id = 'AL-4'`);
const [al4] = await rows(`select data from public.equipos where id = 'AL-4'`);
check("al devolver el equipo se reinicia la alerta", al4.data.alerta_enviada === false, JSON.stringify(al4.data));
await db.query(`update public.equipos set data = data || '{"alerta_enviada":true}' where id = 'AL-7'`);
await db.query(`update public.equipos set data = data || '{"estado":"Prestado"}' where id = 'AL-7'`);
const [al7] = await rows(`select data from public.equipos where id = 'AL-7'`);
check("un préstamo nuevo empieza sin alerta", al7.data.alerta_enviada === false, JSON.stringify(al7.data));
await db.query(`update public.equipos set data = data || '{"estado":"Prestado","alerta_enviada":true}' where id = 'AL-1'`);
const [al1b] = await rows(`select data from public.equipos where id = 'AL-1'`);
check("retirar una falta conserva la alerta enviada", al1b.data.alerta_enviada === true, JSON.stringify(al1b.data));

await db.exec(`set role authenticated`);
await expectError("una cuenta de la app no puede reclamar alertas", `select * from public.reclamar_prestamos_vencidos(48)`, [], /permission denied/);
await expectError("una cuenta de la app no puede liberar alertas", `select public.liberar_alerta_prestamo('AL-1')`, [], /permission denied/);
await db.exec(`reset role`);
await db.exec(`set role service_role`);
check("la clave de servicio sí puede ejecutarlas", Array.isArray(await rows(`select * from public.reclamar_prestamos_vencidos(48)`)));
await db.exec(`reset role`);

console.log("15. Estados con valores fijos");
await as("");
const estadoDe = async (id) => (await rows(`select data->>'estado' as e from public.equipos where id = $1`, [id]))[0]?.e;
check("la restricción quedó activa tras migrar datos antiguos",
  (await rows(`select 1 from pg_constraint where conname = 'equipos_estado_valido' and convalidated`)).length === 1);
await db.query(`insert into public.equipos (id, data) values ('ES-1', '{"nombre":"Sin estado"}')`);
check("un equipo nuevo sin estado queda Disponible", (await estadoDe("ES-1")) === "Disponible");
await db.query(`insert into public.equipos (id, data) values ('ES-2', '{"nombre":"Mayúsculas","estado":" PRESTADO "}')`);
check("normaliza variantes al guardar", (await estadoDe("ES-2")) === "Prestado");
await db.query(`update public.equipos set data = data || '{"estado":"fuera de servicio"}' where id = 'ES-2'`);
check("también al actualizar", (await estadoDe("ES-2")) === "Fuera de Servicio");
await expectError("rechaza un estado inventado",
  `insert into public.equipos (id, data) values ('ES-3', '{"estado":"Perdido"}')`, [], /equipos_estado_valido/);
await expectError("rechaza borrar el estado de un equipo existente",
  `update public.equipos set data = data - 'estado' where id = 'ES-1'`, [], /equipos_estado_valido/);
await expectError("rechaza un estado que no es texto",
  `update public.equipos set data = data || '{"estado":5}' where id = 'ES-1'`, [], /equipos_estado_valido/);
await as("admin");
await expectError("update_equipo también respeta la restricción",
  `select public.update_equipo('ES-1', '{"estado":"Robado"}')`, [], /equipos_estado_valido/);
await db.query(`select public.update_equipo('ES-1', '{"estado":"prestado"}')`);
check("update_equipo guarda el estado normalizado", (await estadoDe("ES-1")) === "Prestado");
await as("");

console.log("16. Límites de recuperación de contraseña");
await as("");
const solicitar = async (email, ip) =>
  (await rows(`select public.registrar_solicitud_recuperacion($1, $2) as ok`, [email, ip]))[0].ok;
check("la primera solicitud se permite", (await solicitar("Ana@Demo.mx", "10.0.0.1")) === true);
check("otra en el mismo minuto se rechaza (sin importar mayúsculas)", (await solicitar(" ana@demo.mx ", "10.0.0.2")) === false);
await db.exec(`update public.solicitudes_recuperacion set creada_en = creada_en - interval '2 minutes'`);
check("pasado un minuto se vuelve a permitir", (await solicitar("ana@demo.mx", "10.0.0.1")) === true);
for (let i = 0; i < 3; i++) {
  await db.exec(`update public.solicitudes_recuperacion set creada_en = creada_en - interval '2 minutes'`);
  await solicitar("ana@demo.mx", "10.0.0.1");
}
await db.exec(`update public.solicitudes_recuperacion set creada_en = creada_en - interval '2 minutes'`);
check("la sexta en una hora se rechaza", (await solicitar("ana@demo.mx", "10.0.0.1")) === false);
check("el correo se guarda como hash, no en claro",
  (await rows(`select count(*)::int as n from public.solicitudes_recuperacion where email_hash like '%@%'`))[0].n === 0);
for (let i = 0; i < 20; i++) await solicitar(`u${i}@demo.mx`, "10.9.9.9");
check("más de 20 por hora desde una IP se rechazan", (await solicitar("otro@demo.mx", "10.9.9.9")) === false);
await db.exec(`update public.solicitudes_recuperacion set creada_en = now() - interval '2 days'`);
await solicitar("limpia@demo.mx", null);
check("borra los intentos de más de un día",
  (await rows(`select count(*)::int as n from public.solicitudes_recuperacion`))[0].n === 1);
check("devuelve el nombre del perfil para el saludo",
  (await rows(`select public.nombre_para_recuperacion(' ADMIN@sigat.mx ') as n`))[0].n === "Cuenta admin");
await db.exec(`set role authenticated`);
await expectError("una cuenta de la app no puede leer los intentos",
  `select * from public.solicitudes_recuperacion`, [], /permission denied/);
await expectError("ni consultar nombres por correo",
  `select public.nombre_para_recuperacion('admin@sigat.mx')`, [], /permission denied/);
await db.exec(`reset role`);

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
