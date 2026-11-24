-- ==========================================================================
-- Tercer nivel de ubicación: Edificio › Espacio › Departamento / área.
--
-- areas: catálogo dentro de cada espacio (p. ej. EDIFICIO A › PLANTA BAJA ›
--   CONTABILIDAD). Igual que edificios y espacios, cada equipo guarda el NOMBRE
--   en equipos.data (`area`) para que la app lo lea sin conexión.
--
-- Reglas (la app las replica en utils/ubicacion.ts):
--   · Mismo formato de nombre: mayúsculas, sin espacios sobrantes; vacío = null.
--   · Sin espacio no hay área: se borra.
--   · Si un equipo usa un área que no está en el catálogo, se agrega sola.
--   · La clave `area` solo se escribe si el equipo ya la trae, para no cambiar
--     los datos de equipos guardados por versiones anteriores de la app.
-- ==========================================================================

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references public.espacios (id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint areas_nombre_normalizado check (nombre <> '' and nombre = upper(btrim(nombre))),
  constraint areas_espacio_nombre_key unique (espacio_id, nombre)
);

create index if not exists areas_espacio_idx on public.areas (espacio_id);

-- Crea (si no existen) el edificio, el espacio y el área. Devuelve el id del edificio.
create or replace function public.asegurar_ubicacion(p_edificio text, p_espacio text, p_area text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text := public.normalizar_ubicacion(p_edificio);
  v_espacio text := public.normalizar_ubicacion(p_espacio);
  v_area text := public.normalizar_ubicacion(p_area);
  v_id uuid;
  v_espacio_id uuid;
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
    select id into v_espacio_id from public.espacios where edificio_id = v_id and nombre = v_espacio;

    if v_area is not null then
      insert into public.areas (espacio_id, nombre) values (v_espacio_id, v_area)
      on conflict (espacio_id, nombre) do nothing;
    end if;
  end if;
  return v_id;
end;
$$;

-- BEFORE: normaliza edificio/espacio/área del equipo y completa el catálogo.
create or replace function public.preparar_ubicacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text;
  v_espacio text;
  v_area text;
  v_clave text;
begin
  if not (new.data ? 'edificio' or new.data ? 'espacio' or new.data ? 'area') then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.data -> 'edificio' is not distinct from new.data -> 'edificio'
    and old.data -> 'espacio' is not distinct from new.data -> 'espacio'
    and old.data -> 'area' is not distinct from new.data -> 'area'
  then
    return new;
  end if;

  foreach v_clave in array array['edificio', 'espacio', 'area'] loop
    if new.data ? v_clave and jsonb_typeof(new.data -> v_clave) not in ('string', 'null') then
      raise exception 'El % debe ser texto.', case v_clave when 'area' then 'área' else v_clave end;
    end if;
  end loop;

  v_edificio := public.normalizar_ubicacion(new.data ->> 'edificio');
  v_espacio := case when v_edificio is null then null else public.normalizar_ubicacion(new.data ->> 'espacio') end;
  v_area := case when v_espacio is null then null else public.normalizar_ubicacion(new.data ->> 'area') end;

  new.data := new.data || jsonb_build_object('edificio', v_edificio, 'espacio', v_espacio);
  if new.data ? 'area' then
    new.data := new.data || jsonb_build_object('area', v_area);
  end if;
  perform public.asegurar_ubicacion(v_edificio, v_espacio, v_area);
  return new;
end;
$$;

drop function if exists public.asegurar_ubicacion(text, text);

-- --- Eliminar edificio / espacio: también se quita el área ---

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
    || case when data ? 'area' then jsonb_build_object('area', null) else '{}'::jsonb end
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
    || case when data ? 'area' then jsonb_build_object('area', null) else '{}'::jsonb end
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

-- --- Áreas ---

create or replace function public.crear_area(p_espacio_id uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta text;
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_id uuid;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del departamento o área no puede estar vacío.';
  end if;
  select e.nombre || ' › ' || s.nombre into v_ruta
  from public.espacios s join public.edificios e on e.id = s.edificio_id
  where s.id = p_espacio_id;
  if v_ruta is null then
    raise exception 'El espacio no existe.';
  end if;

  insert into public.areas (espacio_id, nombre) values (p_espacio_id, v_nombre)
  on conflict (espacio_id, nombre) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Ya existe el área "%" en %.', v_nombre, v_ruta using errcode = '23505';
  end if;

  perform public.registrar_cambio_ubicacion('ÁREA CREADA', v_ruta || ' › ' || v_nombre, 'Departamento o área agregado al catálogo.');
  return v_id;
end;
$$;

create or replace function public.renombrar_area(p_id uuid, p_nombre text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_area public.areas;
  v_edificio text;
  v_espacio text;
  v_nombre text := public.normalizar_ubicacion(p_nombre);
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  if v_nombre is null then
    raise exception 'El nombre del departamento o área no puede estar vacío.';
  end if;

  select * into v_area from public.areas where id = p_id for update;
  if not found then
    raise exception 'El área no existe.';
  end if;
  select e.nombre, s.nombre into v_edificio, v_espacio
  from public.espacios s join public.edificios e on e.id = s.edificio_id
  where s.id = v_area.espacio_id;
  if v_area.nombre = v_nombre then
    return 0;
  end if;
  if exists (select 1 from public.areas where espacio_id = v_area.espacio_id and nombre = v_nombre) then
    raise exception 'Ya existe el área "%" en % › %.', v_nombre, v_edificio, v_espacio using errcode = '23505';
  end if;

  update public.areas set nombre = v_nombre where id = p_id;
  update public.equipos
  set data = data || jsonb_build_object('area', v_nombre)
  where data ->> 'edificio' = v_edificio and data ->> 'espacio' = v_espacio and data ->> 'area' = v_area.nombre;
  get diagnostics v_equipos = row_count;

  perform public.registrar_cambio_ubicacion(
    'ÁREA RENOMBRADA',
    v_edificio || ' › ' || v_espacio || ' › ' || v_nombre,
    format('Antes: %s. Equipos actualizados: %s.', v_area.nombre, v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- Elimina el área; sus equipos se quedan en el mismo espacio, sin área.
create or replace function public.eliminar_area(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_area public.areas;
  v_edificio text;
  v_espacio text;
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  select * into v_area from public.areas where id = p_id for update;
  if not found then
    return 0;
  end if;
  select e.nombre, s.nombre into v_edificio, v_espacio
  from public.espacios s join public.edificios e on e.id = s.edificio_id
  where s.id = v_area.espacio_id;

  update public.equipos
  set data = data || jsonb_build_object('area', null)
  where data ->> 'edificio' = v_edificio and data ->> 'espacio' = v_espacio and data ->> 'area' = v_area.nombre;
  get diagnostics v_equipos = row_count;

  delete from public.areas where id = p_id;

  perform public.registrar_cambio_ubicacion(
    'ÁREA ELIMINADA',
    v_edificio || ' › ' || v_espacio || ' › ' || v_area.nombre,
    format('Equipos que quedaron sin área: %s.', v_equipos),
    v_equipos
  );
  return v_equipos;
end;
$$;

-- --- Asignación masiva con área ---

drop function if exists public.asignar_ubicacion(text[], text, text);

create or replace function public.asignar_ubicacion(p_ids text[], p_edificio text, p_espacio text, p_area text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edificio text := public.normalizar_ubicacion(p_edificio);
  v_espacio text := case when v_edificio is null then null else public.normalizar_ubicacion(p_espacio) end;
  v_area text := case when v_espacio is null then null else public.normalizar_ubicacion(p_area) end;
  v_equipos integer;
begin
  perform public.exigir_admin_ubicacion();
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.equipos
  set data = data || jsonb_build_object('edificio', v_edificio, 'espacio', v_espacio, 'area', v_area)
  where id = any(p_ids)
    -- Clave ausente y null de JSON cuentan igual (sin ubicación).
    and (coalesce(data -> 'edificio', 'null') is distinct from coalesce(to_jsonb(v_edificio), 'null')
      or coalesce(data -> 'espacio', 'null') is distinct from coalesce(to_jsonb(v_espacio), 'null')
      or coalesce(data -> 'area', 'null') is distinct from coalesce(to_jsonb(v_area), 'null'));
  get diagnostics v_equipos = row_count;

  if v_equipos > 0 then
    perform public.registrar_cambio_ubicacion(
      case when v_edificio is null then 'UBICACIÓN RETIRADA' else 'UBICACIÓN ASIGNADA' end,
      coalesce(v_edificio || coalesce(' › ' || v_espacio, '') || coalesce(' › ' || v_area, ''), 'SIN EDIFICIO'),
      format('Equipos: %s.', array_to_string(p_ids[1:50], ', ') || case when array_length(p_ids, 1) > 50 then '…' else '' end),
      v_equipos
    );
  end if;
  return v_equipos;
end;
$$;

-- --- Permisos ---

alter table public.areas enable row level security;

drop policy if exists "SIGAT accounts can read areas" on public.areas;
create policy "SIGAT accounts can read areas"
  on public.areas for select to authenticated
  using ((select public.has_sigat_access()));

revoke all on public.areas from anon, authenticated;
grant select on public.areas to authenticated;

revoke all on function public.asegurar_ubicacion(text, text, text) from public, anon, authenticated;
revoke all on function public.preparar_ubicacion_equipo() from public, anon, authenticated;
revoke all on function public.crear_area(uuid, text) from public, anon;
revoke all on function public.renombrar_area(uuid, text) from public, anon;
revoke all on function public.eliminar_area(uuid) from public, anon;
revoke all on function public.asignar_ubicacion(text[], text, text, text) from public, anon;
grant execute on function public.crear_area(uuid, text) to authenticated;
grant execute on function public.renombrar_area(uuid, text) to authenticated;
grant execute on function public.eliminar_area(uuid) to authenticated;
grant execute on function public.asignar_ubicacion(text[], text, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'areas'
  ) then
    alter publication supabase_realtime add table public.areas;
  end if;
end;
$$;
