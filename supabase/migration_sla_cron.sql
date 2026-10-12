-- ============================================================
-- CGB Helpdesk — SLA check scheduler (replaces Vercel Cron)
-- Vercel Hobby only allows once-per-day crons, so Supabase
-- pg_cron calls /api/sla/check every 2 minutes instead.
--
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- Before running: replace YOUR_CRON_SECRET with the same value
-- set as CRON_SECRET in Vercel → Project → Settings → Environment Variables.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Re-running with the same job name updates the existing job
SELECT cron.schedule(
  'sla-check-every-2-min',
  '*/2 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://cgb-helpdesk.vercel.app/api/sla/check',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it is running:
--   SELECT * FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
--
-- Stop it:
--   SELECT cron.unschedule('sla-check-every-2-min');
