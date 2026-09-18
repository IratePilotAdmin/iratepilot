begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

-- The settings route uses the server-only service role and filters to the
-- platform aggregate scope. Authenticated browser clients remain unable to
-- read this table or its per-account counters.
grant select on table public.ai_travel_request_windows to service_role;

commit;
