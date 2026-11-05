-- ==========================================================================
-- Límites para las solicitudes de "restablecer contraseña".
--
-- La Edge Function "recuperar-contrasena" es pública (la usa quien olvidó su
-- contraseña), así que registra cada intento aquí para frenar abusos:
--   · 1 solicitud por minuto y 5 por hora para un mismo correo
--   · 20 por hora desde una misma IP
-- El correo se guarda como hash: la tabla no expone direcciones.
-- ==========================================================================

create table if not exists public.solicitudes_recuperacion (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip text,
  creada_en timestamptz not null default now()
);

create index if not exists solicitudes_recuperacion_email_idx
  on public.solicitudes_recuperacion (email_hash, creada_en desc);
create index if not exists solicitudes_recuperacion_ip_idx
  on public.solicitudes_recuperacion (ip, creada_en desc);

-- Sin políticas: ninguna cuenta de la app puede leerla ni escribirla.
alter table public.solicitudes_recuperacion enable row level security;
revoke all on public.solicitudes_recuperacion from anon, authenticated;

-- Registra un intento y dice si está permitido. Un bloqueo por correo y por
-- IP evita que se usen las funciones en paralelo para saltarse el límite.
create or replace function public.registrar_solicitud_recuperacion(p_email text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('recuperacion:' || v_hash));

  -- Limpieza: solo interesan los intentos del último día.
  delete from public.solicitudes_recuperacion where creada_en < now() - interval '1 day';

  if exists (
    select 1 from public.solicitudes_recuperacion
    where email_hash = v_hash and creada_en > now() - interval '1 minute'
  ) then
    return false;
  end if;

  if (select count(*) from public.solicitudes_recuperacion
      where email_hash = v_hash and creada_en > now() - interval '1 hour') >= 5 then
    return false;
  end if;

  if v_ip is not null and (select count(*) from public.solicitudes_recuperacion
      where ip = v_ip and creada_en > now() - interval '1 hour') >= 20 then
    return false;
  end if;

  insert into public.solicitudes_recuperacion (email_hash, ip) values (v_hash, v_ip);
  return true;
end;
$$;

-- Nombre para el saludo del correo; null si el correo no tiene cuenta SIGAT.
create or replace function public.nombre_para_recuperacion(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nombre from public.profiles where lower(email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function public.registrar_solicitud_recuperacion(text, text) from public, anon, authenticated;
revoke all on function public.nombre_para_recuperacion(text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.registrar_solicitud_recuperacion(text, text) to service_role;
    grant execute on function public.nombre_para_recuperacion(text) to service_role;
  end if;
end;
$$;
