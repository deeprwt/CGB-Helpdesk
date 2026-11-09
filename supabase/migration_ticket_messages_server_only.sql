-- =============================================================================
-- Ticket chat: server-only writes
-- Run once in the Supabase SQL Editor, AFTER the app version that sends chat
-- messages through POST /api/tickets/message is deployed.
--
-- Messages are now written only by the server (/api/tickets/message and the
-- AskMira reply action, both using the service role). The server checks that
-- the sender is the ticket's requester or its CURRENT assigned engineer.
-- This stops browsers from writing to the table directly, so that rule can't
-- be bypassed from the browser console. Reading messages (and realtime) is
-- unaffected; the service role keeps full access.
-- =============================================================================

REVOKE INSERT, UPDATE, DELETE ON public.ticket_messages FROM anon, authenticated;

-- To undo:
-- GRANT INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
