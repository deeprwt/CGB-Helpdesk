-- =============================================================================
-- CGB HELPDESK — MULTI-TENANT MIGRATION
-- Run this entire script once in your Supabase SQL Editor.
-- Each section is idempotent (safe to re-run).
-- =============================================================================


-- =============================================================================
-- SECTION 1: ADD org_domain COLUMN TO ALL RELEVANT TABLES
-- =============================================================================

ALTER TABLE public.users             ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.tickets           ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.ticket_messages   ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.ticket_attachments ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.assets            ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.asset_details     ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.asset_assignments ADD COLUMN IF NOT EXISTS org_domain TEXT;
ALTER TABLE public.asset_tickets     ADD COLUMN IF NOT EXISTS org_domain TEXT;


-- =============================================================================
-- SECTION 2: BACKFILL EXISTING DATA
-- =============================================================================

-- 2a. users — derive from their own email
UPDATE public.users
SET org_domain = lower(split_part(email, '@', 2))
WHERE email IS NOT NULL
  AND org_domain IS NULL;

-- 2b. tickets — derive from the requester's org_domain
UPDATE public.tickets t
SET org_domain = u.org_domain
FROM public.users u
WHERE u.id = t.requester_id
  AND t.org_domain IS NULL;

-- 2c. ticket_messages — derive from the sender's org_domain
UPDATE public.ticket_messages tm
SET org_domain = u.org_domain
FROM public.users u
WHERE u.id = tm.sender_id
  AND tm.org_domain IS NULL;

-- 2d. ticket_attachments — derive from the parent ticket's org_domain
UPDATE public.ticket_attachments ta
SET org_domain = t.org_domain
FROM public.tickets t
WHERE t.id = ta.ticket_id
  AND ta.org_domain IS NULL;

-- 2e. assets — no creator_id column exists; backfill via asset_assignments if available
UPDATE public.assets a
SET org_domain = u.org_domain
FROM public.asset_assignments aa
JOIN public.users u ON u.id = aa.user_id
WHERE aa.asset_id = a.id
  AND a.org_domain IS NULL;

-- 2f. asset_details — derive from parent asset's org_domain
UPDATE public.asset_details ad
SET org_domain = a.org_domain
FROM public.assets a
WHERE a.id = ad.asset_id
  AND ad.org_domain IS NULL;

-- 2g. asset_assignments — derive from the assigned user's org_domain
UPDATE public.asset_assignments aa
SET org_domain = u.org_domain
FROM public.users u
WHERE u.id = aa.user_id
  AND aa.org_domain IS NULL;

-- 2h. asset_tickets — derive from the parent ticket's org_domain
UPDATE public.asset_tickets aticket
SET org_domain = t.org_domain
FROM public.tickets t
WHERE t.id = aticket.ticket_id
  AND aticket.org_domain IS NULL;


-- =============================================================================
-- SECTION 3: HELPER FUNCTION (security definer — runs as postgres)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_org_domain()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT org_domain FROM public.users WHERE id = auth.uid()
$$;


-- =============================================================================
-- SECTION 4: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =============================================================================

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_tickets     ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 5: RLS POLICIES
-- Drop existing policies first to allow idempotent re-runs.
-- =============================================================================

-- ─── users ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_users_select"  ON public.users;
DROP POLICY IF EXISTS "mt_users_insert"  ON public.users;
DROP POLICY IF EXISTS "mt_users_update"  ON public.users;
DROP POLICY IF EXISTS "mt_users_delete"  ON public.users;

-- SELECT: see only users in your org
CREATE POLICY "mt_users_select" ON public.users
  FOR SELECT USING (org_domain = get_my_org_domain());

-- INSERT: new row's org_domain must match email domain (row doesn't exist yet
--         so get_my_org_domain() would return NULL for brand-new users)
CREATE POLICY "mt_users_insert" ON public.users
  FOR INSERT WITH CHECK (
    org_domain = lower(split_part(email, '@', 2))
    AND id = auth.uid()
  );

-- UPDATE: can only update rows within your own org
CREATE POLICY "mt_users_update" ON public.users
  FOR UPDATE USING (org_domain = get_my_org_domain());

-- DELETE: can only delete rows within your own org
CREATE POLICY "mt_users_delete" ON public.users
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── tickets ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_tickets_select" ON public.tickets;
DROP POLICY IF EXISTS "mt_tickets_insert" ON public.tickets;
DROP POLICY IF EXISTS "mt_tickets_update" ON public.tickets;
DROP POLICY IF EXISTS "mt_tickets_delete" ON public.tickets;

CREATE POLICY "mt_tickets_select" ON public.tickets
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_tickets_insert" ON public.tickets
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_tickets_update" ON public.tickets
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_tickets_delete" ON public.tickets
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── ticket_messages ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_ticket_messages_select" ON public.ticket_messages;
DROP POLICY IF EXISTS "mt_ticket_messages_insert" ON public.ticket_messages;
DROP POLICY IF EXISTS "mt_ticket_messages_update" ON public.ticket_messages;
DROP POLICY IF EXISTS "mt_ticket_messages_delete" ON public.ticket_messages;

