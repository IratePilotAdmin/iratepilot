begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create table if not exists public.ai_travel_request_windows (
  scope text primary key check (length(scope) between 3 and 160),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_travel_request_windows enable row level security;
revoke all on public.ai_travel_request_windows
  from public, anon, authenticated, service_role;

create or replace function public.reserve_ai_travel_request_slot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_scope text := 'openai:travel:user:' || p_user_id::text;
  v_global_scope constant text := 'openai:travel:global';
  v_user_started_at timestamptz;
  v_user_count integer;
  v_global_started_at timestamptz;
  v_global_count integer;
  v_retry_after integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Serialize the shared budget first, then the account budget, so every app
  -- instance observes the same counters without deadlocks or local memory.
  perform pg_advisory_xact_lock(hashtext(v_global_scope));
  perform pg_advisory_xact_lock(hashtext(v_user_scope));

  select window_started_at, request_count
    into v_global_started_at, v_global_count
  from public.ai_travel_request_windows
  where scope = v_global_scope;

  if v_global_started_at is null or v_global_started_at <= v_now - interval '24 hours' then
    v_global_started_at := v_now;
    v_global_count := 0;
  end if;

  select window_started_at, request_count
    into v_user_started_at, v_user_count
  from public.ai_travel_request_windows
  where scope = v_user_scope;

  if v_user_started_at is null or v_user_started_at <= v_now - interval '10 minutes' then
    v_user_started_at := v_now;
    v_user_count := 0;
  end if;

  if v_global_count >= 200 then
    v_retry_after := greatest(
      v_retry_after,
      ceil(extract(epoch from (v_global_started_at + interval '24 hours' - v_now)))::integer
    );
  end if;
  if v_user_count >= 5 then
    v_retry_after := greatest(
      v_retry_after,
      ceil(extract(epoch from (v_user_started_at + interval '10 minutes' - v_now)))::integer
    );
  end if;

  if v_retry_after > 0 then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after
    );
  end if;

  insert into public.ai_travel_request_windows (
    scope, window_started_at, request_count, updated_at
  ) values (
    v_global_scope, v_global_started_at, v_global_count + 1, v_now
  )
  on conflict (scope) do update set
    window_started_at = excluded.window_started_at,
    request_count = excluded.request_count,
    updated_at = excluded.updated_at;

  insert into public.ai_travel_request_windows (
    scope, window_started_at, request_count, updated_at
  ) values (
    v_user_scope, v_user_started_at, v_user_count + 1, v_now
  )
  on conflict (scope) do update set
    window_started_at = excluded.window_started_at,
    request_count = excluded.request_count,
    updated_at = excluded.updated_at;

  delete from public.ai_travel_request_windows
  where updated_at < v_now - interval '2 days';

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.reserve_ai_travel_request_slot(uuid)
  from public, anon, service_role;
grant execute on function public.reserve_ai_travel_request_slot(uuid)
  to authenticated;

comment on table public.ai_travel_request_windows is
  'Protected distributed request counters for the authenticated AI travel planner.';
comment on function public.reserve_ai_travel_request_slot(uuid) is
  'Atomically enforces five AI travel plans per account per ten minutes and two hundred platform-wide per day.';

commit;
