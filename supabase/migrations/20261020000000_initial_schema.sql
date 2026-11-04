create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  firebase_uid text unique,
  nombre text not null,
  email text not null unique,
  rol text not null check (rol in ('usuario', 'admin', 'superadmin')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists firebase_uid text,
  add column if not exists nombre text,
  add column if not exists email text,
  add column if not exists rol text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temporary_password_issued_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists profiles_firebase_uid_uidx
  on public.profiles (firebase_uid);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_rol_check'
  ) then
    alter table public.profiles
      add constraint profiles_rol_check
      check (rol in ('usuario', 'admin', 'superadmin')) not valid;
  end if;
end;
$$;

create table if not exists public.equipos (
  id text primary key default gen_random_uuid()::text,
  data jsonb not null default '{}'::jsonb
);

alter table public.equipos
  alter column id set default gen_random_uuid()::text;

create table if not exists public.historial (
  id text primary key default gen_random_uuid()::text,
  data jsonb not null default '{}'::jsonb,
  fecha timestamptz
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'historial'
      and column_name = 'fecha'
      and is_generated = 'ALWAYS'
  ) then
    alter table public.historial drop column fecha;
    alter table public.historial add column fecha timestamptz;
  end if;
end;
$$;

create index if not exists historial_fecha_idx on public.historial (fecha desc);

create or replace function public.is_sigat_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and rol in ('admin', 'superadmin')
      and not must_change_password
  );
$$;

create or replace function public.has_sigat_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and not must_change_password
  );
$$;

create or replace function public.is_sigat_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and rol = 'superadmin'
      and not must_change_password
  );
$$;

create or replace function public.current_sigat_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.profiles
  where id = (select auth.uid())
  limit 1;
$$;

