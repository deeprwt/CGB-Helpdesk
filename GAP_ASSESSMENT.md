# CGB Helpdesk: Due-Diligence Gap Assessment

**Scope:** the repository at `CGB-Helpdesk-latest`, branch `main` @ `6c410a2` (2026-11-11). Review method: reading code, git history and installed package manifests.
**Not done:** no build, install, `npm audit`, network calls, or database connection. Nothing from the live Supabase project was inspected, so anything that depends on live RLS policies, grants or data is marked INFERRED.
**Labels:** **[C] CONFIRMED** = seen in the repo, with a citation. **[I] INFERRED** = engineering judgement from the evidence given.
**Effort:** in person-weeks (pw). Every figure is an **estimate (±30%)** for one experienced team, and excludes UX design, documentation and QA. Sizes: **S** ≤2 pw · **M** 2–5 · **L** 5–10 · **XL** >10.

---

## 1. Executive summary

1. **Recommendation: (c) Hybrid. Rewrite the core and migrate the data.** Build a new server-side domain/API layer and a new schema (ITSM record types, SLA engine, workflow, CMDB, tenancy, audit), plus a new agent gateway. Keep only these: the UI primitives and app shell, the AskMira connector, the ticket-permission and notification-routing rules (as a spec to port), the email templates, and the asset-import UX (see §5.1).
2. What exists is a **single-queue IT helpdesk with a basic asset register**, built on a **TailAdmin admin-dashboard template** (`package.json:2-3`, `LICENSE:3`) with Next.js 16 and Supabase. It has about 17.7k lines of domain code and 1 author identity [C].
3. **Phase 1 coverage is about 10–15%.** No Problem, Change, catalog, KB, approvals, inbound email, CI relationships, agent, patching or remote access exist. The SLA rules are two hardcoded timers [C].
4. **The schema has no source of truth.** The core tables (`tickets`, `users`, `assets`, …) have no `CREATE TABLE` anywhere in the repo. There are three conflicting versions of the signup trigger, and every migration is a hand-run SQL Editor script [C].
5. **Security depends on database policies we cannot see.** Tenant isolation is client-side email-domain filtering. 109 table calls run directly from the browser, and super-admin writes go browser→DB with no RLS defined in the repo [C]. Two **Critical** privilege-escalation paths are likely [I].
6. There are **five confirmed High API flaws:** audit-log forgery, notification spoofing, an authenticated email relay, cross-tenant user deletion, and ticket/activity data readable across tenants [C].
7. **Not on-prem ready.** The app depends on hosted Supabase, Vercel `after()`, and a pg_cron job hardcoded to a `*.vercel.app` URL. There is no Dockerfile, installer, backup, test or log pipeline [C].
8. Building on the current code saves at most **3–6 pw** of ticket and asset UI. Retrofitting tenancy, authZ, migrations and tests costs **12–20 pw** more, so the hybrid route is **about 15–23 pw cheaper overall** and ends in a sound architecture (§5.3) [I].
9. **Licences:** one AGPL-or-commercial package and one revenue-capped dual-licence package are installed, both reachable only from unused template demo code, so removing them is trivial. `xlsx@0.18.5` parses untrusted uploads and has known advisories [C].
10. **First step before any commitment:** get a schema-only dump plus the RLS policies and grants from production (§6, Q1). The two Critical items can only be confirmed or cleared that way.

---

## 2. Codebase profile

### 2.1 Stack [C]
| Layer | What | Evidence |
|---|---|---|
| Framework | Next.js **16.0.10** (App Router, route handlers), React **19.2**, TypeScript **5.9** `strict` | `package.json:51,54`, `package-lock.json` (`node_modules/next` 16.0.10), `tsconfig.json:10` |
| UI | Tailwind 4, shadcn/ui (Radix), lucide, sonner, TanStack Table; TailAdmin template shell | `components.json`, `src/components/ui/*`, `README.md:1` |
| Data | **Supabase**: Postgres + PostgREST + GoTrue auth + Realtime + Storage, via `@supabase/supabase-js` 2.90 | `src/lib/supabaseClient.ts:1-6`, `src/lib/ticket-server.ts:8-14` |
| ORM | **None.** The PostgREST query builder is called from both browser and server; there is no repository/service layer | 109 browser-side `.from("…")` calls in 27 UI files; 124 in `app/api` + `lib` |
| Email | nodemailer 8 over SMTP, synchronous | `src/lib/email.ts:6-14` |
| Spreadsheet | `xlsx` 0.18.5, used for asset import/export in the browser | `src/components/asset/AssetImportDialog.tsx:4,169-172` |
| Runtime/host | Vercel serverless (INFERRED from code comments), Node runtime | `src/app/api/tickets/create/route.ts:130-134`, `supabase/migration_sla_cron.sql:2-8,20`, `.gitignore` (`.vercel`) |
| Language versions | No `engines` field; template README says Node 18+ | `package.json` (absent), `README.md:44-46` |

### 2.2 Structure and entry points [C]
- `src/app/(admin)/…`: authenticated pages (dashboard, tickets, assets, users, profile, notifications, super-admin, askmira), plus TailAdmin demo pages (`(ui-elements)`, `form-elements`, `basic-tables`, `calendar`, `blank`).
- `src/app/(full-width-pages)/…`: signin, signup, update-password, verify-email, AskMira connect and SSO landing pages.
- `src/app/api/…`: **23 route handlers**: tickets (create/acquire/status/reopen/reassign/message), sla/check, activity/create, notifications/create, email/send, auth (signup/verify/resend), user (role/delete), integrations/askmira (8).
- `src/lib/…`: shared logic (org/tenancy, ticket access rules, notifications, email, AskMira).
- `supabase/*.sql` + 2 root `*.sql`: **9 hand-run migration scripts**. No base schema.
- **No `middleware.ts`.** `src/lib/supabaseMiddleware.ts` is defined but never imported (searched for `createSupabaseMiddlewareClient|supabaseMiddleware`: only the definition was found).

### 2.3 Build, deploy and tests [C]
- Scripts: `dev`, `build`, `start`, `lint` only (`package.json:5-10`).
- **Not found:** `Dockerfile*`, `docker-compose*`, `.github/`, `vercel.json`, `jest/vitest/playwright` configs, `*.test.*`, `*.spec.*`.
- `src/lib/askmira/core.ts:105` has a `replaceForTests` hook, but no tests exist in the repo.

