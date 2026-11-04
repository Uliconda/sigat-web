-- ==========================================================================
-- Estados de equipos con valores fijos.
--
-- Valores válidos (los mismos que usan SIGAT Web y la app móvil):
--   Disponible · Prestado · Sin entregar · No responde · Fuera de Servicio
--
-- 1. Un trigger normaliza variantes ("PRESTADO", " prestado ") al formato
--    oficial, para no romper versiones anteriores de las apps.
-- 2. Un equipo nuevo sin estado queda "Disponible".
-- 3. Una restricción CHECK rechaza cualquier otro valor.
-- ==========================================================================

create or replace function public.normalizar_estado_equipo(p_estado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(btrim(p_estado))
    when 'DISPONIBLE' then 'Disponible'
    when 'PRESTADO' then 'Prestado'
    when 'SIN ENTREGAR' then 'Sin entregar'
    when 'NO RESPONDE' then 'No responde'
    when 'FUERA DE SERVICIO' then 'Fuera de Servicio'
    else p_estado
  end;
$$;

create or replace function public.estado_equipo_valido(p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce: un CHECK con resultado NULL se considera aprobado; sin estado = inválido.
  select coalesce(
    jsonb_typeof(p_data -> 'estado') = 'string'
      and p_data ->> 'estado' in ('Disponible', 'Prestado', 'Sin entregar', 'No responde', 'Fuera de Servicio'),
    false
  );
$$;

create or replace function public.preparar_estado_equipo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb);
  if new.data -> 'estado' is null or jsonb_typeof(new.data -> 'estado') = 'null' then
    -- Solo al crear se asume "Disponible"; al editar, borrar el estado es un error.
    if tg_op = 'INSERT' then
      new.data := new.data || jsonb_build_object('estado', 'Disponible');
    end if;
  elsif jsonb_typeof(new.data -> 'estado') = 'string' then
    new.data := new.data || jsonb_build_object(
      'estado', public.normalizar_estado_equipo(new.data ->> 'estado')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.preparar_estado_equipo() from public, anon, authenticated;

-- El prefijo "a_" hace que se ejecute antes que los demás triggers de equipos
-- (PostgreSQL los ejecuta en orden alfabético), que ya ven el estado normalizado.
drop trigger if exists equipos_a_preparar_estado on public.equipos;
create trigger equipos_a_preparar_estado
  before insert or update on public.equipos
  for each row execute function public.preparar_estado_equipo();

-- Corrige filas antiguas antes de activar la restricción.
update public.equipos
set data = data || jsonb_build_object('estado', public.normalizar_estado_equipo(data ->> 'estado'))
where jsonb_typeof(data -> 'estado') = 'string'
  and data ->> 'estado' is distinct from public.normalizar_estado_equipo(data ->> 'estado');

update public.equipos
set data = data || jsonb_build_object('estado', 'Disponible')
where data -> 'estado' is null or jsonb_typeof(data -> 'estado') = 'null';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipos'::regclass
      and conname = 'equipos_estado_valido'
  ) then
    alter table public.equipos
      add constraint equipos_estado_valido check (public.estado_equipo_valido(data));
  end if;
end;
$$;