create or replace function public.update_equipo(p_id text, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  current_state text;
  requested_state text;
  allowed_user_fields constant text[] := array[
    'estado',
    'usuarioActual',
    'alumno_nombre',
    'alumno_matricula',
    'poseedor_actual',
    'fecha_prestamo',
    'condicion_fisica'
  ];
  changed_fields text[];
begin
  select rol
  into caller_role
  from public.profiles
  where id = (select auth.uid())
    and not must_change_password;

  if caller_role is null then
    raise exception 'Se requiere una cuenta SIGAT activa.';
  end if;

  if caller_role not in ('admin', 'superadmin') then
    select upper(coalesce(data ->> 'estado', ''))
    into current_state
    from public.equipos
    where id = p_id
    for update;

    if not found then
      raise exception 'Equipo no encontrado: %', p_id;
    end if;

    select array_agg(key)
    into changed_fields
    from jsonb_object_keys(p_changes) as fields(key);

    if changed_fields is null
      or exists (
        select 1
        from unnest(changed_fields) as changed(key)
        where not changed.key = any(allowed_user_fields)
      )
    then
      raise exception 'No tienes permiso para editar esos datos del equipo.';
    end if;

    if p_changes ? 'estado' then
      requested_state := upper(p_changes ->> 'estado');

      if requested_state = 'PRESTADO' and current_state <> 'DISPONIBLE' then
        raise exception 'Solo se pueden prestar equipos disponibles.';
      end if;

      if requested_state = 'DISPONIBLE'
        and current_state not in ('PRESTADO', 'NO RESPONDE', 'SIN ENTREGAR')
      then
        raise exception 'El equipo no está registrado como prestado.';
      end if;

      if requested_state not in ('PRESTADO', 'DISPONIBLE') then
        raise exception 'Ese cambio de estado requiere permisos de administrador.';
      end if;
    end if;
  end if;

  update public.equipos
  set data = data || p_changes
  where id = p_id;

  if not found then
    raise exception 'Equipo no encontrado: %', p_id;
  end if;
end;
$$;

create or replace function public.update_equipo_if_unchanged(
  p_id text,
  p_expected_data jsonb,
  p_changes jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_data jsonb;
begin
  select data
  into current_data
  from public.equipos
  where id = p_id
  for update;

  if not found or current_data is distinct from p_expected_data then
    return false;
  end if;

  perform public.update_equipo(p_id, p_changes);
  return true;
end;
$$;

create or replace function public.delete_equipo_if_unchanged(
  p_id text,
  p_expected_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_data jsonb;
begin
  if not (select public.is_sigat_superadmin()) then
    raise exception 'Solo un superadministrador puede eliminar equipos.' using errcode = '42501';
  end if;

  select data
  into current_data
  from public.equipos
  where id = p_id
  for update;

  if not found then
    return true;
  end if;

  if current_data is distinct from p_expected_data then
    return false;
  end if;

  delete from public.equipos where id = p_id;
  return true;
end;
$$;

alter table public.profiles enable row level security;
alter table public.equipos enable row level security;
alter table public.historial enable row level security;

drop policy if exists "Profiles are readable by the account and admins" on public.profiles;
create policy "Profiles are readable by the account and admins"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_sigat_admin()));

drop policy if exists "Admins can update non-superadmin profiles" on public.profiles;
create policy "Admins can update non-superadmin profiles"
  on public.profiles for update to authenticated
  using (
    (select public.is_sigat_superadmin())
    or (
      (select public.is_sigat_admin())
      and rol <> 'superadmin'
    )
  )
  with check (
    (select public.is_sigat_superadmin())
    or (
      (select public.is_sigat_admin())
      and rol <> 'superadmin'
      and (
        id <> (select auth.uid())
        or rol = (select public.current_sigat_role())
      )
    )
  );

drop policy if exists "Admins can read equipment" on public.equipos;
create policy "Admins can read equipment"
  on public.equipos for select to authenticated
  using ((select public.has_sigat_access()));

drop policy if exists "Admins can insert equipment" on public.equipos;
create policy "Admins can insert equipment"
  on public.equipos for insert to authenticated
  with check ((select public.is_sigat_admin()));

drop policy if exists "Admins can update equipment" on public.equipos;
create policy "Admins can update equipment"
  on public.equipos for update to authenticated
  using ((select public.is_sigat_admin()))
  with check ((select public.is_sigat_admin()));

drop policy if exists "Admins can delete equipment" on public.equipos;
drop policy if exists "Superadmins can delete equipment" on public.equipos;
create policy "Superadmins can delete equipment"
  on public.equipos for delete to authenticated
  using ((select public.is_sigat_superadmin()));

drop policy if exists "Admins can read history" on public.historial;
create policy "Admins can read history"
  on public.historial for select to authenticated
  using ((select public.is_sigat_admin()));

drop policy if exists "Admins can insert history" on public.historial;
create policy "Admins can insert history"
  on public.historial for insert to authenticated
  with check ((select public.has_sigat_access()));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.equipos to authenticated;
grant select, insert on public.historial to authenticated;
revoke all on function public.is_sigat_admin() from public, anon;
revoke all on function public.has_sigat_access() from public, anon;
revoke all on function public.is_sigat_superadmin() from public, anon;
revoke all on function public.current_sigat_role() from public, anon;
revoke all on function public.update_equipo(text, jsonb) from public, anon;
revoke all on function public.update_equipo_if_unchanged(text, jsonb, jsonb) from public, anon;
revoke all on function public.delete_equipo_if_unchanged(text, jsonb) from public, anon;
grant execute on function public.is_sigat_admin() to authenticated;
grant execute on function public.has_sigat_access() to authenticated;
grant execute on function public.is_sigat_superadmin() to authenticated;
grant execute on function public.current_sigat_role() to authenticated;
grant execute on function public.update_equipo(text, jsonb) to authenticated;
grant execute on function public.update_equipo_if_unchanged(text, jsonb, jsonb) to authenticated;
grant execute on function public.delete_equipo_if_unchanged(text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'equipos'
  ) then
    alter publication supabase_realtime add table public.equipos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'historial'
  ) then
    alter publication supabase_realtime add table public.historial;
  end if;
end;
$$;

-- Reserva atómica del siguiente ID "EQ-XXX" para nuevos equipos.
-- Evita que dos dispositivos generen el mismo ID al dar de alta al mismo tiempo.
create sequence if not exists public.equipo_id_seq;
revoke all on sequence public.equipo_id_seq from public, anon, authenticated;

create or replace function public.next_equipo_id()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_max bigint;
  v_next bigint;
