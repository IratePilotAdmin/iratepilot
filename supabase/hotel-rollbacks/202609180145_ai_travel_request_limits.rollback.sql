begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

revoke all on function public.reserve_ai_travel_request_slot(uuid)
  from public, anon, authenticated, service_role;
drop function if exists public.reserve_ai_travel_request_slot(uuid);
drop table if exists public.ai_travel_request_windows;

commit;