### 2.4 Size (lines, including blank lines) [C]
| Area | Files | Lines |
|---|---:|---:|
| `src/app/api` | 23 | 1,966 |
| `src/lib` (incl. askmira 7 files ≈1,900) | 22 | 3,611 |
| `src/components/tickets` | 10 | 3,237 |
| `src/components/asset` | 3 | 1,516 |
| `src/components/user-role` | 4 | 1,380 |
| `src/components/auth` | 6 | 1,104 |
| `src/components/askmira` | 2 | 406 |
| `src/app/(admin)` pages | 27 | 5,521 |
| `src/components/ui` (shadcn + template) | 47 | 4,319 |
| **Template demo residue** (ecommerce, example, videos, charts, ui-elements pages, form-elements, calendar…) | — | **≈3,414** |
| SQL scripts | 9 | 825 |
| **Total TS/TSX** | — | **29,870** |

God-files: `assets/page.tsx` 1,286 · `ticket/[id]/page.tsx` 964 · `UserRoleTable.tsx` 678 · `AssetForm.tsx` 675 · `CreateTicketForm.tsx` 654 · `email.ts` 594.

### 2.5 Git history [C]
- **42 commits, 1 author identity**, from 2026-01-19 to 2026-11-11. `origin` is a personal-namespace GitHub repo.
- Commit `f7d4368` ("First Commit") adds **306 files / 22,382 lines** in one go, so earlier history is not in git.
- Commits per month: Jan 19 · Feb 1 · Mar 3 · **Apr–Sep 0** · Oct 16 · Nov 3. Commit messages are low-information ("update", "bug fixed", "issueg").
- **Hotspots since 2026-05-11:** `assets/page.tsx` (7), `EngineerTicketTable.tsx` (6), `AssetForm.tsx` (6), `ticket/[id]/page.tsx` (6), `lib/org.ts` (5), `lib/askmira/queries.ts` (5), `TicketChat.tsx` (5), `SignInForm.tsx` (5), plus the rest of `lib/askmira/*` (3–4 each).
- **TODO/FIXME/HACK/XXX: none found** (`grep -rnE 'TODO|FIXME|HACK|XXX' src supabase *.sql`).

---

## 3. What exists (reverse-engineered)

### 3.1 Data model [C unless marked]
The DDL for the core tables is **not in the repo**. The columns below were reconstructed from the code that reads and writes them, plus the `ALTER`/`CREATE` statements that do exist. The ER summary is in Appendix A.

- **Enums are free text, enforced only in app code.** `role` ∈ {user, engineer, admin, superadmin} (`src/lib/ticket-access.ts:13`, `api/user/role/route.ts:7`). Ticket `status` ∈ {new, open, in_progress, hold, closed} (`src/lib/ticket-utils.ts:11-17`). `priority` ∈ {low, medium, high} (`src/lib/ticket-categories.ts:68`). Asset `status` ∈ {in_use, spare, retired} (`AssetForm.tsx` `STATUS_OPTIONS`). `organizations.status` is the only DB `CHECK` (`supabase-superadmin-migration.sql:14-15`).
- **Role naming drift:** the SQL tells operators to set `'super_admin'` (`supabase-superadmin-migration.sql:124-126`), but the code checks `'superadmin'` (`ticket-access.ts:13`).
- **Category taxonomy** is a TypeScript constant: 8 categories with fixed sub-categories (`src/lib/ticket-categories.ts:6-66`).
- **Asset attributes** are EAV: an `asset_details` (key, value) table (`AssetForm.tsx:358-375`). `asset_type`, `location` and `department` are free text.
- **Three conflicting `handle_new_user()` trigger bodies.** `supabase-multitenant-migration.sql:282-320` sets `org_domain`. `supabase-superadmin-migration.sql:74-104` and `supabase/migration_email_verification.sql:15-46` do not. Which one runs in production depends on execution order, which is unknown (Open Q).
- `org_domain` is added and backfilled for 8 tables (`supabase-multitenant-migration.sql:12-80`), but **`api/tickets/create` never sets it** (`route.ts:98-113`). Its role in production is unclear [I].

### 3.2 Ticket lifecycle [C]
```
          create (any user; staff may set requester)          api/tickets/create
 [new] ──acquire (staff covering requester's org)──► [open]   api/tickets/acquire   (sets resolution SLA = now+6h)
 [open] ──hold (assignee; reason; 24/48/72h)──► [hold]        api/tickets/status    (HOLD_HOURS route.ts:8)
 [hold] ──resume (assignee/admin)──► [open]                   api/tickets/reopen    (SLA extended by paused ms, route.ts:62-89)
 [open] ──close (assignee)──► [closed]                        api/tickets/status
 [closed] ──reopen (assignee/admin)──► [open]                 api/tickets/reopen    (SLA reset now+6h, route.ts:91-110)
 any non-closed ──transfer (assignee/admin)──► same status, new assignee   api/tickets/reassign
```
- `in_progress` exists in the UI and in the SLA query (`sla/check/route.ts:159`), but **no route ever sets it**.
- The SLA job's header promises "Tickets on hold past hold_until → auto-flag" (`sla/check/route.ts:19`). **That is not implemented** (route body lines 52-221 handle only three checks).
- Concurrency is handled well: every transition uses an optimistic guard (`.eq("status", …)` / `.is("assignee", null)`, e.g. `acquire/route.ts:48-62`).

### 3.3 Roles and permissions [C]
- There are four hardcoded roles. Per-ticket rules live in `src/lib/ticket-access.ts:46-66`:
  - staff can view their organisations' tickets
  - only the assignee closes, holds or chats
  - the assignee or an admin can transfer or reopen
  - the requester always sees and chats on their own ticket
- These rules are enforced server-side in the ticket API routes, but **page access is enforced only client-side** (`components/auth/RoleGate.tsx:34-40`, `AuthGate.tsx:7-16`).
- **Tenancy = email domain.** A user's organisation is `split_part(email,'@',2)`. Cross-org reach comes from `user_organization_access`, and superadmin sees all organisations (`src/lib/org.ts:50-91,189-198`). `org.ts:14` itself says this is "client-side multi-tenant filtering".