begin
  if not (select public.is_sigat_admin()) then
    raise exception 'No autorizado para registrar equipos.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.next_equipo_id'));

  select coalesce(max(substring(id from '^EQ-([0-9]+)$')::bigint), 0)
  into v_max
  from public.equipos
  where id ~ '^EQ-[0-9]+$';

  v_next := nextval('public.equipo_id_seq');
  -- Si se registraron IDs manualmente por encima de la secuencia, la alcanza.
  if v_next <= v_max then
    v_next := v_max + 1;
    perform setval('public.equipo_id_seq', v_next, true);
  end if;

  return 'EQ-' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
end;
$$;

revoke all on function public.next_equipo_id() from public, anon;
grant execute on function public.next_equipo_id() to authenticated;

-- Autoría verificable del historial: el servidor registra quién insertó cada
-- movimiento y reemplaza el nombre "admin" por el del perfil real, para que no
-- se pueda registrar un movimiento a nombre de otra persona.
create or replace function public.stamp_historial_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  select nombre
  into v_nombre
  from public.profiles
  where id = (select auth.uid());

  new.data := coalesce(new.data, '{}'::jsonb)
    || jsonb_build_object('registrado_por', (select auth.uid()), 'registrado_en', now())
    || case when v_nombre is not null then jsonb_build_object('admin', v_nombre) else '{}'::jsonb end;
  return new;
end;
$$;

revoke all on function public.stamp_historial_author() from public, anon, authenticated;

drop trigger if exists historial_stamp_author on public.historial;
create trigger historial_stamp_author
  before insert on public.historial
  for each row execute function public.stamp_historial_author();

-- ==========================================================================
-- Estados con un solo formato (el que escriben SIGAT Web y la app móvil).
-- Convierte valores históricos como "PRESTADO" o "DISPONIBLE".
-- ==========================================================================
update public.equipos
set data = jsonb_set(
  data,
  '{estado}',
  to_jsonb(case upper(btrim(data ->> 'estado'))
    when 'DISPONIBLE' then 'Disponible'
    when 'PRESTADO' then 'Prestado'
    when 'SIN ENTREGAR' then 'Sin entregar'
    when 'NO RESPONDE' then 'No responde'
    when 'FUERA DE SERVICIO' then 'Fuera de Servicio'
  end)
)
where upper(btrim(data ->> 'estado')) in ('DISPONIBLE', 'PRESTADO', 'SIN ENTREGAR', 'NO RESPONDE', 'FUERA DE SERVICIO')
  and data ->> 'estado' not in ('Disponible', 'Prestado', 'Sin entregar', 'No responde', 'Fuera de Servicio');

-- ==========================================================================
-- Carpetas del inventario: Categoría (1) > Subcategoría (2) > Sección (3).
-- Reemplazan a los equipos "Plantilla Sistema" que se usaban para que una
-- carpeta vacía existiera. Los equipos siguen guardando los nombres de su
-- carpeta en data (categoria, subcategoria, subSubcategoria) y un trigger
-- crea automáticamente las carpetas que use cualquier equipo.
-- ==========================================================================
create table if not exists public.carpetas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.carpetas (id) on delete cascade,
  nombre text not null,
  nivel smallint not null,
  created_at timestamptz not null default now(),
  constraint carpetas_nombre_normalizado check (nombre <> '' and nombre = upper(btrim(nombre))),
  constraint carpetas_nivel_valido check (nivel between 1 and 3),
  constraint carpetas_raiz_sin_padre check ((nivel = 1) = (parent_id is null)),
  constraint carpetas_parent_nombre_key unique nulls not distinct (parent_id, nombre)
);

create index if not exists carpetas_parent_idx on public.carpetas (parent_id);

-- Mismo criterio que normalizarCarpeta() en la app: mayúsculas, sin espacios
-- sobrantes y "GENERAL" si está vacío.
create or replace function public.normalizar_carpeta(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(upper(btrim(p_nombre)), ''), 'GENERAL');
$$;

