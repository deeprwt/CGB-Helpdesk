-- =============================================================================
-- CGB Helpdesk → multi-tenant ITSM: tenancy foundation
--
-- What this does
--   1. Adds `tenants`. Every existing row goes into the tenant "CGB Solutions"
--      (slug `cgbsolutions`).
--   2. Adds `tenant_id` (NOT NULL) to every application table.
--   3. Turns `organizations` into client companies inside a tenant (a label, not
--      an access boundary). Email domain no longer decides who sees what.
--   4. Replaces ALL row level security policies on the application tables with
--      tenant-scoped ones, and removes every browser write except a person's
--      own profile fields and marking their own notifications read. All other
--      writes go through the server (service role) API routes.
--   5. Replaces the sign-up trigger: accounts are created by the server only.
--
-- Safe to re-run. Runs in one transaction: if anything fails nothing changes.
-- Apply AFTER the legacy scripts (see supabase/migrations/README.md) and
-- deploy the matching app version at the same time.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tenants
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

insert into public.tenants (name, slug)
values ('CGB Solutions', 'cgbsolutions')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 2. tenant_id on every application table, backfilled to CGB Solutions
-- -----------------------------------------------------------------------------
do $$
declare
  t   text;
  cgb uuid;
begin
  select id into cgb from public.tenants where slug = 'cgbsolutions';

  foreach t in array array[
    'users', 'organizations',
    'tickets', 'ticket_messages', 'ticket_attachments', 'ticket_activity', 'ticket_assignments',
    'notifications',
    'assets', 'asset_details', 'asset_assignments', 'asset_tickets'
  ] loop
    execute format(
      'alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete restrict', t);
    execute format('update public.%I set tenant_id = %L where tenant_id is null', t, cgb);
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format('create index if not exists %I on public.%I (tenant_id)', 'idx_' || t || '_tenant', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Roles: one spelling, enforced by the database
-- -----------------------------------------------------------------------------
update public.users set role = 'superadmin' where role = 'super_admin';
update public.users set role = 'user' where role is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table public.users
      add constraint users_role_check
      check (role in ('user', 'engineer', 'admin', 'superadmin')) not valid;
  end if;
  begin
    alter table public.users validate constraint users_role_check;
  exception when check_violation then
    raise notice 'users_role_check NOT validated: some users have an unknown role. Fix them, then run: alter table public.users validate constraint users_role_check;';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Organizations become client companies inside a tenant
-- -----------------------------------------------------------------------------
alter table public.organizations drop constraint if exists organizations_domain_key;
alter table public.organizations alter column domain drop not null;

do $$
begin
  create unique index if not exists organizations_tenant_name_key
    on public.organizations (tenant_id, lower(name));
exception when unique_violation then
  raise notice 'organizations_tenant_name_key NOT created: two companies in one tenant share a name. Rename one and re-run.';
end $$;

-- Each person may be linked to the client company they work for (label only).
alter table public.users
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_users_organization on public.users (organization_id);

-- One-time data mapping from the old email-domain model. Not used for access.
update public.users u
set organization_id = o.id
from public.organizations o
where u.organization_id is null
  and o.tenant_id = u.tenant_id
  and o.domain is not null
  and lower(o.domain) = lower(split_part(u.email, '@', 2));

-- `user_organization_access` (cross-domain grants) is retired: inside a tenant
-- there is no isolation between companies. Kept, unreadable, for reference.

-- -----------------------------------------------------------------------------
-- 5. Asset codes: unique per tenant (was: globally)
-- -----------------------------------------------------------------------------
drop index if exists public.assets_asset_code_unique;

do $$
begin
  if exists (
    select 1 from public.assets
    where asset_code is not null
    group by tenant_id, upper(trim(asset_code))
    having count(*) > 1
  ) then
    raise notice 'assets_tenant_code_unique NOT created: duplicate asset codes exist. See supabase/migration_unique_asset_code.sql step 1, fix them, then re-run.';
  else
    create unique index if not exists assets_tenant_code_unique
      on public.assets (tenant_id, upper(trim(asset_code)));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Who is asking (used by the policies below)
--    SECURITY DEFINER so they can read `users` without tripping its own RLS.
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  -- A suspended tenant's people see nothing; a super admin always keeps access.
  select u.tenant_id
  from public.users u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid()
    and (t.status = 'active' or u.role = 'superadmin')
$$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'superadmin' from public.users where id = auth.uid()), false)
$$;

create or replace function public.is_tenant_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('engineer', 'admin', 'superadmin') from public.users where id = auth.uid()),
    false)
$$;

revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.is_superadmin()     from public, anon;
revoke all on function public.is_tenant_staff()   from public, anon;
grant execute on function public.current_tenant_id() to authenticated, service_role;
grant execute on function public.is_superadmin()     to authenticated, service_role;
grant execute on function public.is_tenant_staff()   to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Drop EVERY existing policy on the application tables (including any made
--    by hand in the dashboard), then enable RLS.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  app_tables text[] := array[
    'tenants', 'users', 'organizations', 'user_organization_access',
    'tickets', 'ticket_messages', 'ticket_attachments', 'ticket_activity', 'ticket_assignments',
    'notifications',
    'assets', 'asset_details', 'asset_assignments', 'asset_tickets',
    'askmira_links', 'askmira_connect_codes', 'askmira_people', 'askmira_used_tokens'
  ];
  t text;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = any(app_tables)
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  foreach t in array app_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      -- The browser (anon / authenticated) may only read; writes go through the server.
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- Read access for signed-in users (rows are filtered by the policies below)
grant select on public.tenants, public.users, public.organizations,
                public.tickets, public.ticket_messages, public.ticket_attachments,
                public.ticket_activity, public.ticket_assignments, public.notifications,
                public.assets, public.asset_details, public.asset_assignments, public.asset_tickets
  to authenticated;

-- Server-only tables: not even readable from the browser
revoke select on public.user_organization_access from authenticated;
do $$
begin
  if to_regclass('public.askmira_links') is not null then
    revoke select on public.askmira_links, public.askmira_connect_codes,
                     public.askmira_people, public.askmira_used_tokens from authenticated;
  end if;
  -- Leftover table created in the dashboard: unused by the app, RLS was off and
  -- anon could write to it. Server-only from now on.
  if to_regclass('public.asset_activity_log') is not null then
    alter table public.asset_activity_log enable row level security;
    revoke all on public.asset_activity_log from anon, authenticated;
  end if;
end $$;

-- The only browser writes left: your own profile fields, and "mark as read".
grant update (full_name, phone, employee_id, designation, department, position, manager,
              present_address, permanent_address, city, postal_code, country,
              avatar_url, last_seen_at)
  on public.users to authenticated;
grant update (is_read) on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Policies
--    (select fn()) is evaluated once per statement instead of once per row.
-- -----------------------------------------------------------------------------

-- tenants: your own; super admin all
create policy tenants_select on public.tenants
  for select to authenticated
  using ((select public.is_superadmin()) or id = (select public.current_tenant_id()));

-- users: everyone in your tenant (names in chats, pickers); super admin all
create policy users_select on public.users
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid() and (select public.current_tenant_id()) is not null)
  with check (id = auth.uid());

-- organizations (client companies)
create policy organizations_select on public.organizations
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

-- tickets: the IT team sees its tenant's tickets; a user sees the ones they raised
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.current_tenant_id())
      and ((select public.is_tenant_staff()) or requester_id = auth.uid())
    )
  );

-- ticket children: visible exactly when the ticket is (tickets' own RLS applies inside)
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_messages.ticket_id));

create policy ticket_attachments_select on public.ticket_attachments
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_attachments.ticket_id));

create policy ticket_activity_select on public.ticket_activity
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_activity.ticket_id));

create policy ticket_assignments_select on public.ticket_assignments
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_assignments.ticket_id));

create policy asset_tickets_select on public.asset_tickets
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = asset_tickets.ticket_id));

-- notifications: your own only
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- asset assignments: the IT team of the tenant, or the person holding it
create policy asset_assignments_select on public.asset_assignments
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.current_tenant_id())
      and ((select public.is_tenant_staff()) or user_id = auth.uid())
    )
  );

-- assets: the IT team of the tenant, or a user for the assets assigned to them
create policy assets_select on public.assets
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_tenant_staff())
        or exists (
          select 1 from public.asset_assignments aa
          where aa.asset_id = assets.id and aa.user_id = auth.uid() and aa.returned_at is null
        )
      )
    )
  );

create policy asset_details_select on public.asset_details
  for select to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_details.asset_id));

-- -----------------------------------------------------------------------------
-- 9. Sign-up trigger: profiles are made only for accounts the server created
--    (it puts tenant_id and role in app_metadata, which browsers cannot set).
--    A self-made account gets no profile, so it can sign in to nothing.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _tenant uuid;
  _role   text;
  _name   text;
begin
  begin
    _tenant := nullif(new.raw_app_meta_data ->> 'tenant_id', '')::uuid;
  exception when others then
    _tenant := null;
  end;

  if _tenant is null then
    return new;
  end if;

  _role := coalesce(new.raw_app_meta_data ->> 'role', 'user');
  if _role not in ('user', 'engineer', 'admin') then
    _role := 'user';
  end if;

  _name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
                coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.users (id, email, full_name, role, tenant_id)
  values (new.id, lower(new.email), _name, _role, _tenant)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Make the new columns and tables visible to the API immediately
notify pgrst, 'reload schema';

commit;

-- -----------------------------------------------------------------------------
-- After running, check:
--   select slug, status from public.tenants;
--   select count(*) from public.users where tenant_id is null;          -- 0
--   select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2;
-- Also, in Supabase → Authentication → Sign In / Providers:
--   turn OFF "Allow new users to sign up" and the Google provider.
-- -----------------------------------------------------------------------------
