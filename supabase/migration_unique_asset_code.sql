-- ============================================================
-- CGB Helpdesk — Unique asset codes
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- The app already skips duplicate asset codes on import and blocks
-- them in the Add/Edit form, but those checks only see the assets the
-- signed-in user can access. This index makes the database itself
-- reject a duplicate, whoever inserts it.
--
-- Codes are compared ignoring case and surrounding spaces, so
-- "lap-001 " and "LAP-001" count as the same code.
-- ============================================================

-- 1. Check for existing duplicates FIRST.
--    If this returns rows, fix or delete them before running step 2,
--    otherwise step 2 will fail.
SELECT upper(trim(asset_code)) AS asset_code_key,
       count(*)                AS copies,
       array_agg(id)           AS asset_ids
FROM public.assets
WHERE asset_code IS NOT NULL
GROUP BY 1
HAVING count(*) > 1
ORDER BY copies DESC;

-- 2. Enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS assets_asset_code_unique
  ON public.assets (upper(trim(asset_code)));
