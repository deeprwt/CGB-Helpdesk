-- ============================================================
-- CGB Helpdesk — Asset ↔ Organization
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- Requires: supabase-superadmin-migration.sql (organizations table)
-- ============================================================

-- 1. Link each asset to an organization
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_organization_id
  ON public.assets(organization_id);

-- 2. Backfill from the currently assigned user's email domain
UPDATE public.assets a
SET organization_id = o.id
FROM public.asset_assignments aa
JOIN public.users u         ON u.id = aa.user_id
JOIN public.organizations o ON o.domain = lower(split_part(u.email, '@', 2))
WHERE aa.asset_id = a.id
  AND aa.returned_at IS NULL
  AND a.organization_id IS NULL;

-- 3. Make the new column visible to the API immediately
NOTIFY pgrst, 'reload schema';
