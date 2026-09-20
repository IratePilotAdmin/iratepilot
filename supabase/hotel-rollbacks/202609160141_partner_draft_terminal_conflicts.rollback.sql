begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';
-- Pause onboarding without destroying saved drafts or restoring the 40001
-- retry-loop defect. Keep the corrected conflict functions in place.
update public.partner_onboarding_controls
set enabled = false, updated_at = now() where singleton;
commit;
