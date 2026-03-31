-- =============================================
-- Email Verification Migration
-- =============================================

-- 1. Add verification columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ;

-- 2. Mark all existing users as verified (they signed up before this feature)
UPDATE public.users SET is_verified = true WHERE is_verified = false;

-- 3. Update the trigger to set is_verified = false for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  INSERT INTO public.users (id, email, full_name, role, is_verified)
  VALUES (
    NEW.id,
    NEW.email,
    TRIM(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', '') || ' ' ||
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
    ),
    'user',
    false
  );

  SELECT id INTO _org_id
  FROM public.organizations
  WHERE domain = lower(split_part(NEW.email, '@', 2))
    AND status = 'active'
  LIMIT 1;

  IF _org_id IS NOT NULL THEN
    INSERT INTO public.user_organization_access (user_id, organization_id)
    VALUES (NEW.id, _org_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_users_verification_token
  ON public.users (verification_token)
  WHERE verification_token IS NOT NULL;
