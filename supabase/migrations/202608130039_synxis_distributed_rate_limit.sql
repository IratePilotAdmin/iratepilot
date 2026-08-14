create table if not exists public.integration_rate_limit_slots (
  scope text primary key check (char_length(scope) between 1 and 120),
  next_start_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_rate_limit_slots enable row level security;
revoke all on table public.integration_rate_limit_slots from public, anon, authenticated;

create or replace function public.reserve_synxis_rate_limit_slot(
  p_scope text,
  p_interval_ms integer
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_next_start timestamptz;
  v_scheduled_start timestamptz;
begin
  if p_scope is null or char_length(btrim(p_scope)) not between 1 and 120 then
    raise exception 'Invalid SynXis rate-limit scope';
  end if;
  if p_interval_ms is null or p_interval_ms not between 200 and 1000 then
    raise exception 'SynXis rate-limit interval must be between 200 and 1000 milliseconds';
  end if;

  -- Serialize reservations for this connector across every application instance.
  -- Hash collisions only make unrelated scopes more conservative; they cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_scope, 0));

  select next_start_at
    into v_next_start
    from public.integration_rate_limit_slots
   where scope = p_scope
   for update;

  if not found then
    v_scheduled_start := v_now;
    insert into public.integration_rate_limit_slots (scope, next_start_at, updated_at)
    values (
      p_scope,
      v_scheduled_start + make_interval(secs => p_interval_ms / 1000.0),
      v_now
    );
  else
    v_scheduled_start := greatest(v_now, v_next_start);
    update public.integration_rate_limit_slots
       set next_start_at = v_scheduled_start + make_interval(secs => p_interval_ms / 1000.0),
           updated_at = v_now
     where scope = p_scope;
  end if;

  return greatest(
    0,
    ceil(extract(epoch from (v_scheduled_start - v_now)) * 1000)::integer
  );
end;
$$;

revoke all on function public.reserve_synxis_rate_limit_slot(text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_synxis_rate_limit_slot(text, integer)
  to service_role;