create or replace function public.campo_carpeta(p_nivel smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_nivel when 1 then 'categoria' when 2 then 'subcategoria' else 'subSubcategoria' end;
$$;

-- Crea (si no existen) las tres carpetas de una ruta y devuelve la sección.
create or replace function public.ensure_carpeta_path(p_categoria text, p_subcategoria text, p_seccion text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat_nombre text := public.normalizar_carpeta(p_categoria);
  v_sub_nombre text := public.normalizar_carpeta(p_subcategoria);
  v_sec_nombre text := public.normalizar_carpeta(p_seccion);
  v_cat uuid;
  v_sub uuid;
  v_sec uuid;
begin
  insert into public.carpetas (parent_id, nombre, nivel)
  values (null, v_cat_nombre, 1)
  on conflict (parent_id, nombre) do nothing;
  select id into v_cat from public.carpetas where parent_id is null and nombre = v_cat_nombre;

  insert into public.carpetas (parent_id, nombre, nivel)
  values (v_cat, v_sub_nombre, 2)
  on conflict (parent_id, nombre) do nothing;
  select id into v_sub from public.carpetas where parent_id = v_cat and nombre = v_sub_nombre;

  insert into public.carpetas (parent_id, nombre, nivel)
  values (v_sub, v_sec_nombre, 3)
  on conflict (parent_id, nombre) do nothing;
  select id into v_sec from public.carpetas where parent_id = v_sub and nombre = v_sec_nombre;

  return v_sec;
end;
$$;

create or replace function public.sync_carpetas_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.data ->> 'categoria' is not distinct from new.data ->> 'categoria'
    and old.data ->> 'subcategoria' is not distinct from new.data ->> 'subcategoria'
    and old.data ->> 'subSubcategoria' is not distinct from new.data ->> 'subSubcategoria'
  then
    return new;
  end if;

  perform public.ensure_carpeta_path(
    new.data ->> 'categoria',
    new.data ->> 'subcategoria',
    new.data ->> 'subSubcategoria'
  );
  return new;
end;
$$;

drop trigger if exists equipos_sync_carpetas on public.equipos;
create trigger equipos_sync_carpetas
  after insert or update of data on public.equipos
  for each row execute function public.sync_carpetas_equipo();

-- Carga inicial: las carpetas que ya usan los equipos (incluidas las plantillas).
do $$
declare
  r record;
begin
  for r in select data from public.equipos loop
    perform public.ensure_carpeta_path(r.data ->> 'categoria', r.data ->> 'subcategoria', r.data ->> 'subSubcategoria');
  end loop;
end;
$$;

-- Las plantillas ya no son necesarias: sus carpetas quedaron en la tabla.
delete from public.equipos
where data ->> 'isTemplate' = 'true'
   or (data ->> 'estado' = 'SISTEMA' and lower(data ->> 'nombre') = 'plantilla sistema');

-- Crea una carpeta vacía dentro de otra (o una categoría si p_parent_id es null).
create or replace function public.crear_carpeta(p_parent_id uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := public.normalizar_carpeta(p_nombre);
  v_nivel smallint := 1;
  v_id uuid;
begin
  if not (select public.is_sigat_admin()) then
    raise exception 'Solo un administrador puede crear carpetas.' using errcode = '42501';
  end if;

  if p_parent_id is not null then
    select nivel + 1 into v_nivel from public.carpetas where id = p_parent_id;
    if v_nivel is null then
      raise exception 'La carpeta superior no existe.';
    end if;
    if v_nivel > 3 then
      raise exception 'Solo se permiten tres niveles de carpetas.';
    end if;
  end if;

  insert into public.carpetas (parent_id, nombre, nivel)
  values (p_parent_id, v_nombre, v_nivel)
  on conflict (parent_id, nombre) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Ya existe una carpeta "%" en este nivel.', v_nombre using errcode = '23505';
  end if;
  return v_id;
end;
$$;

-- IDs de los equipos que están dentro de una carpeta (según su ruta completa).
create or replace function public.equipos_en_carpeta(p_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_carpeta public.carpetas;
  v_cat text;
  v_sub text;
begin
  select * into v_carpeta from public.carpetas where id = p_id;
  if not found then
    return;
  end if;

  if v_carpeta.nivel = 2 then
    select nombre into v_cat from public.carpetas where id = v_carpeta.parent_id;
  elsif v_carpeta.nivel = 3 then
    select padre.nombre, abuelo.nombre
    into v_sub, v_cat
    from public.carpetas padre
    join public.carpetas abuelo on abuelo.id = padre.parent_id
    where padre.id = v_carpeta.parent_id;
  end if;

  return query
  select e.id
  from public.equipos e
  where case v_carpeta.nivel
      when 1 then public.normalizar_carpeta(e.data ->> 'categoria') = v_carpeta.nombre
      when 2 then public.normalizar_carpeta(e.data ->> 'categoria') = v_cat
        and public.normalizar_carpeta(e.data ->> 'subcategoria') = v_carpeta.nombre
      else public.normalizar_carpeta(e.data ->> 'categoria') = v_cat
        and public.normalizar_carpeta(e.data ->> 'subcategoria') = v_sub
        and public.normalizar_carpeta(e.data ->> 'subSubcategoria') = v_carpeta.nombre
    end;
end;
$$;

-- Renombra una carpeta y actualiza todos sus equipos en una sola transacción.
create or replace function public.renombrar_carpeta(p_id uuid, p_nombre text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carpeta public.carpetas;
  v_nombre text := public.normalizar_carpeta(p_nombre);
  v_equipos text[];
begin
  if not (select public.is_sigat_admin()) then
    raise exception 'Solo un administrador puede renombrar carpetas.' using errcode = '42501';
  end if;

  select * into v_carpeta from public.carpetas where id = p_id for update;
  if not found then
    raise exception 'La carpeta no existe.';
  end if;
  if v_carpeta.nombre = v_nombre then
    return;
  end if;
  if exists (
    select 1 from public.carpetas
    where parent_id is not distinct from v_carpeta.parent_id and nombre = v_nombre
  ) then
    raise exception 'Ya existe una carpeta "%" en este nivel.', v_nombre using errcode = '23505';
  end if;

  -- Los equipos se buscan antes de renombrar, porque su ruta usa el nombre actual.
  select array_agg(id) into v_equipos from public.equipos_en_carpeta(p_id) as t(id);

  update public.carpetas set nombre = v_nombre where id = p_id;

  update public.equipos
  set data = jsonb_set(data, array[public.campo_carpeta(v_carpeta.nivel)], to_jsonb(v_nombre))
  where id = any(coalesce(v_equipos, '{}'));
end;
$$;

-- Elimina una carpeta (y sus subcarpetas); sus equipos pasan a "GENERAL" en ese nivel.
create or replace function public.eliminar_carpeta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carpeta public.carpetas;
  v_equipos text[];
begin
  if not (select public.is_sigat_admin()) then
    raise exception 'Solo un administrador puede eliminar carpetas.' using errcode = '42501';
  end if;

  select * into v_carpeta from public.carpetas where id = p_id for update;
  if not found then
    return;
  end if;
  if v_carpeta.nombre = 'GENERAL' then
    raise exception 'La carpeta GENERAL no se puede eliminar.';
  end if;

  select array_agg(id) into v_equipos from public.equipos_en_carpeta(p_id) as t(id);

  -- El trigger crea las rutas "GENERAL" que necesiten los equipos movidos.
  update public.equipos
  set data = jsonb_set(data, array[public.campo_carpeta(v_carpeta.nivel)], to_jsonb('GENERAL'::text))
  where id = any(coalesce(v_equipos, '{}'));

  delete from public.carpetas where id = p_id;
end;
$$;

alter table public.carpetas enable row level security;

drop policy if exists "SIGAT accounts can read folders" on public.carpetas;
create policy "SIGAT accounts can read folders"
  on public.carpetas for select to authenticated
  using ((select public.has_sigat_access()));

-- Solo lectura directa; crear, renombrar y eliminar pasan por las funciones.
revoke all on public.carpetas from anon, authenticated;
grant select on public.carpetas to authenticated;

revoke all on function public.ensure_carpeta_path(text, text, text) from public, anon, authenticated;
revoke all on function public.sync_carpetas_equipo() from public, anon, authenticated;
revoke all on function public.equipos_en_carpeta(uuid) from public, anon, authenticated;
revoke all on function public.crear_carpeta(uuid, text) from public, anon;
revoke all on function public.renombrar_carpeta(uuid, text) from public, anon;
revoke all on function public.eliminar_carpeta(uuid) from public, anon;
grant execute on function public.crear_carpeta(uuid, text) to authenticated;
grant execute on function public.renombrar_carpeta(uuid, text) to authenticated;
grant execute on function public.eliminar_carpeta(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'carpetas'
  ) then
    alter publication supabase_realtime add table public.carpetas;
  end if;
end;
$$;
