-- ==========================================================================
-- Ubicación de los equipos: Edificio › Espacio.
--
-- edificios / espacios: catálogo que administran los admins (desde la web o
--   la app). Evita variantes como "Edif. A" y "EDIFICIO A".
-- Cada equipo guarda los NOMBRES en equipos.data (`edificio`, `espacio`), igual
--   que las carpetas, para que la app los lea sin conexión y los reportes no
--   necesiten joins. Sin edificio = null (el equipo aparece en "Sin edificio").
--
-- Reglas que aplica el servidor (y que la app replica en utils/ubicacion.ts):
--   · Nombres en mayúsculas, sin espacios sobrantes; vacío = null.
--   · Un espacio sin edificio no tiene sentido: se borra.
--   · Si un equipo usa un edificio/espacio que no está en el catálogo (p. ej.
--     se creó sin conexión), se agrega solo, como pasa con las carpetas.
-- ==========================================================================

create table if not exists public.edificios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint edificios_nombre_normalizado check (nombre <> '' and nombre = upper(btrim(nombre))),
  constraint edificios_nombre_key unique (nombre)
);

create table if not exists public.espacios (
  id uuid primary key default gen_random_uuid(),
  edificio_id uuid not null references public.edificios (id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint espacios_nombre_normalizado check (nombre <> '' and nombre = upper(btrim(nombre))),
  constraint espacios_edificio_nombre_key unique (edificio_id, nombre)
);

create index if not exists espacios_edificio_idx on public.espacios (edificio_id);

-- Mayúsculas, espacios internos colapsados y null si queda vacío.
create or replace function public.normalizar_ubicacion(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))), '');
$$;

