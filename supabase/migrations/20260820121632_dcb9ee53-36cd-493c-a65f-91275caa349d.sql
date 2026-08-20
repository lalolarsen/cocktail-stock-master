select cron.unschedule('weekly-purchasing-report') where exists (select 1 from cron.job where jobname = 'weekly-purchasing-report');

select cron.schedule(
  'weekly-purchasing-report',
  '0 13 * * 1',
  $$
  select net.http_post(
    url := 'https://rboiblptylnsgcciutrk.supabase.co/functions/v1/send-purchasing-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key' limit 1)
    )::jsonb,
    body := '{}'::jsonb
  );
  $$
);