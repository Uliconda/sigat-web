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
