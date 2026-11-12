# Database migrations

From now on every schema change is a file in this folder, named
`YYYYMMDDHHMMSS_description.sql`, applied **in name order**, exactly once.
Each file must be re-runnable and wrapped in a transaction.

## Order on an existing (production) database

The legacy scripts were run by hand in the Supabase SQL Editor before this
folder existed. They are assumed to be applied already:

1. `../../supabase-multitenant-migration.sql`
2. `../../supabase-superadmin-migration.sql`
3. `../migration_sla_activity.sql`
4. `../migration_email_verification.sql`
5. `../migration_asset_organization.sql`
6. `../migration_unique_asset_code.sql` (optional, may not have been run)
7. `../migration_ticket_messages_server_only.sql`
8. `../migration_sla_cron.sql`
9. `../migration_askmira.sql`

Then apply the files in this folder:

| File | What |
|---|---|
| `20261111120000_tenancy_foundation.sql` | Tenants, `tenant_id` everywhere (all existing data → **CGB Solutions**), tenant-scoped RLS, browser writes removed, server-only sign-up trigger. **Applied to production 2026-11-12.** |
| `20261112120000_itsm_core.sql` | Record types (incident / service request / problem / change), per-tenant numbering (INC0001001…), per-tenant categories, impact × urgency priority matrix, SLA policies, business hours & holidays, ticket links. Additive: safe to apply before the matching app deploy. |
| `20261112130000_sla_scheduler.sql` | pg_cron + pg_net job calling `/api/sla/check` every 2 min; URL and secret read from Supabase Vault (`sla_check_url`, `cron_secret`). Apply **after** the ITSM app version is live and `CRON_SECRET` is set in Vercel. |

## Before applying `20261111120000_tenancy_foundation.sql`

1. Take a backup (Supabase → Database → Backups, or `pg_dump`).
2. Deploy the app version from the same commit **at the same time**: the old
   app writes from the browser, which this migration forbids.
3. Set `CRON_SECRET` in the app environment (the SLA endpoint now refuses to
   run without it), and make sure the pg_cron job sends it as
   `Authorization: Bearer …`.
4. Afterwards, in Supabase → Authentication → Sign In / Providers, turn off
   "Allow new users to sign up" and the Google provider. New people are
   invited by an admin.

## Known gap

The base tables (`users`, `tickets`, `assets`, `notifications`, …) were created
in the dashboard and have no `CREATE TABLE` in this repo. Generate a
schema-only baseline from production
(`pg_dump --schema-only --schema=public`) and commit it here as
`00000000000000_baseline.sql` so fresh installs are reproducible.
