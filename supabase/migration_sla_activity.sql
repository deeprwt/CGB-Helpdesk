-- ================================================
-- CGB Helpdesk — SLA, Activity & Assignment Tables
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Add SLA & hold columns to tickets table
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS sla_response_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_response_breached  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_resolution_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_admin_notified   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hold_duration_hours  INT,
  ADD COLUMN IF NOT EXISTS hold_started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_until           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_paused_ms        BIGINT DEFAULT 0;

-- 2. Backfill sla_response_at for existing "new" tickets
UPDATE tickets
SET sla_response_at = created_at + INTERVAL '15 minutes'
WHERE sla_response_at IS NULL;

-- 3. Backfill sla_resolution_at for already-assigned tickets
UPDATE tickets
SET sla_resolution_at = assigned_at + INTERVAL '6 hours'
WHERE assigned_at IS NOT NULL AND sla_resolution_at IS NULL;

-- 4. Ticket Activity Log
CREATE TABLE IF NOT EXISTS ticket_activity (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,       -- created, acquired, closed, hold, reopened, reassigned, sla_response_breach, sla_resolution_breach
  details     JSONB,               -- { hold_duration: 24, reason: "...", previous_assignee: "...", engineer_name: "..." }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_created ON ticket_activity(created_at DESC);

-- 5. Ticket Assignment History
CREATE TABLE IF NOT EXISTS ticket_assignments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  engineer_id   UUID NOT NULL REFERENCES auth.users(id),
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  action        TEXT NOT NULL DEFAULT 'acquired'  -- acquired, reassigned
);

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket ON ticket_assignments(ticket_id);

-- 6. RLS Policies for ticket_activity
ALTER TABLE ticket_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read ticket_activity"
  ON ticket_activity FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role insert ticket_activity"
  ON ticket_activity FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 7. RLS Policies for ticket_assignments
ALTER TABLE ticket_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read ticket_assignments"
  ON ticket_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role insert ticket_assignments"
  ON ticket_assignments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Allow service role update ticket_assignments"
  ON ticket_assignments FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Backfill activity for existing tickets
INSERT INTO ticket_activity (ticket_id, actor_id, action, details, created_at)
SELECT id, requester_id, 'created', '{}', created_at
FROM tickets
WHERE id NOT IN (SELECT DISTINCT ticket_id FROM ticket_activity WHERE action = 'created');

-- Backfill "acquired" activity for already-assigned tickets
INSERT INTO ticket_activity (ticket_id, actor_id, action, details, created_at)
SELECT id, assignee, 'acquired', '{}', assigned_at
FROM tickets
WHERE assignee IS NOT NULL
  AND id NOT IN (SELECT DISTINCT ticket_id FROM ticket_activity WHERE action = 'acquired');

-- Backfill assignment history for already-assigned tickets
INSERT INTO ticket_assignments (ticket_id, engineer_id, assigned_at, action)
SELECT id, assignee, assigned_at, 'acquired'
FROM tickets
WHERE assignee IS NOT NULL
  AND id NOT IN (SELECT DISTINCT ticket_id FROM ticket_assignments);

-- 9. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_assignments;
