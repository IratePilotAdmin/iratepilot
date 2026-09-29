begin;

drop view if exists public.ai_hotel_planner_runtime_readiness;
drop function if exists public.reserve_ai_hotel_planner_quota(uuid);
drop table if exists public.ai_hotel_planner_quota_windows;

commit;
