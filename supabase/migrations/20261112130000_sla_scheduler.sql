-- =============================================================================
-- SLA scheduler: pg_cron calls GET /api/sla/check every 2 minutes via pg_net.
-- (Vercel Hobby allows only daily crons.)
--
-- The URL and the bearer secret are read from Supabase Vault at run time, so
-- neither is stored in this file or in the job definition. Create them once
-- (SQL editor, or scripts/set-sla-secrets — never commit the values):
--
--   select vault.create_secret('<https://your-app/api/sla/check>', 'sla_check_url');
--   select vault.create_secret('<same value as CRON_SECRET in the app>', 'cron_secret');
--
-- To change one later: select vault.update_secret(id, '<new value>') using the id
-- from vault.secrets where name = '…'.
--
-- Turn on only after the app version that understands per-ticket SLA policies
-- is deployed and CRON_SECRET is set in the app's environment.
-- Re-runnable.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_sla_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _url    text;
  _secret text;
begin
  select decrypted_secret into _url    from vault.decrypted_secrets where name = 'sla_check_url';
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'cron_secret';
  if _url is null or _secret is null then
    raise warning 'SLA check skipped: vault secrets sla_check_url / cron_secret are not set';
    return;
  end if;
  perform net.http_get(
    url := _url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || _secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.run_sla_check() from public, anon, authenticated;

-- Replace the old job (it had the secret written into its command), if any
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sla-check-every-2-min') then
    perform cron.unschedule('sla-check-every-2-min');
  end if;
end $$;

select cron.schedule('sla-check', '*/2 * * * *', 'select public.run_sla_check()');

-- Check:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select status_code, content::text from net._http_response order by created desc limit 5;
-- Stop:
--   select cron.unschedule('sla-check');