### 3.4 Notifications and email [C]
- Routing matrix is documented and centralised in `src/lib/ticket-notify.ts:4-13`:
  - created → requester email + IT team in-app
  - acquired → requester
  - close/hold/reopen → requester + assignee
  - transfer → requester, both engineers, org admins
- Chat messages notify the other party only when they are not present on the ticket (Realtime presence) (`api/tickets/message/route.ts:66-104`).
- Channels: an in-app `notifications` table plus Realtime subscriptions (7 channels, 6 `postgres_changes`), and SMTP email.
- Email is **fire-and-forget after the response** (`next/server` `after()`, 8 call sites), with **no queue, retry or outbox**.
- Templates are hardcoded HTML with **"CGB Solutions Helpdesk" branding** (`email.ts:335,457,497,589-591`).

### 3.5 External integrations [C]
| Integration | Purpose | Evidence |
|---|---|---|
| Supabase (hosted) | DB, auth, realtime, storage bucket `ticket-attachments`, pg_cron/pg_net | `api/tickets/create/route.ts:170-175`, `supabase/migration_sla_cron.sql:11-25` |
| SMTP | All email | `src/lib/email.ts:6-14` |
| **AskMira** (HRMS) | People provisioning/deprovisioning, ticket query/act, magic-link SSO, connect/revoke with PKCE, HS256 tokens with body-hash + jti replay guard | `src/lib/askmira/core.ts:1-21,95-116,195-209`, `launch.ts:77` |
| Google OAuth | "Sign up with Google" button | `components/auth/SignUpForm.tsx:70-71,104` |
| Vercel | Host; `after()`; SLA cron target `https://cgb-helpdesk.vercel.app/api/sla/check` | `supabase/migration_sla_cron.sql:20` |

The AskMira module is the **best-engineered code in the repo**: timing-safe compares, sanitised filter input (`core.ts:153-159`), validated tenant IDs (`connect.ts:151,208-209`), and one-time tokens [C].

---

## 4. Gap matrix (Phase 1 target)

Columns: **Status** P = Present / Pa = Partial / M = Missing. **Verdict** KEEP / REFACTOR / REWRITE. **Effort** = estimate.

