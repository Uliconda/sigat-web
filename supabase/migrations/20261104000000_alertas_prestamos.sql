-- ==========================================================================
-- Alertas de préstamos vencidos (se ejecutan en el servidor, no en el navegador).
--
-- La Edge Function "notificaciones-prestamos" llama a estas funciones con la
-- clave de servicio. Ninguna cuenta de la app puede ejecutarlas directamente.
-- ==========================================================================

-- Convierte fecha_prestamo (texto ISO u objeto serializado de Firestore) a
-- timestamptz. Devuelve null si el valor no es una fecha válida.
create or replace function public.fecha_prestamo_equipo(p_data jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_valor jsonb := p_data -> 'fecha_prestamo';
begin
  if v_valor is null or jsonb_typeof(v_valor) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v_valor) = 'object' and v_valor ? 'seconds' then
    return to_timestamp((v_valor ->> 'seconds')::double precision);
  end if;
  if jsonb_typeof(v_valor) = 'object' and v_valor ? '_seconds' then
    return to_timestamp((v_valor ->> '_seconds')::double precision);
  end if;
  return (p_data ->> 'fecha_prestamo')::timestamptz;
exception
  when others then
    return null;
end;
$$;

-- Marca como "No responde" los préstamos que superan el límite de horas y los
-- devuelve para que se envíe el correo. El UPDATE ... RETURNING es atómico:
-- si dos ejecuciones coinciden, cada equipo lo reclama solo una de ellas.
create or replace function public.reclamar_prestamos_vencidos(
  p_horas integer default 48,
  p_categorias_excluidas text[] default array['ADMINISTRATIVOS']
)
returns table (id text, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_horas is null or p_horas < 1 then
    raise exception 'El límite de horas debe ser mayor a cero.';
  end if;

  return query
  update public.equipos as e
  set data = e.data || jsonb_build_object('estado', 'No responde', 'alerta_enviada', true)
  where upper(btrim(coalesce(e.data ->> 'estado', ''))) = 'PRESTADO'
    and coalesce(e.data -> 'alerta_enviada', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(e.data -> 'isTemplate', 'false'::jsonb) <> 'true'::jsonb
    and upper(btrim(coalesce(e.data ->> 'categoria', ''))) <> all (
      select upper(btrim(c)) from unnest(coalesce(p_categorias_excluidas, '{}')) as c
    )
    and public.fecha_prestamo_equipo(e.data) <= now() - make_interval(hours => p_horas)
  returning e.id, e.data;
end;
$$;

-- Deshace la marca si el correo no se pudo enviar, para reintentarlo después.
-- Solo actúa si nadie cambió el equipo mientras tanto.
create or replace function public.liberar_alerta_prestamo(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.equipos
  set data = data || jsonb_build_object('estado', 'Prestado', 'alerta_enviada', false)
  where equipos.id = p_id
    and data ->> 'estado' = 'No responde'
    and data -> 'alerta_enviada' = 'true'::jsonb;
  return found;
end;
$$;

revoke all on function public.fecha_prestamo_equipo(jsonb) from public, anon, authenticated;
revoke all on function public.reclamar_prestamos_vencidos(integer, text[]) from public, anon, authenticated;
revoke all on function public.liberar_alerta_prestamo(text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.fecha_prestamo_equipo(jsonb) to service_role;
    grant execute on function public.reclamar_prestamos_vencidos(integer, text[]) to service_role;
    grant execute on function public.liberar_alerta_prestamo(text) to service_role;
  end if;
end;
$$;

-- Cada préstamo nuevo empieza sin alerta enviada. Se reinicia al devolver el
-- equipo o al prestarlo desde "Disponible", lo haga la web o la app móvil.
create or replace function public.reiniciar_alerta_prestamo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_antes text := upper(btrim(coalesce(old.data ->> 'estado', '')));
  v_ahora text := upper(btrim(coalesce(new.data ->> 'estado', '')));
begin
  if v_ahora is distinct from v_antes
    and (v_ahora = 'DISPONIBLE' or (v_ahora = 'PRESTADO' and v_antes = 'DISPONIBLE'))
  then
    new.data := new.data || jsonb_build_object('alerta_enviada', false);
  end if;
  return new;
end;
$$;

revoke all on function public.reiniciar_alerta_prestamo() from public, anon, authenticated;

drop trigger if exists equipos_reiniciar_alerta on public.equipos;
create trigger equipos_reiniciar_alerta
  before update on public.equipos
  for each row execute function public.reiniciar_alerta_prestamo();