-- Crea (si no existen) el edificio y el espacio. Devuelve el id del edificio.
create or replace function public.asegurar_ubicacion(p_edificio text, p_espacio text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text := public.normalizar_ubicacion(p_edificio);
  v_espacio text := public.normalizar_ubicacion(p_espacio);
  v_id uuid;
begin
  if v_edificio is null then
    return null;
  end if;

  insert into public.edificios (nombre) values (v_edificio)
  on conflict (nombre) do nothing;
  select id into v_id from public.edificios where nombre = v_edificio;

  if v_espacio is not null then
    insert into public.espacios (edificio_id, nombre) values (v_id, v_espacio)
    on conflict (edificio_id, nombre) do nothing;
  end if;
  return v_id;
end;
$$;

-- BEFORE: normaliza edificio/espacio del equipo y completa el catálogo.
-- Solo actúa cuando el equipo trae esos campos o cuando cambian, así no toca
-- los equipos antiguos que nunca tuvieron ubicación.
create or replace function public.preparar_ubicacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text;
  v_espacio text;
begin
  if not (new.data ? 'edificio' or new.data ? 'espacio') then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.data -> 'edificio' is not distinct from new.data -> 'edificio'
    and old.data -> 'espacio' is not distinct from new.data -> 'espacio'
  then
    return new;
  end if;

  if new.data ? 'edificio' and jsonb_typeof(new.data -> 'edificio') not in ('string', 'null') then
    raise exception 'El edificio debe ser texto.';
  end if;
  if new.data ? 'espacio' and jsonb_typeof(new.data -> 'espacio') not in ('string', 'null') then
    raise exception 'El espacio debe ser texto.';
  end if;

  v_edificio := public.normalizar_ubicacion(new.data ->> 'edificio');
  v_espacio := case when v_edificio is null then null else public.normalizar_ubicacion(new.data ->> 'espacio') end;

  new.data := new.data || jsonb_build_object('edificio', v_edificio, 'espacio', v_espacio);
  perform public.asegurar_ubicacion(v_edificio, v_espacio);
  return new;
end;
$$;

drop trigger if exists equipos_c_preparar_ubicacion on public.equipos;
create trigger equipos_c_preparar_ubicacion
  before insert or update on public.equipos
  for each row execute function public.preparar_ubicacion_equipo();

-- Registra en el historial un cambio del catálogo o una asignación masiva.
-- Usa tipo "edificio" para que los reportes lo separen de los movimientos.
create or replace function public.registrar_cambio_ubicacion(
  p_accion text,
  p_ubicacion text,
  p_observaciones text,
  p_equipos integer default 0
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.historial (data, fecha)
  values (
    jsonb_build_object(
      'tipo', 'edificio',
      'fecha', now(),
      'accion', p_accion,
      'carpeta', p_ubicacion,
      'equiposAfectados', p_equipos,
      'observaciones', p_observaciones
    ),
    now()
  );
$$;

create or replace function public.exigir_admin_ubicacion()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_sigat_admin()) then
    raise exception 'Solo un administrador puede administrar edificios.' using errcode = '42501';
  end if;
end;
$$;

-- --- Edificios ---

create or replace function public.crear_edificio(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_id uuid;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del edificio no puede estar vacío.';
  end if;

  insert into public.edificios (nombre) values (v_nombre)
  on conflict (nombre) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Ya existe el edificio "%".', v_nombre using errcode = '23505';
  end if;

  perform public.registrar_cambio_ubicacion('EDIFICIO CREADO', v_nombre, 'Edificio agregado al catálogo.');
  return v_id;
end;
$$;

create or replace function public.renombrar_edificio(p_id uuid, p_nombre text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior text;
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del edificio no puede estar vacío.';
  end if;

  select nombre into v_anterior from public.edificios where id = p_id for update;
  if not found then
    raise exception 'El edificio no existe.';
  end if;
  if v_anterior = v_nombre then
    return 0;
  end if;
  if exists (select 1 from public.edificios where nombre = v_nombre) then
    raise exception 'Ya existe el edificio "%".', v_nombre using errcode = '23505';
  end if;

  -- Primero el catálogo, así el trigger de equipos encuentra el nombre nuevo.
  update public.edificios set nombre = v_nombre where id = p_id;
  update public.equipos
  set data = data || jsonb_build_object('edificio', v_nombre)
  where data ->> 'edificio' = v_anterior;
  get diagnostics v_equipos = row_count;

  perform public.registrar_cambio_ubicacion(
    'EDIFICIO RENOMBRADO',
    v_nombre,
    format('Antes: %s. Equipos actualizados: %s.', v_anterior, v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- Elimina el edificio y sus espacios; sus equipos quedan "Sin edificio".
create or replace function public.eliminar_edificio(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  select nombre into v_nombre from public.edificios where id = p_id for update;
  if not found then
    return 0;
  end if;

  update public.equipos
  set data = data || jsonb_build_object('edificio', null, 'espacio', null)
  where data ->> 'edificio' = v_nombre;
  get diagnostics v_equipos = row_count;

  delete from public.edificios where id = p_id;

  perform public.registrar_cambio_ubicacion(
    'EDIFICIO ELIMINADO',
    v_nombre,
    format('Equipos que quedaron sin edificio: %s.', v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- --- Espacios ---

create or replace function public.crear_espacio(p_edificio_id uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text;
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_id uuid;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del espacio no puede estar vacío.';
  end if;
  select nombre into v_edificio from public.edificios where id = p_edificio_id;
  if not found then
    raise exception 'El edificio no existe.';
  end if;

  insert into public.espacios (edificio_id, nombre) values (p_edificio_id, v_nombre)
  on conflict (edificio_id, nombre) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Ya existe el espacio "%" en %.', v_nombre, v_edificio using errcode = '23505';
  end if;

  perform public.registrar_cambio_ubicacion('ESPACIO CREADO', v_edificio || ' › ' || v_nombre, 'Espacio agregado al catálogo.');
  return v_id;
end;
$$;

create or replace function public.renombrar_espacio(p_id uuid, p_nombre text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espacio public.espacios;
  v_edificio text;
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del espacio no puede estar vacío.';
  end if;

  select * into v_espacio from public.espacios where id = p_id for update;
  if not found then
    raise exception 'El espacio no existe.';
  end if;
  select nombre into v_edificio from public.edificios where id = v_espacio.edificio_id;
  if v_espacio.nombre = v_nombre then
    return 0;
  end if;
  if exists (select 1 from public.espacios where edificio_id = v_espacio.edificio_id and nombre = v_nombre) then
    raise exception 'Ya existe el espacio "%" en %.', v_nombre, v_edificio using errcode = '23505';
  end if;

  update public.espacios set nombre = v_nombre where id = p_id;
  update public.equipos
  set data = data || jsonb_build_object('espacio', v_nombre)
  where data ->> 'edificio' = v_edificio and data ->> 'espacio' = v_espacio.nombre;
  get diagnostics v_equipos = row_count;

  perform public.registrar_cambio_ubicacion(
    'ESPACIO RENOMBRADO',
    v_edificio || ' › ' || v_nombre,
    format('Antes: %s. Equipos actualizados: %s.', v_espacio.nombre, v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- Elimina el espacio; sus equipos se quedan en el edificio, sin espacio.
create or replace function public.eliminar_espacio(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espacio public.espacios;
  v_edificio text;
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  select * into v_espacio from public.espacios where id = p_id for update;
  if not found then
    return 0;
  end if;
  select nombre into v_edificio from public.edificios where id = v_espacio.edificio_id;

  update public.equipos
  set data = data || jsonb_build_object('espacio', null)
  where data ->> 'edificio' = v_edificio and data ->> 'espacio' = v_espacio.nombre;
  get diagnostics v_equipos = row_count;

  delete from public.espacios where id = p_id;

  perform public.registrar_cambio_ubicacion(
    'ESPACIO ELIMINADO',
    v_edificio || ' › ' || v_espacio.nombre,
    format('Equipos que quedaron sin espacio: %s.', v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- --- Asignación masiva (web) ---

-- Pone el mismo edificio/espacio a varios equipos en una sola transacción.
-- p_edificio null o vacío = quitarles la ubicación. Devuelve cuántos cambiaron.
create or replace function public.asignar_ubicacion(p_ids text[], p_edificio text, p_espacio text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text := public.normalizar_ubicacion(p_edificio);
  v_espacio text := case when v_edificio is null then null else public.normalizar_ubicacion(p_espacio) end;
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.equipos
  set data = data || jsonb_build_object('edificio', v_edificio, 'espacio', v_espacio)
  where id = any(p_ids)
    and (data -> 'edificio' is distinct from to_jsonb(v_edificio)
      or data -> 'espacio' is distinct from to_jsonb(v_espacio));
  get diagnostics v_equipos = row_count;

  if v_equipos > 0 then
    perform public.registrar_cambio_ubicacion(
      case when v_edificio is null then 'UBICACIÓN RETIRADA' else 'UBICACIÓN ASIGNADA' end,
      coalesce(v_edificio || coalesce(' › ' || v_espacio, ''), 'SIN EDIFICIO'),
      format('Equipos: %s.', array_to_string(p_ids[1:50], ', ') || case when array_length(p_ids, 1) > 50 then '…' else '' end),
      v_equipos
    );
  end if;
  return v_equipos;
end;
$$;

-- --- Permisos ---

alter table public.edificios enable row level security;
alter table public.espacios enable row level security;

drop policy if exists "SIGAT accounts can read buildings" on public.edificios;
create policy "SIGAT accounts can read buildings"
  on public.edificios for select to authenticated
  using ((select public.has_sigat_access()));

drop policy if exists "SIGAT accounts can read rooms" on public.espacios;
create policy "SIGAT accounts can read rooms"
  on public.espacios for select to authenticated
  using ((select public.has_sigat_access()));

-- Solo lectura directa; los cambios pasan por las funciones.
revoke all on public.edificios from anon, authenticated;
revoke all on public.espacios from anon, authenticated;
grant select on public.edificios to authenticated;
grant select on public.espacios to authenticated;

revoke all on function public.asegurar_ubicacion(text, text) from public, anon, authenticated;
revoke all on function public.preparar_ubicacion_equipo() from public, anon, authenticated;
revoke all on function public.registrar_cambio_ubicacion(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.exigir_admin_ubicacion() from public, anon, authenticated;
revoke all on function public.crear_edificio(text) from public, anon;
revoke all on function public.renombrar_edificio(uuid, text) from public, anon;
revoke all on function public.eliminar_edificio(uuid) from public, anon;
revoke all on function public.crear_espacio(uuid, text) from public, anon;
revoke all on function public.renombrar_espacio(uuid, text) from public, anon;
revoke all on function public.eliminar_espacio(uuid) from public, anon;
revoke all on function public.asignar_ubicacion(text[], text, text) from public, anon;
grant execute on function public.crear_edificio(text) to authenticated;
grant execute on function public.renombrar_edificio(uuid, text) to authenticated;
grant execute on function public.eliminar_edificio(uuid) to authenticated;
grant execute on function public.crear_espacio(uuid, text) to authenticated;
grant execute on function public.renombrar_espacio(uuid, text) to authenticated;
grant execute on function public.eliminar_espacio(uuid) to authenticated;
grant execute on function public.asignar_ubicacion(text[], text, text) to authenticated;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['edificios', 'espacios'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end;
$$;
