-- =============================================================================
-- ITSM core (round 2)
--
--   * Record types: incident, service request, problem, change
--   * Per-tenant, per-type numbering: INC0001001, REQ…, PRB…, CHG…
--   * Per-tenant categories (two levels), priority matrix (impact × urgency),
--     SLA policies, business hours and holidays
--   * Problem and change fields, links between records
--
-- Additive only: the app version from before this file keeps working.
-- Existing data: every ticket becomes an incident and gets a number in the
-- order it was raised. CGB Solutions gets today's categories, and SLA policies
-- that match today's behaviour (respond in 15 min, resolve in 6 h, 24×7).
--
-- Re-runnable. One transaction.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Tickets: type, number, classification, problem and change fields
-- -----------------------------------------------------------------------------
alter table public.tickets add column if not exists ticket_type text not null default 'incident';
alter table public.tickets add column if not exists number text;
-- problem
alter table public.tickets add column if not exists root_cause text;
alter table public.tickets add column if not exists workaround text;
alter table public.tickets add column if not exists known_error boolean not null default false;
-- change
alter table public.tickets add column if not exists change_type text;
alter table public.tickets add column if not exists risk text;
alter table public.tickets add column if not exists planned_start timestamptz;
alter table public.tickets add column if not exists planned_end timestamptz;
alter table public.tickets add column if not exists implementation_plan text;
alter table public.tickets add column if not exists backout_plan text;
-- whether the SLA deadlines count business hours only (copied from the policy)
alter table public.tickets add column if not exists sla_business_hours boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_ticket_type_check') then
    alter table public.tickets add constraint tickets_ticket_type_check
      check (ticket_type in ('incident', 'service_request', 'problem', 'change'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_change_type_check') then
    alter table public.tickets add constraint tickets_change_type_check
      check (change_type is null or change_type in ('standard', 'normal', 'emergency'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_risk_check') then
    alter table public.tickets add constraint tickets_risk_check
      check (risk is null or risk in ('low', 'medium', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_planned_window_check') then
    alter table public.tickets add constraint tickets_planned_window_check
      check (planned_start is null or planned_end is null or planned_end > planned_start);
  end if;
end $$;

-- Impact / urgency were free text and are empty in production: keep only known values
update public.tickets set urgency = null where urgency is not null and urgency not in ('low', 'medium', 'high');
update public.tickets set impact  = null where impact  is not null and impact  not in ('low', 'medium', 'high');
update public.tickets set priority = 'medium'
  where priority is null or priority not in ('low', 'medium', 'high', 'critical');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_priority_check') then
    alter table public.tickets add constraint tickets_priority_check
      check (priority in ('low', 'medium', 'high', 'critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_impact_check') then
    alter table public.tickets add constraint tickets_impact_check
      check (impact is null or impact in ('low', 'medium', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_urgency_check') then
    alter table public.tickets add constraint tickets_urgency_check
      check (urgency is null or urgency in ('low', 'medium', 'high'));
  end if;
end $$;

create index if not exists tickets_tenant_type_idx on public.tickets (tenant_id, ticket_type, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Numbering: one counter per tenant and record type, handed out by a trigger
--    so every insert path (app, AskMira, SQL) gets a number.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_counters (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  record_type text not null,
  last_value  bigint not null default 1000,
  primary key (tenant_id, record_type)
);

create or replace function public.ticket_number_prefix(_type text)
returns text
language sql
immutable
as $$
  select case _type
    when 'service_request' then 'REQ'
    when 'problem'         then 'PRB'
    when 'change'          then 'CHG'
    else 'INC'
  end
$$;

create or replace function public.assign_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _n bigint;
begin
  if tg_op = 'INSERT' and new.number is not null then
    return new;
  end if;
  -- A record that changes type gets a number of its new type (INC… → REQ…)
  if tg_op = 'UPDATE' and new.ticket_type is not distinct from old.ticket_type then
    return new;
  end if;
  insert into public.tenant_counters as c (tenant_id, record_type, last_value)
  values (new.tenant_id, new.ticket_type, 1001)
  on conflict (tenant_id, record_type)
    do update set last_value = c.last_value + 1
  returning last_value into _n;
  new.number := public.ticket_number_prefix(new.ticket_type) || lpad(_n::text, 7, '0');
  return new;
end;
$$;

revoke all on function public.assign_ticket_number() from public, anon, authenticated;

drop trigger if exists tickets_assign_number on public.tickets;
create trigger tickets_assign_number
  before insert or update of ticket_type on public.tickets
  for each row execute function public.assign_ticket_number();

-- Number existing tickets in the order they were raised
do $$
declare
  r record;
  _n bigint;
begin
  for r in
    select id, tenant_id, ticket_type from public.tickets
    where number is null
    order by created_at nulls first, id
  loop
    insert into public.tenant_counters as c (tenant_id, record_type, last_value)
    values (r.tenant_id, r.ticket_type, 1001)
    on conflict (tenant_id, record_type) do update set last_value = c.last_value + 1
    returning last_value into _n;
    update public.tickets
      set number = public.ticket_number_prefix(r.ticket_type) || lpad(_n::text, 7, '0')
      where id = r.id;
  end loop;
end $$;

-- Numbers are unique within a tenant
create unique index if not exists tickets_tenant_number_unique on public.tickets (tenant_id, number);

-- -----------------------------------------------------------------------------
-- 3. Categories (two levels: a category and its sub-categories)
--    ticket_types null = offered for every record type.
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  parent_id    uuid references public.ticket_categories(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 100),
  ticket_types text[],
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (ticket_types is null or ticket_types <@ array['incident', 'service_request', 'problem', 'change']::text[])
);

create unique index if not exists ticket_categories_name_unique
  on public.ticket_categories (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists ticket_categories_tenant_idx on public.ticket_categories (tenant_id, parent_id, sort_order);

-- -----------------------------------------------------------------------------
-- 4. Priority matrix: impact × urgency → priority, per tenant
-- -----------------------------------------------------------------------------
create table if not exists public.priority_matrix (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  impact    text not null check (impact  in ('low', 'medium', 'high')),
  urgency   text not null check (urgency in ('low', 'medium', 'high')),
  priority  text not null check (priority in ('low', 'medium', 'high', 'critical')),
  primary key (tenant_id, impact, urgency)
);

-- -----------------------------------------------------------------------------
-- 5. SLA policies: per tenant, priority and (optionally) record type.
--    ticket_type null = the default for every type without its own policy.
-- -----------------------------------------------------------------------------
create table if not exists public.sla_policies (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  ticket_type        text check (ticket_type is null or ticket_type in ('incident', 'service_request', 'problem', 'change')),
  priority           text not null check (priority in ('low', 'medium', 'high', 'critical')),
  response_minutes   integer not null check (response_minutes between 1 and 525600),
  resolution_minutes integer not null check (resolution_minutes between 1 and 525600),
  business_hours     boolean not null default false,
  updated_at         timestamptz not null default now()
);

create unique index if not exists sla_policies_unique
  on public.sla_policies (tenant_id, coalesce(ticket_type, '*'), priority);

-- -----------------------------------------------------------------------------
-- 6. Tenant settings: business hours and holidays (used by business-hours SLAs)
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_settings (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  timezone       text not null default 'Asia/Kolkata',
  work_days      smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],  -- 0 = Sunday … 6 = Saturday
  work_start     time not null default '09:00',
  work_end       time not null default '18:00',
  holidays       date[] not null default array[]::date[],
  updated_at     timestamptz not null default now(),
  check (work_end > work_start),
  check (work_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

-- -----------------------------------------------------------------------------
-- 7. Links between records (incident → problem, change → incident, …)
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  from_ticket uuid not null references public.tickets(id) on delete cascade,
  to_ticket   uuid not null references public.tickets(id) on delete cascade,
  link_type   text not null check (link_type in ('related', 'caused_by', 'duplicate_of', 'implements')),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (from_ticket <> to_ticket),
  unique (from_ticket, to_ticket, link_type)
);
create index if not exists ticket_links_to_idx on public.ticket_links (to_ticket);

-- -----------------------------------------------------------------------------
-- 8. Defaults for a tenant. Called for every existing tenant below, and by the
--    server when a new tenant is created. Fills only what is missing.
-- -----------------------------------------------------------------------------
create or replace function public.seed_tenant_itsm_defaults(_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _cats jsonb := '{
    "Access & Identity": ["Password Reset", "Account Locked", "New User Access", "Role / Permission Change", "SSO Login Issues"],
    "Hardware": ["Laptop Issue", "Desktop Issue", "Monitor", "Keyboard / Mouse", "Printer / Scanner", "Hardware Replacement"],
    "Software / Applications": ["Application Not Working", "Software Installation Request", "License Request", "Update / Patch Issue", "Compatibility Issue", "Internal / Custom Application"],
    "Network & Connectivity": ["No Internet", "VPN Issues", "Wi-Fi Slow / Unstable", "LAN Issue", "Firewall / Port Access Request", "DNS Issue"],
    "Email & Collaboration": ["Email Not Sending / Receiving", "Mailbox Full", "Outlook / Gmail Issues", "Teams / Slack Issues", "Calendar / Meeting Issue", "Shared Mailbox Access"],
    "Security": ["Phishing / Suspicious Email", "Malware / Virus", "Device Compromised", "Security Access Request", "Data Loss Incident", "Policy Violation"],
    "Database": ["Database Down", "Query Performance Issue", "Database Access Request", "Backup / Restore"],
    "Service Requests": ["New Laptop Request", "Software Installation", "VPN Access", "Email Group Creation"]
  }';
  _order text[] := array['Access & Identity', 'Hardware', 'Software / Applications', 'Network & Connectivity',
                         'Email & Collaboration', 'Security', 'Database', 'Service Requests'];
  _name text;
  _sub text;
  _i int := 0;
  _j int;
  _parent uuid;
begin
  -- Categories: only for a tenant that has none yet
  if not exists (select 1 from ticket_categories where tenant_id = _tenant) then
    foreach _name in array _order loop
      _i := _i + 1;
      insert into ticket_categories (tenant_id, name, sort_order, ticket_types)
      values (_tenant, _name, _i,
              case when _name = 'Service Requests' then array['service_request'] else null end)
      returning id into _parent;
      _j := 0;
      for _sub in select jsonb_array_elements_text(_cats -> _name) loop
        _j := _j + 1;
        insert into ticket_categories (tenant_id, parent_id, name, sort_order)
        values (_tenant, _parent, _sub, _j);
      end loop;
    end loop;
  end if;

  -- Priority matrix (the usual ITIL 3×3)
  insert into priority_matrix (tenant_id, impact, urgency, priority) values
    (_tenant, 'high',   'high',   'critical'),
    (_tenant, 'high',   'medium', 'high'),
    (_tenant, 'high',   'low',    'medium'),
    (_tenant, 'medium', 'high',   'high'),
    (_tenant, 'medium', 'medium', 'medium'),
    (_tenant, 'medium', 'low',    'low'),
    (_tenant, 'low',    'high',   'medium'),
    (_tenant, 'low',    'medium', 'low'),
    (_tenant, 'low',    'low',    'low')
  on conflict do nothing;

  -- SLA defaults: today's behaviour (respond 15 min, resolve 6 h, around the clock)
  if not exists (select 1 from sla_policies where tenant_id = _tenant) then
    insert into sla_policies (tenant_id, ticket_type, priority, response_minutes, resolution_minutes, business_hours)
    select _tenant, null, p, 15, 360, false
    from unnest(array['critical', 'high', 'medium', 'low']) p;
  end if;

  insert into tenant_settings (tenant_id) values (_tenant) on conflict do nothing;
end;
$$;

revoke all on function public.seed_tenant_itsm_defaults(uuid) from public, anon, authenticated;
grant execute on function public.seed_tenant_itsm_defaults(uuid) to service_role;

do $$
declare
  t uuid;
begin
  for t in select id from public.tenants loop
    perform public.seed_tenant_itsm_defaults(t);
  end loop;
end $$;

-- Replace a tenant's SLA policies in one step (the server validates the rows first)
create or replace function public.replace_sla_policies(_tenant uuid, _rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from sla_policies where tenant_id = _tenant;
  insert into sla_policies (tenant_id, ticket_type, priority, response_minutes, resolution_minutes, business_hours)
  select _tenant,
         nullif(r ->> 'ticket_type', ''),
         r ->> 'priority',
         (r ->> 'response_minutes')::int,
         (r ->> 'resolution_minutes')::int,
         coalesce((r ->> 'business_hours')::boolean, false)
  from jsonb_array_elements(_rows) r;
end;
$$;

revoke all on function public.replace_sla_policies(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sla_policies(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 9. Access: the browser may read its tenant's settings; all writes go
--    through the server (service role).
-- -----------------------------------------------------------------------------
alter table public.tenant_counters   enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.priority_matrix   enable row level security;
alter table public.sla_policies      enable row level security;
alter table public.tenant_settings   enable row level security;
alter table public.ticket_links      enable row level security;

revoke all on public.tenant_counters, public.ticket_categories, public.priority_matrix,
              public.sla_policies, public.tenant_settings, public.ticket_links
  from anon, authenticated;
grant select on public.ticket_categories, public.priority_matrix, public.sla_policies,
                public.tenant_settings, public.ticket_links
  to authenticated;

drop policy if exists ticket_categories_select on public.ticket_categories;
create policy ticket_categories_select on public.ticket_categories
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

drop policy if exists priority_matrix_select on public.priority_matrix;
create policy priority_matrix_select on public.priority_matrix
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

drop policy if exists sla_policies_select on public.sla_policies;
create policy sla_policies_select on public.sla_policies
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

drop policy if exists tenant_settings_select on public.tenant_settings;
create policy tenant_settings_select on public.tenant_settings
  for select to authenticated
  using ((select public.is_superadmin()) or tenant_id = (select public.current_tenant_id()));

-- A link is visible when both ends are (tickets' own RLS applies inside)
drop policy if exists ticket_links_select on public.ticket_links;
create policy ticket_links_select on public.ticket_links
  for select to authenticated
  using (
    exists (select 1 from public.tickets t where t.id = ticket_links.from_ticket)
    and exists (select 1 from public.tickets t where t.id = ticket_links.to_ticket)
  );

notify pgrst, 'reload schema';

commit;

-- -----------------------------------------------------------------------------
-- After running, check:
--   select ticket_type, count(*), min(number), max(number) from tickets group by 1;
--   select tenant_id, count(*) from ticket_categories group by 1;
--   select count(*) from priority_matrix;   -- 9 per tenant
--   select count(*) from sla_policies;      -- 4 per tenant
-- -----------------------------------------------------------------------------