| # | Item | Status | Evidence | Verdict | Effort (est.) | Label |
|---|---|---|---|---|---|---|
| A1 | Incident / Service Request / Problem / Change as distinct types | **M** | One `tickets` table with no type column. Searched `problem\|change_request\|CAB\|change_type\|service_request\|request_type\|ticket_type`: no domain hits ("problem" hits are AskMira UI error strings, `askmira/page.tsx:34-88`). "Service Requests" is only a category (`ticket-categories.ts:60-65`) | REWRITE | L 5–8 | C |
| A2 | Configurable forms, categories, impact×urgency matrix | **M** | Categories are a TS const (`ticket-categories.ts:6-66`), priority is a fixed 3-value list (`:68`). `impact\|urgency`: not found. No custom fields. Form is hardcoded (`CreateTicketForm.tsx`, 654 lines) | REWRITE | M 3–5 | C |
| A3 | SLA/OLA engine: timers, pause/resume, calendars, escalations, breach alerts | **Pa** | Fixed 15 min response / 6 h resolution, same for every priority and tenant (`create/route.ts:96`, `acquire/route.ts:54`, `reopen/route.ts:92`, `askmira/actions.ts:88`). Pause on hold works (`reopen/route.ts:62-89`). 10-min warning plus breach flags and alerts via a 2-min pg_cron→HTTP poll (`sla/check/route.ts:52-221`). `business_hours\|holiday\|timezone\|calendar_id`: not found. Hold-expiry check missing (line 19 vs body). No OLA, no multi-level escalation | REWRITE (port pause logic) | L 5–8 | C |
| A4 | Workflow/approvals, CAB, maintenance windows | **M** | `approv*` hits only AskMira connect approval (`askmira/connect.ts:142`). No workflow engine, state config, CAB or windows | REWRITE (new) | XL 10–14 | C |
| A5 | Service catalog and fulfilment | **M** | `catalog`: not found. Only a hardcoded "Service Requests" category | REWRITE (new) | L 5–7 | C |
| A6 | Knowledge base linked to tickets | **M** | `knowledge\|kb_article\|article`: not found | REWRITE (new) | M 3–5 | C |
| A7 | Email-to-ticket (inbound) and templated notifications | **Pa** | Inbound: `imap\|inbound\|mailparser\|pop3` not found. Outbound: present but hardcoded HTML in code, branded, not tenant-editable, no queue (`email.ts:82-270,306-440`) | Inbound REWRITE (new); templates REFACTOR | L 5–8 | C |
| A8 | Reporting, dashboards, export, audit reports | **Pa** | Dashboard counters and a pie chart (`app/(admin)/page.tsx`, `TicketOverviewCards.tsx`, `PieChartTable.tsx`). Asset XLSX export only (`assets/page.tsx:712-715`). No ticket export, scheduled reports, SLA reports or audit reports | REWRITE | L 5–7 | C |
| B1 | CI model, relationships, CI types, extensibility | **Pa** | `assets` plus EAV `asset_details` with a fixed key set (`AssetForm.tsx:64-80,358-375`). `asset_type` is free text. `relationship\|depends_on\|parent_id\|ci_type`: not found | REWRITE (migrate data) | L 5–7 | C |
| B2 | Ticket/change ↔ CI link | **Pa** | `asset_tickets` join, one asset chosen at ticket creation (`create/route.ts:146-159`). No change records exist to link | REFACTOR into new model | S 1–2 | C |
| B3 | Discovery/import (CSV, API, agent) | **Pa** | Client-side XLSX import with duplicate check and report (`AssetImportDialog.tsx:157-336`). No import API, no CSV, no discovery | KEEP UX / REFACTOR to server-side import | M 2–4 | C |
| C1 | Agent, inventory, device check-in | **M** | `agent\|heartbeat\|check-in\|inventory` hits are UI copy only (`assets/page.tsx:1062,1101,1182`). No device identity, enrolment or check-in endpoint | REWRITE (new) | XL 12–18 | C |
| C2 | Patch scan/deploy/compliance, job queue, maintenance windows | **M** | `patch\|wsus\|winget` hits are only a ticket sub-category "Update / Patch Issue" and an AskMira variable (`people.ts:267`). No job queue of any kind | REWRITE (new) | XL 16–24 | C |
| C3 | Remote shell/desktop | **M** | `websocket\|rdp\|vnc\|webrtc\|remote shell`: no hits outside unrelated identifiers. Remote desktop is excluded from this estimate (add XL) | REWRITE (new) | L 8–12 (shell only) | C |
| C4 | Where an agent gateway plugs in | **M** | Next.js route handlers on serverless (`after()` pattern, Vercel cron) cannot hold long-lived agent connections. No component can host it. The gateway must be a new stateful service (mTLS, WebSocket/gRPC, job dispatch) next to Postgres | New service | L 5–8 | C (absence) / I (design) |
| D1 | Multi-tenancy / tenant config | **Pa** | Tenant = email domain (`org.ts:8-15`). Isolation filtering is client-side (`org.ts:14`). Superadmin spans all tenants (`org.ts:57-68`). Category, SLA and branding are global/hardcoded. Live RLS unknown (§4.2) | REWRITE | L 5–8 | C / I |
| D2 | AuthN/AuthZ: local, LDAP/AD, SAML/OIDC, MFA, RBAC | **Pa** | Local email+password via Supabase (`SignInForm.tsx:117`), Google OAuth (`SignUpForm.tsx:70-71`), AskMira magic-link SSO (`askmira/launch.ts:77`). `ldap\|saml\|oidc\|openid\|mfa\|totp\|factor`: not found. RBAC is 4 hardcoded roles with no permissions table | REWRITE | L 6–9 | C |
| D3 | Audit trail (who changed what; immutable?) | **Pa** | `ticket_activity` covers ticket events only. **Forgeable**: any user can insert arbitrary rows (`api/activity/create/route.ts:33-51`). No audit for asset, user, role, org or access-grant changes. Rows are mutable by the service role. Asset and org changes are done browser→DB with no log (`assets/page.tsx:583-609`, `super-admin/organizations/page.tsx:101-143`) | REWRITE | M 3–5 | C |
| D4 | Cloud/internet dependencies | **Pa (heavy)** | Hosted Supabase (GoTrue, PostgREST, Realtime, Storage); Vercel `after()` and cron URL (`migration_sla_cron.sql:20`); Google OAuth; AskMira SaaS; Google Fonts via `next/font/google` (build-time download, `app/layout.tsx:1`); logo in emails loaded from app URL (`email.ts:312`) | REFACTOR (remove/abstract) | M 2–4 | C |
| D5 | Packaging, install, config, upgrade/migration, backup/restore | **M** | No Dockerfile, compose, installer or config schema. Migrations are "Run this ONCE in Supabase SQL Editor" scripts (e.g. `supabase-superadmin-migration.sql:3`). `backup\|restore` hits are only a ticket sub-category | REWRITE (new) | L 5–8 | C |
| D6 | Offline/air-gapped, offline licensing | **M** | No licensing code (`licen[sc]e` hits: template/license text only). Runtime needs Supabase and SMTP reachable | REWRITE (new) | M 3–5 | C |
| D7 | Background jobs/queue reliability | **Pa (weak)** | Only pg_cron → HTTP GET every 2 min (`migration_sla_cron.sql:15-25`) and in-process `after()` (8 sites). No retry, dead-letter or idempotency keys. SLA loop does sequential awaits with N+1 queries (`sla/check/route.ts:63-98`) | REWRITE | M 3–4 | C |
| D8 | HA/scalability limits | **Pa** | App tier is stateless (good). But: browser pages page through *all* users (`fetchAllRows`, 16 UI call sites; `org.ts:16-34`), giant `.in(requester_id, [...])` filters (`TicketOverviewCards.tsx:135-145`), SLA job loads all users each run (`sla/check/route.ts:46-48`). Realtime/presence depends on the Supabase Realtime service | REFACTOR | M 2–4 | C / I |
| E1 | Security review | **Pa (poor)** | See §4.2: 2 Critical [I], 5 High [C], 6 Medium, 1 Low, 1 Info | Fix if kept; design-in if rewritten | M 3–5 (fix only) | C / I |
| E2 | Dependencies and licences | **Pa** | See §4.3: AGPL package, ApexCharts dual licence, `xlsx` advisories, deprecated unused auth-helpers | REFACTOR (remove/replace) | S 0.5–1 | C |
| E3 | Tests | **M** | No test files, runner or CI (search: `*.test.*`, `*.spec.*`, jest/vitest/playwright configs) | REWRITE (new harness) | L 6–10 to backfill current code | C |
| E4 | Logging, errors, observability, diagnostics | **Pa (weak)** | 68 `console.*` calls. `logger\|pino\|winston\|sentry\|opentelemetry\|health`: not found. Errors are swallowed in client helpers (`lib/notify.ts:39-41,74-76`, `lib/activity.ts:38-40`). No correlation IDs or health endpoint | REWRITE | M 2–3 | C |
| E5 | Schema migrations | **M** | No base DDL. 9 ad-hoc scripts with no ordering or versioning. Only one has an "undo" note (`migration_ticket_messages_server_only.sql:16-17`). Conflicting trigger versions (§3.1). Manual steps inside the scripts (`supabase-superadmin-migration.sql:119-134`, `migration_sla_cron.sql:7-8`) | REWRITE | M 2–3 | C |
| E6 | Code health | **Pa** | 6 routes repeat an inline token check instead of the shared `getRequestUser` (`ticket-server.ts:17-37`), e.g. `activity/create:8-31`, `email/send:10-36`, `user/delete:9-33`, `user/role:27-51`. SLA constants in 6 places (A3). Ticket creation duplicated (`api/tickets/create` vs `askmira/actions.ts:61-101`, which validates assets while the main route does not). ≈3.4k lines of template demo code. 6 god-files over 650 lines. 2 unused deps (`@supabase/auth-helpers-*`: 0 imports). Good: shared `ticket-access.ts` and `ticket-notify.ts` | REFACTOR | M 2–4 | C |

### 4.1 Totals by section (estimates)
| Section | Hybrid (recommended) | Build on current code |
|---|---|---|
| A. ITSM core | 41–62 pw | 40–60 pw (saves ≈1–2 on ticket UI/chat, but every schema change ripples through 109 browser-side queries) |
| B. CMDB | 8–13 pw | 8–12 pw |
| C. Agent and patching | 41–62 pw | 41–62 pw (nothing reusable; host constraint applies to both) |
| D. Platform/on-prem | 29–47 pw | 33–53 pw (must self-host the ~10-service Supabase stack or rip it out anyway) |
| Retrofit (security fixes, test backfill, migration baseline, browser→API move) | built in | **+12–20 pw** |
| **Total** | **≈119–184 pw** | **≈134–207 pw** |

