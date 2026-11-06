-- ==========================================================================
-- Personal administrativo y asignación de equipos.
--
-- personal_administrativo: personas a las que se les asigna equipo
--   (departamento, fechas de ingreso/término y conducta en el uso del equipo).
-- asignaciones_equipo: historial de qué equipo ha tenido cada persona y cuándo.
--
-- Un equipo se asigna guardando `personal_id` en equipos.data junto con el
-- estado "Prestado". Los triggers de esta migración mantienen el historial de
-- asignaciones por sí solos, así que funciona igual desde la app móvil (también
-- sin conexión, con la cola offline), desde la web o desde el SQL Editor:
--   · personal_id nuevo           → abre una asignación
--   · personal_id cambia o se va  → cierra la asignación anterior
--   · el equipo se devuelve o se da de baja → se limpia personal_id y se cierra
--   · el equipo se elimina        → se cierra la asignación
-- ==========================================================================

create table if not exists public.personal_administrativo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  departamento text,
  fecha_ingreso date,
  fecha_termino date,
  -- Conducta respecto al uso del equipo.
  conducta text,
  conducta_notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint personal_conducta_valida check (conducta is null or conducta in ('Excelente', 'Buena', 'Regular', 'Mala')),
  constraint personal_fechas_validas check (fecha_termino is null or fecha_ingreso is null or fecha_termino >= fecha_ingreso)
);

create index if not exists personal_administrativo_nombre_idx on public.personal_administrativo (lower(nombre));

create table if not exists public.asignaciones_equipo (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_administrativo (id) on delete restrict,
  -- Sin llave foránea: la asignación se conserva aunque el equipo se elimine.
  equipo_id text not null,
  equipo_nombre text,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  asignado_por text,
  recibido_por text,
  -- Condición física con la que se devolvió el equipo.
  condicion_devolucion text,
  observaciones text,
  -- 'sistema' (app/web) o 'migracion' (importado de los datos anteriores).
  origen text not null default 'sistema',
  created_at timestamptz not null default now(),
  constraint asignaciones_fechas_validas check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index if not exists asignaciones_personal_idx on public.asignaciones_equipo (personal_id, fecha_inicio desc);
create index if not exists asignaciones_equipo_idx on public.asignaciones_equipo (equipo_id, fecha_inicio desc);
-- Un equipo solo puede tener una asignación abierta a la vez.
create unique index if not exists asignaciones_una_abierta_por_equipo
  on public.asignaciones_equipo (equipo_id) where fecha_fin is null;

create or replace function public.personal_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := btrim(new.nombre);
  new.departamento := nullif(btrim(new.departamento), '');
  new.conducta_notas := nullif(btrim(new.conducta_notas), '');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.personal_touch_updated_at() from public, anon, authenticated;

drop trigger if exists personal_administrativo_touch on public.personal_administrativo;
create trigger personal_administrativo_touch
  before insert or update on public.personal_administrativo
  for each row execute function public.personal_touch_updated_at();

-- ¿El estado indica que alguien tiene el equipo en su poder?
create or replace function public.estado_en_poder(p_estado text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select upper(btrim(coalesce(p_estado, ''))) in ('PRESTADO', 'SIN ENTREGAR', 'NO RESPONDE');
$$;

-- personal_id vacío ("" o null) = sin asignar.
create or replace function public.personal_id_equipo(p_data jsonb)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_data ->> 'personal_id', '')), '')::uuid;
$$;

-- BEFORE: valida la persona y limpia personal_id si el equipo ya no está en poder de nadie.
create or replace function public.preparar_personal_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personal uuid;
  v_termino date;
begin
  if new.data ? 'personal_id' and jsonb_typeof(new.data -> 'personal_id') not in ('string', 'null') then
    raise exception 'personal_id debe ser un identificador de texto.';
  end if;

  begin
    v_personal := public.personal_id_equipo(new.data);
  exception when invalid_text_representation then
    raise exception 'El personal asignado no es válido.';
  end;

  if v_personal is null then
    return new;
  end if;

  -- Devuelto, disponible o dado de baja: ya nadie lo tiene.
  if not public.estado_en_poder(new.data ->> 'estado') then
    new.data := new.data || jsonb_build_object('personal_id', null);
    return new;
  end if;

  -- Solo se valida cuando la asignación cambia (no al editar otros campos).
  if tg_op = 'UPDATE' and v_personal is not distinct from public.personal_id_equipo(old.data) then
    return new;
  end if;

  select fecha_termino into v_termino from public.personal_administrativo where id = v_personal;
  if not found then
    raise exception 'La persona asignada no está dada de alta en Personal administrativo.';
  end if;
  if v_termino is not null and v_termino < current_date then
    raise exception 'No se puede asignar equipo a personal que ya dejó de laborar.';
  end if;
  return new;
end;
$$;

-- AFTER: abre y cierra las asignaciones según el cambio de personal_id.
create or replace function public.sincronizar_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes uuid;
  v_ahora uuid;
  v_usuario text;