CREATE POLICY "mt_ticket_messages_select" ON public.ticket_messages
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_messages_insert" ON public.ticket_messages
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_messages_update" ON public.ticket_messages
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_messages_delete" ON public.ticket_messages
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── ticket_attachments ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_ticket_attachments_select" ON public.ticket_attachments;
DROP POLICY IF EXISTS "mt_ticket_attachments_insert" ON public.ticket_attachments;
DROP POLICY IF EXISTS "mt_ticket_attachments_update" ON public.ticket_attachments;
DROP POLICY IF EXISTS "mt_ticket_attachments_delete" ON public.ticket_attachments;

CREATE POLICY "mt_ticket_attachments_select" ON public.ticket_attachments
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_attachments_insert" ON public.ticket_attachments
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_attachments_update" ON public.ticket_attachments
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_ticket_attachments_delete" ON public.ticket_attachments
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── assets ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_assets_select" ON public.assets;
DROP POLICY IF EXISTS "mt_assets_insert" ON public.assets;
DROP POLICY IF EXISTS "mt_assets_update" ON public.assets;
DROP POLICY IF EXISTS "mt_assets_delete" ON public.assets;

CREATE POLICY "mt_assets_select" ON public.assets
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_assets_insert" ON public.assets
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_assets_update" ON public.assets
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_assets_delete" ON public.assets
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── asset_details ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_asset_details_select" ON public.asset_details;
DROP POLICY IF EXISTS "mt_asset_details_insert" ON public.asset_details;
DROP POLICY IF EXISTS "mt_asset_details_update" ON public.asset_details;
DROP POLICY IF EXISTS "mt_asset_details_delete" ON public.asset_details;

CREATE POLICY "mt_asset_details_select" ON public.asset_details
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_details_insert" ON public.asset_details
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_details_update" ON public.asset_details
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_details_delete" ON public.asset_details
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── asset_assignments ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_asset_assignments_select" ON public.asset_assignments;
DROP POLICY IF EXISTS "mt_asset_assignments_insert" ON public.asset_assignments;
DROP POLICY IF EXISTS "mt_asset_assignments_update" ON public.asset_assignments;
DROP POLICY IF EXISTS "mt_asset_assignments_delete" ON public.asset_assignments;

CREATE POLICY "mt_asset_assignments_select" ON public.asset_assignments
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_assignments_insert" ON public.asset_assignments
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_assignments_update" ON public.asset_assignments
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_assignments_delete" ON public.asset_assignments
  FOR DELETE USING (org_domain = get_my_org_domain());


-- ─── asset_tickets ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mt_asset_tickets_select" ON public.asset_tickets;
DROP POLICY IF EXISTS "mt_asset_tickets_insert" ON public.asset_tickets;
DROP POLICY IF EXISTS "mt_asset_tickets_update" ON public.asset_tickets;
DROP POLICY IF EXISTS "mt_asset_tickets_delete" ON public.asset_tickets;

CREATE POLICY "mt_asset_tickets_select" ON public.asset_tickets
  FOR SELECT USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_tickets_insert" ON public.asset_tickets
  FOR INSERT WITH CHECK (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_tickets_update" ON public.asset_tickets
  FOR UPDATE USING (org_domain = get_my_org_domain());

CREATE POLICY "mt_asset_tickets_delete" ON public.asset_tickets
  FOR DELETE USING (org_domain = get_my_org_domain());


-- =============================================================================
-- SECTION 6: AUTH TRIGGER — auto-populate users table on signup
-- Replace the existing handle_new_user function body to include org_domain.
-- If your project uses a different trigger name, update accordingly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name TEXT;
BEGIN
  -- Build full_name from metadata (handles both "full_name" and "first_name"+"last_name")
  _full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    trim(
      COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' ||
      COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    )
  );

  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    org_domain
  )
  VALUES (
    NEW.id,
    NEW.email,
    _full_name,
    'user',
    lower(split_part(NEW.email, '@', 2))
  )
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        org_domain = EXCLUDED.org_domain;

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (create if missing, no-op if already there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;


-- =============================================================================
-- SECTION 7: ENFORCE NOT NULL AFTER BACKFILL
-- Run this only after confirming all rows have been backfilled (no NULLs).
-- Comment out if you have rows that genuinely have no org_domain yet.
-- =============================================================================

-- ALTER TABLE public.users             ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.tickets           ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.ticket_messages   ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.ticket_attachments ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.assets            ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.asset_details     ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.asset_assignments ALTER COLUMN org_domain SET NOT NULL;
-- ALTER TABLE public.asset_tickets     ALTER COLUMN org_domain SET NOT NULL;


-- =============================================================================
-- DONE. Verify with:
--   SELECT id, email, org_domain FROM public.users LIMIT 20;
--   SELECT id, org_domain FROM public.tickets LIMIT 20;
-- =============================================================================
