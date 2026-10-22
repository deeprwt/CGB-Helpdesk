-- ============================================================
-- CGB Helpdesk — Connection with AskMira (the HRMS)
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- Requires: supabase-superadmin-migration.sql (organizations table)
--
-- An admin of a workspace in AskMira presses Connect there (Settings →
-- Connectors), signs in here and presses Allow for one organization. AskMira
-- then sends that company's people across, opens the helpdesk for them
-- without a second password, and shows their tickets and assets in the HRMS.
--
-- Only the server (service role) reads or writes these tables: row level
-- security is on and there are no policies, so the browser never sees them.
-- ============================================================

-- 1. Which AskMira workspace each organization is connected to.
--    The connection's secret is not stored: it is derived on the server from
--    secret_nonce (src/lib/askmira/link.ts), so this table alone opens nothing.
CREATE TABLE IF NOT EXISTS public.askmira_links (
  organization_id    UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  askmira_tenant_id  UUID NOT NULL UNIQUE,
  askmira_name       TEXT,
  askmira_origin     TEXT,
  secret_nonce       TEXT NOT NULL,
  connected_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. One-time codes made by Allow, swapped by AskMira's server for the secret.
--    Only a hash of the code is kept; each lives five minutes and works once.
CREATE TABLE IF NOT EXISTS public.askmira_connect_codes (
  code_hash          TEXT PRIMARY KEY,
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  askmira_tenant_id  UUID NOT NULL,
  askmira_name       TEXT NOT NULL,
  askmira_origin     TEXT NOT NULL,
  challenge          TEXT NOT NULL,
  approved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ
);

-- 3. The people AskMira manages here. Only these are ever switched off when
--    they leave the company in AskMira; people added here directly never are.
--    role_before_grant: when AskMira made someone an admin here (they are HR
--    in AskMira), the role they had before, given back if they stop being HR.
CREATE TABLE IF NOT EXISTS public.askmira_people (
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  askmira_user_id    TEXT,
  role_before_grant  TEXT,
  deactivated_at     TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_askmira_people_user ON public.askmira_people(user_id);

-- 4. Sign-in links and actions from AskMira already used: each works once,
--    so a captured one can't sign anyone in again or raise a ticket twice.
CREATE TABLE IF NOT EXISTS public.askmira_used_tokens (
  jti         TEXT PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL
);

-- 5. Server only.
ALTER TABLE public.askmira_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.askmira_connect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.askmira_people        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.askmira_used_tokens   ENABLE ROW LEVEL SECURITY;

-- 6. Make the new tables visible to the API immediately
NOTIFY pgrst, 'reload schema';