begin
  select nombre into v_usuario from public.profiles where id = (select auth.uid());

  if tg_op = 'DELETE' then
    update public.asignaciones_equipo
    set fecha_fin = now(),
        recibido_por = coalesce(v_usuario, recibido_por),
        observaciones = concat_ws(' · ', observaciones, 'Equipo eliminado del inventario')
    where equipo_id = old.id and fecha_fin is null;
    return old;
  end if;

  v_ahora := public.personal_id_equipo(new.data);
  v_antes := case when tg_op = 'UPDATE' then public.personal_id_equipo(old.data) end;

  if v_antes is not distinct from v_ahora then
    -- Misma persona: solo se actualiza el nombre del equipo si cambió.
    if v_ahora is not null and old.data ->> 'nombre' is distinct from new.data ->> 'nombre' then
      update public.asignaciones_equipo
      set equipo_nombre = new.data ->> 'nombre'
      where equipo_id = new.id and fecha_fin is null;
    end if;
    return new;
  end if;

  update public.asignaciones_equipo
  set fecha_fin = now(),
      recibido_por = coalesce(v_usuario, new.data ->> 'usuarioActual'),
      condicion_devolucion = nullif(new.data ->> 'condicion_fisica', '')
  where equipo_id = new.id and fecha_fin is null;

  if v_ahora is not null then
    insert into public.asignaciones_equipo (personal_id, equipo_id, equipo_nombre, fecha_inicio, asignado_por)
    values (
      v_ahora,
      new.id,
      new.data ->> 'nombre',
      least(coalesce(public.fecha_prestamo_equipo(new.data), now()), now()),
      coalesce(v_usuario, new.data ->> 'usuarioActual')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.estado_en_poder(text) from public, anon;
revoke all on function public.personal_id_equipo(jsonb) from public, anon;
revoke all on function public.preparar_personal_equipo() from public, anon, authenticated;
revoke all on function public.sincronizar_asignacion_equipo() from public, anon, authenticated;
grant execute on function public.estado_en_poder(text) to authenticated;
grant execute on function public.personal_id_equipo(jsonb) to authenticated;

-- "b_": se ejecuta después de equipos_a_preparar_estado (ya ve el estado normalizado).
drop trigger if exists equipos_b_preparar_personal on public.equipos;
create trigger equipos_b_preparar_personal
  before insert or update on public.equipos
  for each row execute function public.preparar_personal_equipo();

drop trigger if exists equipos_sincronizar_asignacion on public.equipos;
create trigger equipos_sincronizar_asignacion
  after insert or update or delete on public.equipos
  for each row execute function public.sincronizar_asignacion_equipo();

-- Las cuentas "usuario" pueden prestar equipos: también pueden asignarlos a personal.
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
    'condicion_fisica',
    'personal_id'
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

-- --------------------------------------------------------------------------
-- Permisos: cualquier cuenta SIGAT consulta (para poder asignar equipo);
-- solo administradores dan de alta o editan; solo superadministradores eliminan
-- (y solo si la persona nunca tuvo equipo, por la llave foránea).
-- El historial de asignaciones solo lo escriben los triggers.
-- --------------------------------------------------------------------------
alter table public.personal_administrativo enable row level security;
alter table public.asignaciones_equipo enable row level security;

drop policy if exists "SIGAT accounts can read staff" on public.personal_administrativo;
create policy "SIGAT accounts can read staff"
  on public.personal_administrativo for select to authenticated
  using ((select public.has_sigat_access()));

drop policy if exists "Admins can insert staff" on public.personal_administrativo;
create policy "Admins can insert staff"
  on public.personal_administrativo for insert to authenticated
  with check ((select public.is_sigat_admin()));

drop policy if exists "Admins can update staff" on public.personal_administrativo;
create policy "Admins can update staff"
  on public.personal_administrativo for update to authenticated
  using ((select public.is_sigat_admin()))
  with check ((select public.is_sigat_admin()));

drop policy if exists "Superadmins can delete staff" on public.personal_administrativo;
create policy "Superadmins can delete staff"
  on public.personal_administrativo for delete to authenticated
  using ((select public.is_sigat_superadmin()));

drop policy if exists "SIGAT accounts can read assignments" on public.asignaciones_equipo;
create policy "SIGAT accounts can read assignments"
  on public.asignaciones_equipo for select to authenticated
  using ((select public.has_sigat_access()));

revoke all on public.personal_administrativo from anon, authenticated;
revoke all on public.asignaciones_equipo from anon, authenticated;
grant select, insert, update, delete on public.personal_administrativo to authenticated;
grant select on public.asignaciones_equipo to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_administrativo'
  ) then
    alter publication supabase_realtime add table public.personal_administrativo;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'asignaciones_equipo'
  ) then
    alter publication supabase_realtime add table public.asignaciones_equipo;
  end if;
end;
$$;