### 4.2 Security findings

| # | Sev | Finding | Evidence | Fix | Label |
|---|---|---|---|---|---|
| S1 | **Critical** | `organizations` and `user_organization_access` are created **without RLS** in the repo, and the super-admin UI writes them **directly from the browser**. If production matches the repo, any signed-in user (and possibly anon-key holders, depending on grants) can whitelist a domain or grant themselves access to any tenant | `supabase-superadmin-migration.sql:10-34` (no `ENABLE ROW LEVEL SECURITY` in the file); `super-admin/organizations/page.tsx:101,130,143`; `super-admin/access-control/page.tsx:178,203`; gating is client-only `RoleGate.tsx:34-40` | Enable RLS (deny all to `authenticated`); move writes behind server routes with role checks | I (repo state C; live state unknown) |
| S2 | **Critical** | **Self-escalation to superadmin likely.** The `users` UPDATE policy allows any row in the caller's org with no column restriction and no `WITH CHECK`. The browser already updates `users` directly. The role route's own comment confirms browser sessions can update `users` rows in their org | `supabase-multitenant-migration.sql:135-136`; `components/user-profile/UserInfoCard.tsx:207-223`; `api/user/role/route.ts:16-18` | `REVOKE UPDATE (role, email, org_domain) ON users FROM authenticated`, or a guard trigger; restrict UPDATE to `id = auth.uid()` | I (depends on live grants) |
| S3 | High | **Cross-tenant read exposure.** `ticket_activity` and `ticket_assignments` are readable by every authenticated user (`USING (true)`); activity `details` hold hold-reasons and comments. The ticket page fetches ticket, messages and activity **before** its client-side access check | `supabase/migration_sla_activity.sql:56-59,69-72`; `ticket/[id]/page.tsx:296-337` (check at 203-228) | Tenant-scoped RLS; server-rendered/API reads with authZ first | C |
| S4 | High | **Audit-trail forgery.** Any authenticated user can insert activity for any ticket, as any actor, with any action | `api/activity/create/route.ts:33-51` | Remove the route; write activity only inside server transitions | C |
| S5 | High | **Notification spoofing.** Any user can create in-app notifications for any user, with any actor and text | `api/notifications/create/route.ts:38-67` | Remove; derive recipients server-side (already done in `ticket-notify.ts`) | C |
| S6 | High | **Authenticated email relay.** Any user can send CGB-branded email to any address with arbitrary subject line ticket ID, actor name and comment (content spoofing/phishing from the company's sender). *Correction (2026-11-11): ticket-email HTML is escaped — `getActionDetails` escapes `actorName` (`email.ts:167`) and comments use `escMultiline`; only the verification email inserted `recipientName` raw (`email.ts:518`).* | `api/email/send/route.ts:39-77`; `lib/email.ts:518` | Remove the route; escape the verification email name | C |
| S7 | High | **Cross-tenant user deletion.** Any `admin` can delete any non-admin user in **any** org; no org check (contrast `user/role` which checks). Deletes the profile before the auth user and ignores auth-delete failure, which leaves orphan logins | `api/user/delete/route.ts:42-105` vs `api/user/role/route.ts:101-126` | Add org scope; delete auth user first, in one transaction or saga | C |
| S8 | Medium | **Ticket create IDOR.** Staff can raise tickets for any `requester_id` across tenants. `asset_id` is not validated (AskMira path does validate). Attachments have no size, type or count limit, and the raw `file.name` goes into the storage key | `api/tickets/create/route.ts:74-77,146-159,164-175` vs `lib/askmira/actions.ts:61-66` | Scope checks; MIME/size allow-list; generated object keys | C |
| S9 | Medium | **SLA endpoint open if `CRON_SECRET` is unset.** The secret is also accepted as a URL query parameter (ends up in logs) and is pasted into a pg_cron SQL body, stored in plaintext in `cron.job` | `api/sla/check/route.ts:24-32`; `supabase/migration_sla_cron.sql:7-8,21` | Fail closed; header only; Vault/secret store | C |
| S10 | Medium | **Signup whitelist bypass.** The domain whitelist is checked only in `/api/auth/signup`. The Google OAuth button goes straight to Supabase, and the trigger creates a `user` row for any email | `components/auth/SignUpForm.tsx:70-71,104`; `api/auth/signup/route.ts:35-56`; `supabase/migration_email_verification.sql:15-46` | Enforce the whitelist in the DB trigger/hook; disable the provider if unused | I (depends on provider being enabled) |
| S11 | Medium | **No server-side route protection.** No middleware; auth and role gating are client components only. All data security therefore rests on RLS | No `src/middleware.ts`; `AuthGate.tsx:7-16`; `RoleGate.tsx:34-40`; unused `lib/supabaseMiddleware.ts` | Server-side session check; server data access | C |
| S12 | Medium | **Secret reuse.** The AskMira link-signing key falls back to `SUPABASE_SERVICE_ROLE_KEY`, so rotating the service key silently breaks every AskMira link and couples two trust domains. Secrets are otherwise read from env vars (13 names, §App B). **No `.env` file in the tree or git history** | `lib/askmira/core.ts:198`; `git log --all --name-only` grep for `.env\|secret\|key`: none | Require a dedicated `ASKMIRA_LINK_SECRET`; secret manager | C |
| S13 | Medium | **No rate limiting** on public signup and resend-verification (email-bombing, enumeration timing). No password policy server-side; client minimum is 6 characters on update only | `api/auth/signup/route.ts`, `api/auth/resend-verification/route.ts` (no limiter; `rate.?limit` not found); `UpdatePswdForm.tsx:73` | Rate limits; server policy | C |
| S14 | Low | **No security headers or CSP;** supabase-js keeps sessions in localStorage by default, so any XSS means token theft. Only `dangerouslySetInnerHTML` is shadcn `chart.tsx:83` (config-derived CSS) | `next.config.ts:1-25`; `grep dangerouslySetInnerHTML` | CSP and headers; cookie sessions | C |
| S15 | Info | **Not found:** SQL injection (no raw SQL from the app; PostgREST builder; `.or()` interpolation only of sanitised or validated values: `askmira/core.ts:153-159`, `connect.ts:151,208-209`). CSRF is N/A (bearer-token header, not cookies). Password storage is delegated to Supabase GoTrue (no app-level password handling). Verification tokens are stored hashed (`api/auth/signup/route.ts:8-10,88`) | as cited | — | C |

### 4.3 Dependency and licence findings
803 packages in the lockfile: MIT 633 · ISC 33 · Apache-2.0 29 · BSD-2 15 · BSD-3 5 · MPL-2.0 3 · CC0 3 · 0BSD 2 · others below.
73 packages have no licence field. They are optional platform binaries not installed on this machine (e.g. `@img/sharp-linux-*`), and are INFERRED to carry the same licences as their installed siblings.

| Sev | Package | Issue | Evidence | Fix | Label |
|---|---|---|---|---|---|
| High (licence) | `@react-jvectormap/lib` 1.0.3 (prod) | **`(AGPL OR Commercial)`** | `node_modules/@react-jvectormap/lib/package.json`; only used by unreferenced `components/ecommerce/CountryMap.tsx` (0 importers) | Remove `@react-jvectormap/*` and the demo code | C |
| Medium (licence) | `react-apexcharts` (prod) | Dual licence: **commercial licence required for orgs with ≥ US$2M revenue** | `node_modules/react-apexcharts/LICENSE:1-30`; used only by unreferenced `components/charts/*`, `components/ecommerce/*` | Remove (app charts use `recharts`, MIT) | C |
| High (vuln) | `xlsx` 0.18.5 | Known public advisories: prototype pollution (CVE-2023-30533, fixed 0.19.3) and ReDoS (CVE-2024-22363, fixed 0.20.2). SheetJS no longer publishes fixes to npm. **Parses untrusted user uploads** | `package-lock.json` `node_modules/xlsx` 0.18.5; `AssetImportDialog.tsx:169-172` | Move to SheetJS CDN ≥0.20.2, or exceljs/papaparse, server-side | C (version/use) / I (advisory status not re-verified offline) |
| Low | `@supabase/auth-helpers-nextjs`, `-react` 0.15.0 | Deprecated upstream; **unused** (0 imports) | `grep -rln auth-helpers src`: none | Remove | C |
| Info | `@img/sharp-win32-x64` (Apache-2.0 AND **LGPL-3.0+**, libvips), `lightningcss` (MPL-2.0), `caniuse-lite` (CC-BY-4.0); dev: `axe-core` (MPL-2.0), `argparse` (Python-2.0) | Weak-copyleft or attribution, dynamically linked or build-time only. Acceptable; keep NOTICE files | lockfile + installed manifests | Ship licence notices | C |
| Info | `next` 16.0.10 | Not audited (`npm audit` not run: no network/install allowed). Check against current Next.js advisories before reuse | `package-lock.json` | Run `npm audit` in CI | — |
| Info | Project licence | Repo `LICENSE` is **TailAdmin MIT © 2023 TailAdmin**; there is no CGB copyright or licence for the original code | `LICENSE:1-3`, `README.md:1-20` | Keep the MIT notice; clarify IP ownership (§6) | C |

---

## 5. Recommendation and risks

### 5.1 Recommendation: (c) Hybrid. Rewrite the core, migrate the data, keep named pieces.
This follows from the matrix, not from preference:
- 22 of 29 rows are Missing or need REWRITE.
- Section C (≈41–62 pw) has nothing to reuse whatever we choose.
- What does exist (the ticket core, the asset register) sits on an undocumented schema, has client-side data access and tenancy, and has no tests. Building on it costs **more** than replacing it (§4.1).

**Keep (port into the new codebase):**
| Module | Why |
|---|---|
| `src/components/ui/*` (shadcn primitives), `src/layout/*`, `src/components/common/*` | Clean, generic, license-safe UI kit |
| `src/lib/askmira/*` + `src/app/api/integrations/askmira/*` + `supabase/migration_askmira.sql` | Best code in the repo; good model for every future connector. Re-point it at the new service layer and drop the service-key fallback (S12) |
| `src/lib/ticket-access.ts`, `src/lib/ticket-notify.ts` | Clear, client-validated permission and notification rules. Use them as the spec and port them into the new workflow engine |
| `src/lib/email.ts` templates | Reuse the layouts after fixing S6; move into tenant-editable templates |
| `src/components/asset/AssetImportDialog.tsx` (UX flow) | Good review/duplicate/report flow; swap `xlsx` and run the import server-side |
| Ticket transition logic in `api/tickets/{acquire,status,reopen,reassign}` | Optimistic-concurrency guards and hold/SLA pause maths are worth carrying over |

**Discard:** browser-direct DB access (109 calls), the email-domain tenancy model, every SQL script except as a data-mapping reference, `/api/activity/create`, `/api/notifications/create`, `/api/email/send`, and all TailAdmin demo code and unused dependencies.

**Platform note [I]:** keep PostgreSQL. Decide whether to keep Supabase. Self-hosting it on-prem means operating about 10 services (Kong, GoTrue, PostgREST, Realtime, Storage, …), and an agent gateway and job queue have to be built outside it anyway. A conventional backend (a single API service plus a Postgres-backed job queue plus the gateway) is easier to package, upgrade and run air-gapped.

### 5.2 Top 10 risks (most severe first)
| # | Risk | Severity | Basis |
|---|---|---|---|
| 1 | Unknown live RLS/grants. S1/S2 may already allow cross-tenant access or superadmin self-promotion in production | Critical | I (S1, S2) |
| 2 | No schema source of truth: base DDL missing, 3 conflicting triggers, manual SQL-Editor migrations. Fresh installs and upgrades can't be reproduced | High | C (§3.1, E5) |
| 3 | Phase 1 is about 85–90% net-new (A1, A4–A7, B1, all of C, D5, D6) | High | C (§4) |
| 4 | Confirmed API authZ flaws (S3–S8): forgeable audit, spoofed notifications, email relay (no HTML injection — see S6 correction), cross-tenant deletion, data leakage | High | C |
| 5 | On-prem blockers: hosted Supabase, Vercel `after()`/cron URL, no packaging, backup or upgrade path | High | C (D4, D5, D7) |
| 6 | Tenancy is the email domain and client-filtered; it can't model MSP customers, multi-domain orgs or contractors | High | C (D1) / I (impact) |
| 7 | Bus factor 1 (one author identity), no tests, pre-history missing, 6-month commit gap (Apr–Sep 2026) during production use | High | C (git) / I (risk) |
| 8 | Job reliability: SLA alerts and all emails are fire-and-forget with no retry; missed breaches go unnoticed | Medium | C (D7) |
| 9 | Licence exposure: AGPL and revenue-capped ApexCharts in the dependency tree; template-derived codebase with unclear IP | Medium | C (§4.3) |
| 10 | Data quality for migration: nullable or inconsistent `org_domain`, free-text asset fields, forgeable activity history, unknown whether the unique asset code index was applied | Medium | C (scripts) / I (state) |

### 5.3 Effort delta to Phase 1 (estimates, ±30%)
| Section | Hybrid (rec.) | Build on current | Delta |
|---|---|---|---|
| A ITSM core | 41–62 | 40–60 | ≈0 |
| B CMDB | 8–13 | 8–12 | ≈0 |
| C Agent and patching | 41–62 | 41–62 | 0 |
| D Platform/on-prem | 29–47 | 33–53 | hybrid 4–6 cheaper |
| Retrofit (E1, E3, E5, browser→API) | — | 12–20 | hybrid 12–20 cheaper |
| **Total** | **119–184** | **134–207** | **hybrid ≈15–23 pw cheaper** |
Excludes remote desktop (add XL), UX design, documentation, certification and pen-test.

### 5.4 Data migration note
No production data was inspected. The table below is based on the code-implied schema.

| Carry over | Mapping notes |
|---|---|
| `organizations`, `user_organization_access` | Becomes tenants and membership. Domain becomes one of possibly several login domains |
| `users` profile columns | HR fields (employee_id, designation, department, manager, addresses) map to person attributes. **Passwords** live in Supabase `auth.users` as bcrypt hashes. They are portable only if `auth` schema export is possible; otherwise force a reset |
| `tickets` | All become `Incident` (or `Service Request` where category = "Service Requests"). Status map: new→New, open/in_progress→In Progress, hold→Pending, closed→Resolved/Closed. Priority low/medium/high maps to a default impact×urgency. SLA timestamps and breach flags become **historical, read-only** (no calendar data exists to recompute them). UUIDs are kept; assign new human-readable numbers |
| `ticket_messages` | Comments/worklog (public) |
| `ticket_activity`, `ticket_assignments` | Import as *legacy history*, flagged **non-authoritative** because S4 made activity forgeable |
| `assets` + `asset_details` + `asset_assignments` + `asset_tickets` | Become CIs (type from normalised `asset_type`), EAV keys become typed attributes, assignment history and ticket↔CI links. Run duplicate-code check first (`supabase/migration_unique_asset_code.sql:17-24`) |
| Storage bucket `ticket-attachments` | Copy objects; rewrite keys (`tickets/<id>/<ts>-<name>`) |
| **Do not migrate** | `notifications` (transient), `askmira_connect_codes`, `askmira_used_tokens` (ephemeral). Re-establish `askmira_links` by reconnecting: secrets are derived from server keys (`core.ts:198`) and won't survive a key change |

### 5.5 Five questions for the client's team before committing
1. **Can you give us a read-only schema dump of production?** That means `pg_dump --schema-only` including RLS policies, column grants, triggers, storage bucket policies and enabled auth providers. Which of the 9 SQL scripts were run, and in what order?
2. **Who owns the code and the accounts?** That covers the GitHub repo (personal namespace), the Supabase and Vercel projects, and the SMTP and AskMira secrets. Was anything changed outside git between April and September 2026, while there were no commits?
3. **What do people actually use, and how much?** Monthly tickets, active users, organisations and assets; which modules are used daily (assets, AskMira, multi-org, chat). Are the 15-minute/6-hour SLAs contractual, and is any SLA reporting given to customers?
4. **Has anything gone wrong security-wise?** Any incidents, pen tests or suspicious role changes? Is Google sign-in enabled in Supabase? Are there users outside whitelisted domains, or more superadmins than expected?
5. **What does the endpoint estate look like?** OS mix and counts, sites, network segmentation and air-gapped sites, current patch and remote tools, and the identity source (AD/Entra/other). This sizes Section C and D2.

---

## 6. Open questions
| # | Question | Why it matters | Where we looked |
|---|---|---|---|
| O1 | What RLS policies and grants are live on `users`, `tickets`, `assets*`, `organizations`, `user_organization_access`, `notifications`, `ticket_messages`? | Decides S1/S2/S3 severity and whether a breach is possible today | Repo SQL only. `notifications` has **no DDL at all** in the repo (searched `notifications` in `*.sql`) |
| O2 | Are the `mt_*` org_domain policies (`supabase-multitenant-migration.sql:149-273`) actually active? | `api/tickets/create` never sets `org_domain`. If the policies were active, new tickets would be invisible to everyone, and superadmin cross-org views would fail. Behaviour suggests they are not active, or a DB default/trigger fills `org_domain` | `create/route.ts:98-113`; `org.ts:57-68` |
| O3 | Which `handle_new_user()` version is live? | Determines whether new users get `org_domain` and `is_verified` | 3 versions (§3.1) |
| O4 | Is `CRON_SECRET` set in production? Is `ASKMIRA_LINK_SECRET` set, or is the service-role fallback in use? | S9, S12 | Code only; no env files present |
| O5 | Is the `ticket-attachments` bucket private? Who can read attachments? (No UI ever reads them back) | Data exposure; feature completeness | `grep createSignedUrl\|getPublicUrl\|download`: none |
| O6 | Was `migration_unique_asset_code.sql` applied, and were duplicates cleaned? | Data migration quality | Script `:14-28` |
| O7 | Is the role stored as `superadmin` or `super_admin` in production? | A mismatch silently breaks superadmin checks | `supabase-superadmin-migration.sql:124-126` vs `ticket-access.ts:13` |
| O8 | Which Supabase plan, and is point-in-time recovery or backup enabled? | D5 backup/restore; RPO/RTO today | No repo evidence |
| O9 | Is "Artbox Solutions" (named in `supabase-superadmin-migration.sql:134`) a second live tenant? | Confirms MSP-style multi-org usage, which tenancy design must support | SQL comment only |

### Live-usage signals (Step 4, from code and git only; no data access)
- **Most-worked areas, last 6 months [C]:** asset management (assets page, form, import, filters, "duplicay checks", "asset taging"), multi-org visibility (`org.ts`, "show IT staff every organization's assets"), and the AskMira HRMS link (connector added 2026-10-22, 5 follow-up commits). Ticket flow is mature and changes less.
- **Custom fields [C]:** HR-style profile fields on `users` (`UserInfoCard.tsx:209-222`); fixed asset detail keys (`AssetForm.tsx:64-80`).
- **Client-specific hardcoding that breaks a multi-client product [C]:**
  - 56 "CGB"/"Artbox" references across 32 TS/TSX files: page titles, e.g. `app/(admin)/page.tsx:11-13`; email branding `email.ts:335,457,589-591`; `BRAND` `askmira/core.ts:29`
  - client domains in SQL (`supabase-superadmin-migration.sql:133-134`)
  - production URL in the cron job (`migration_sla_cron.sql:20`)
  - global category taxonomy (`ticket-categories.ts`)
  - global SLA 15 min/6 h and hold options 24/48/72 h
  - a single SMTP sender identity
- **Inferred usage model [I]:** CGB acts as an IT service provider for several client companies (superadmin over organisations, cross-org staff grants). That is an MSP pattern, which the email-domain tenancy model cannot represent cleanly.

---

## 7. Appendix

### A. ER summary (reconstructed; `*` = DDL not in repo)
```
auth.users (Supabase) 1───1 users*  {id, email, full_name, role, org_domain?, phone, employee_id, designation,
                                     department, position, manager, present/permanent_address, city, postal_code,
                                     country, avatar_url, last_seen_at, is_verified, verification_token, token_expiry}
organizations {id, name, domain UNIQUE, status CHECK(active|inactive)}
users ─< user_organization_access >─ organizations          (cross-org grants; UNIQUE(user_id, organization_id))
users(requester) ─< tickets* >─ users(assignee)             {subject, description, category, sub_category, priority,
                                                             status, location, link, contact, requester_name,
                                                             closed_comment, hold_*, sla_* (8 cols), org_domain, created_at}
tickets ─< ticket_messages*      {sender_id, sender_role(user|engineer), message}
tickets ─< ticket_attachments*   {file_name, file_path→Storage 'ticket-attachments', file_type, file_size}
tickets ─< ticket_activity       {actor_id, action, details jsonb}            (CASCADE)
tickets ─< ticket_assignments    {engineer_id, assigned_at, unassigned_at, action}
users   ─< notifications*        {actor_id, ticket_id, type, message, is_read}
organizations ─< assets*         {asset_code UNIQUE(upper(trim)), asset_type, model, status, location, department}
assets ─< asset_details*         {key, value}                                 (EAV)
assets ─< asset_assignments* >─ users   {returned_at}
assets ─< asset_tickets* >─ tickets
organizations 1─1 askmira_links {askmira_tenant_id UNIQUE, secret_nonce}; ─< askmira_connect_codes; ─< askmira_people >─ users
askmira_used_tokens {jti, expires_at}
```
Implicit tenancy key everywhere: `lower(split_part(users.email,'@',2)) = organizations.domain`.

### B. Environment variables referenced (names only; no values read or present)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `CRON_SECRET`, `ASKMIRA_LINK_SECRET`, `ASKMIRA_ALLOWED_ORIGINS`.
`SUPABASE_SERVICE_ROLE_KEY` (full DB bypass) is read in 11 files, all server-side (9 under `src/app/api`, plus `src/lib/ticket-server.ts` and `src/lib/askmira/core.ts`, the latter also as the AskMira fallback, S12). It is never `NEXT_PUBLIC_`.

### C. Commands and searches used (all read-only)
- Structure and size: `find . -path ./node_modules -prune …`, per-directory `wc -l`, largest files `wc -l | sort -rn`
- Git: `git log --oneline | wc -l`; `git log --format='%an' | sort | uniq -c`; `git log --since=2026-05-11 --name-only` (hotspots); commits per month; `git show --stat a313413 f7d4368`; `git log --all --name-only | grep -iE '\.env|secret|key'`
- Markers: `grep -rnE 'TODO|FIXME|HACK|XXX' src supabase *.sql` (none)
- Schema: read all 9 `*.sql`; `grep -rhoE '\.from\("…"\)' src` (table inventory); `grep -rn '\.rpc\(|\.channel\('`; storage usage grep
- Access control: read every file under `src/app/api/**` and `src/lib/*.ts`; `grep -rnE '\.(update|insert|upsert|delete)\(' app components` (browser writes); client `.from(` count excluding `app/api`
- Feature sweep (each counted and inspected): `knowledge|kb_article|article`, `problem`, `change_request|CAB|change_type`, `approv`, `catalog`, `service_request|request_type|ticket_type`, `impact|urgency`, `business_hours|calendar_id|holiday|timezone`, `escalat`, `imap|inbound|mailparser|pop3`, `ldap|active directory|saml|oidc|openid|signInWithOAuth|signInWithSSO|azure`, `mfa|totp|factor`, `agent|heartbeat|check-in|inventory`, `patch|wsus|winget`, `remote shell|websocket|rdp|vnc|webrtc`, `relationship|depends_on|parent_id|ci_type`, `logger|pino|winston|sentry|opentelemetry`, `health|readyz|livez`, `backup|restore`, `queue|bull|pgmq|worker`, `rate.?limit|Content-Security-Policy`, `dangerouslySetInnerHTML|innerHTML|eval(`
- Packaging: `ls Dockerfile* docker-compose* .github vercel.json jest.config* vitest.config* playwright*` (none)
- Licences: parsed `package-lock.json` `packages`, resolving missing `license` from each installed `node_modules/<pkg>/package.json` (`python -I`, read-only); read `node_modules/react-apexcharts/LICENSE`, `node_modules/@react-jvectormap/lib/package.json`
- Dead code: `grep -rln 'components/<dir>'` for template dirs (ecommerce 0, charts 0, videos 0 importers)
- Secrets: `process.env.*` inventory; `ls .env*` (none); no secret values were opened or printed
