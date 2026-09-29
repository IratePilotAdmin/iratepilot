begin;

-- A durable, authenticated per-user quota prevents one caller from consuming
-- the shared OpenAI budget or poisoning a global request queue. This table is
-- service-role-only and stores no prompts, hotel choices, or provider output.
create table public.ai_hotel_planner_quota_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.ai_hotel_planner_quota_windows enable row level security;
revoke all on public.ai_hotel_planner_quota_windows
  from public, anon, authenticated;
grant all on public.ai_hotel_planner_quota_windows to service_role;

create or replace function public.reserve_ai_hotel_planner_quota(
  p_user_id uuid
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_window interval := interval '10 minutes';
  v_limit integer := 5;
begin
  if p_user_id is null
    or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'A verified authenticated user is required for AI hotel planner quota'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ai-hotel-planner:' || p_user_id::text, 0)
  );

  select quota.window_started_at, quota.request_count
  into v_window_started_at, v_request_count
  from public.ai_hotel_planner_quota_windows as quota
  where quota.user_id = p_user_id
  for update;

  if not found or v_window_started_at <= v_now - v_window then
    insert into public.ai_hotel_planner_quota_windows (
      user_id,
      window_started_at,
      request_count,
      updated_at
    ) values (
      p_user_id,
      v_now,
      1,
      v_now
    )
    on conflict (user_id) do update
      set window_started_at = excluded.window_started_at,
          request_count = excluded.request_count,
          updated_at = excluded.updated_at;
    return query select true, 0;
    return;
  end if;

  if v_request_count >= v_limit then
    return query select
      false,
      greatest(
        1,
        ceil(extract(epoch from (v_window_started_at + v_window - v_now)))::integer
      );
    return;
  end if;

  update public.ai_hotel_planner_quota_windows as quota
  set request_count = quota.request_count + 1,
      updated_at = v_now
  where quota.user_id = p_user_id;

  return query select true, 0;
end;
$$;

revoke all on function public.reserve_ai_hotel_planner_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_hotel_planner_quota(uuid)
  to service_role;

create view public.ai_hotel_planner_runtime_readiness
with (security_invoker = true)
as
select
  to_regclass('public.ai_hotel_planner_quota_windows') is not null
    as quota_table_ready,
  to_regprocedure('public.reserve_ai_hotel_planner_quota(uuid)') is not null
    as quota_function_ready;
revoke all on public.ai_hotel_planner_runtime_readiness
  from public, anon, authenticated;
grant select on public.ai_hotel_planner_runtime_readiness to service_role;

comment on function public.reserve_ai_hotel_planner_quota(uuid) is
  'Atomically allows at most five AI hotel planner attempts per authenticated user in ten minutes. It grants no provider, booking, payment, or Production authority.';

commit;
