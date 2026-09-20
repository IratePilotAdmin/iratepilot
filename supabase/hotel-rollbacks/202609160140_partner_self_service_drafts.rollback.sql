begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Preserve drafts, submitted applications, ownership, and history. Reopening
-- requires an explicit reviewed control change; do not replay CREATE TABLE.
update public.partner_onboarding_controls set enabled = false, updated_at = now() where singleton;
commit;
