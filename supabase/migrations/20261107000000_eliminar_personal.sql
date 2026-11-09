-- ==========================================================================
-- Eliminar personal administrativo para siempre.
-- Requiere 20261106000000_personal_administrativo.sql.
--
-- Borra a la persona junto con su historial de asignaciones. No se permite si
-- todavía tiene equipo asignado (primero hay que devolverlo). El historial
-- propio de cada equipo (tabla historial) no se toca.
-- ==========================================================================

create or replace function public.eliminar_personal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equipos text;
begin
  if not public.is_sigat_admin() then
    raise exception 'Solo un administrador puede eliminar personal.' using errcode = '42501';
  end if;

  select string_agg(equipo_id, ', ' order by equipo_id) into v_equipos
  from public.asignaciones_equipo
  where personal_id = p_id and fecha_fin is null;

  if v_equipos is not null then
    raise exception 'Todavía tiene equipo asignado (%). Devuélvelo antes de eliminar a la persona.', v_equipos;
  end if;

  delete from public.asignaciones_equipo where personal_id = p_id;
  delete from public.personal_administrativo where id = p_id;
  if not found then
    raise exception 'Esta persona ya no está registrada.';
  end if;
end;
$$;

revoke all on function public.eliminar_personal(uuid) from public, anon;
grant execute on function public.eliminar_personal(uuid) to authenticated;
