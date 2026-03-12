-- ============================================================
-- CGB Helpdesk — Super Admin & Multi-Organization Migration
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ┌──────────────────────────────────────────────────────┐
-- │ 1. Organizations table (domain whitelist)            │
-- └──────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ┌──────────────────────────────────────────────────────┐
-- │ 2. User ↔ Organization access mapping                │
-- │    Allows admins to access multiple organizations    │
-- └──────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS user_organization_access (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_uoa_user_id ON user_organization_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uoa_org_id  ON user_organization_access(organization_id);

-- ┌──────────────────────────────────────────────────────┐
-- │ 3. Backfill organizations from existing user emails  │
-- └──────────────────────────────────────────────────────┘

INSERT INTO organizations (name, domain)
SELECT DISTINCT
  -- Generate a readable name from domain (e.g. "cgbindia.com" → "Cgbindia")
  initcap(
    replace(
      replace(
        split_part(email, '@', 2),
        '.com', ''
      ),
      '.', ' '
    )
  ) AS name,
  lower(split_part(email, '@', 2)) AS domain
FROM public.users
WHERE email IS NOT NULL
  AND email LIKE '%@%'
ON CONFLICT (domain) DO NOTHING;

-- ┌──────────────────────────────────────────────────────┐
-- │ 4. Backfill user_organization_access for all users   │
-- │    (every user gets access to their own org)         │
-- └──────────────────────────────────────────────────────┘

INSERT INTO user_organization_access (user_id, organization_id)
SELECT u.id, o.id
FROM public.users u
JOIN organizations o ON lower(split_part(u.email, '@', 2)) = o.domain
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- ┌──────────────────────────────────────────────────────┐
-- │ 5. Update handle_new_user trigger                    │
-- │    Auto-links new users to their organization        │
-- └──────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  -- Create user row
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', '') || ' ' ||
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    'user'
  );

  -- Auto-link to their organization (if whitelisted & active)
  SELECT id INTO _org_id
  FROM organizations
  WHERE domain = lower(split_part(NEW.email, '@', 2))
    AND status = 'active'
  LIMIT 1;

  IF _org_id IS NOT NULL THEN
    INSERT INTO user_organization_access (user_id, organization_id)
    VALUES (NEW.id, _org_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ┌──────────────────────────────────────────────────────┐
-- │ 6. Enable Realtime for new tables                    │
-- └──────────────────────────────────────────────────────┘

ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE user_organization_access;

-- ┌──────────────────────────────────────────────────────┐
-- │ 7. MANUAL STEP — Set your first Super Admin          │
-- │    Replace <USER_EMAIL> with your email address      │
-- └──────────────────────────────────────────────────────┘

-- UPDATE public.users
-- SET role = 'super_admin'
-- WHERE email = '<YOUR_EMAIL_HERE>';

-- ┌──────────────────────────────────────────────────────┐
-- │ 8. (Optional) Rename backfilled organization names   │
-- │    Update generated names to proper business names   │
-- └──────────────────────────────────────────────────────┘

-- UPDATE organizations SET name = 'CGB India'         WHERE domain = 'cgbindia.com';
-- UPDATE organizations SET name = 'Artbox Solutions'  WHERE domain = 'artboxsolutions.com';
