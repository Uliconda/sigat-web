-- ==========================================================================
-- Programa la revisión de préstamos vencidos cada hora.
-- Ejecutar UNA vez en Supabase Dashboard > SQL Editor, después de desplegar
-- la función "notificaciones-prestamos" y configurar su secreto CRON_SECRET.
--
-- Antes de ejecutarlo, reemplaza:
--   <project-ref>  → el identificador de tu proyecto (xxxx.supabase.co)
--   <cron-secret>  → el MISMO valor que pusiste en el secreto CRON_SECRET
-- ==========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Los valores se guardan cifrados en Vault, no en el texto del cron.
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notificaciones-prestamos', 'sigat_alertas_url');
select vault.create_secret('<cron-secret>', 'sigat_cron_secret');

select cron.schedule(
  'sigat-alertas-prestamos',
  '0 * * * *', -- cada hora, en el minuto 0
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sigat_alertas_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sigat_cron_secret')
    ),
    body := '{"action":"revisar-vencidos"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Para revisar ejecuciones:  select * from cron.job_run_details order by start_time desc limit 10;
-- Para desactivarlo:          select cron.unschedule('sigat-alertas-prestamos');
