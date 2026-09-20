begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

revoke select on table public.ai_travel_request_windows from service_role;

commit;
