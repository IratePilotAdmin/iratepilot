begin;

-- Production live shopping is isolated from all consumer order and payment
-- tables. This journal stores only digests and bounded terminal metadata. It
-- cannot create an order, charge a payment method, settle, or issue a ticket.
create table public.flight_consumer_live_duffel_shopping_attempts (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null
    check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  operation text not null default 'create_offer_request'
    check (operation = 'create_offer_request'),
  attempt_state text not null default 'prepared'
    check (attempt_state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous')),
  attempt_revision integer not null default 0
    check (attempt_revision between 0 and 2),
  dispatch_not_after timestamptz not null,
  dispatch_started_at timestamptz,
  terminal_http_status integer
    check (terminal_http_status is null or terminal_http_status between 100 and 599),
  terminal_response_sha256 text
    check (terminal_response_sha256 is null or terminal_response_sha256 ~ '^[0-9a-f]{64}$'),
  terminal_response_bytes integer
    check (terminal_response_bytes is null or terminal_response_bytes between 0 and 4194304),
  offer_count integer
    check (offer_count is null or offer_count between 0 and 1000),
  prepared_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, idempotency_sha256),
  check (dispatch_not_after > prepared_at),
  check (
    (attempt_state = 'prepared'
      and attempt_revision = 0
      and dispatch_started_at is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and offer_count is null
      and completed_at is null)
    or (attempt_state = 'dispatching'
      and attempt_revision = 1
      and dispatch_started_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and offer_count is null
      and completed_at is null)
    or (attempt_state = 'succeeded'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and terminal_http_status between 200 and 299
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and offer_count is not null
      and completed_at is not null)
    or (attempt_state = 'failed'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and terminal_http_status is not null
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and offer_count is null
      and completed_at is not null)
    or (attempt_state = 'ambiguous'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and offer_count is null
      and completed_at is not null)
  )
);

create index flight_consumer_live_duffel_shopping_state_idx
  on public.flight_consumer_live_duffel_shopping_attempts (
    attempt_state, updated_at desc
  );

alter table public.flight_consumer_live_duffel_shopping_attempts
  enable row level security;
alter table public.flight_consumer_live_duffel_shopping_attempts
  force row level security;

revoke all on table public.flight_consumer_live_duffel_shopping_attempts
  from public, anon, authenticated, service_role;

create function public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  terminal_http_status integer,
  terminal_response_sha256 text,
  terminal_response_bytes integer,
  offer_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_live_duffel_shopping_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel shopping journal is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_not_after is null
    or p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '2 minutes' then
    raise exception 'Flight Consumer Live Duffel shopping request envelope is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.idempotency_sha256 = p_idempotency_sha256
   for update;
  if found then
    if v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256
      or v_attempt.operation is distinct from 'create_offer_request' then
      raise exception 'Flight Consumer Live Duffel shopping idempotency collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.terminal_http_status,
      v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
      v_attempt.offer_count;
    return;
  end if;

  insert into public.flight_consumer_live_duffel_shopping_attempts (
    execution_scope_sha256, idempotency_sha256, request_sha256,
    request_body_sha256, dispatch_not_after
  ) values (
    p_execution_scope_sha256, p_idempotency_sha256, p_request_sha256,
    p_request_body_sha256, p_dispatch_not_after
  ) returning * into v_attempt;

  return query select
    'created'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
    v_attempt.offer_count;
exception
  when unique_violation then
    select * into v_attempt
      from public.flight_consumer_live_duffel_shopping_attempts as attempt
     where attempt.execution_scope_sha256 = p_execution_scope_sha256
       and attempt.idempotency_sha256 = p_idempotency_sha256
     for update;
    if not found
      or v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256 then
      raise exception 'Flight Consumer Live Duffel shopping concurrency collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.terminal_http_status,
      v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
      v_attempt.offer_count;
end;
$prepare_flight_consumer_live_duffel_shopping_attempt_v1$;

create function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_live_duffel_shopping_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel shopping journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Duffel shopping dispatch claim is invalid';
  end if;

  update public.flight_consumer_live_duffel_shopping_attempts
     set attempt_state = 'dispatching',
         attempt_revision = 1,
         dispatch_started_at = v_now,
         updated_at = v_now
   where id = p_attempt_id
     and execution_scope_sha256 = p_execution_scope_sha256
     and operation = 'create_offer_request'
     and attempt_state = 'prepared'
     and attempt_revision = p_expected_revision
     and dispatch_not_after > v_now
  returning * into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel shopping dispatch claim CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state, v_attempt.attempt_revision;
end;
$claim_flight_consumer_live_duffel_shopping_attempt_v1$;

create function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes integer,
  p_offer_count integer
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_live_duffel_shopping_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel shopping journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 1
    or p_terminal_state not in ('succeeded', 'failed', 'ambiguous') then
    raise exception 'Flight Consumer Live Duffel shopping completion envelope is invalid';
  end if;
  if p_terminal_state = 'succeeded' and not (
    p_terminal_http_status between 200 and 299
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_terminal_response_bytes between 0 and 4194304
    and p_offer_count between 0 and 1000
  ) then
    raise exception 'Flight Consumer Live Duffel shopping success evidence is invalid';
  elsif p_terminal_state = 'failed' and not (
    p_terminal_http_status between 100 and 599
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_terminal_response_bytes between 0 and 4194304
    and p_offer_count is null
  ) then
    raise exception 'Flight Consumer Live Duffel shopping failure evidence is invalid';
  elsif p_terminal_state = 'ambiguous' and not (
    p_terminal_http_status is null
    and p_terminal_response_sha256 is null
    and p_terminal_response_bytes is null
    and p_offer_count is null
  ) then
    raise exception 'Flight Consumer Live Duffel shopping ambiguity evidence is invalid';
  end if;

  update public.flight_consumer_live_duffel_shopping_attempts
     set attempt_state = p_terminal_state,
         attempt_revision = 2,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         offer_count = p_offer_count,
         completed_at = v_now,
         updated_at = v_now
   where id = p_attempt_id
     and operation = 'create_offer_request'
     and attempt_state = 'dispatching'
     and attempt_revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel shopping completion CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state, v_attempt.attempt_revision;
end;
$complete_flight_consumer_live_duffel_shopping_attempt_v1$;

alter function public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
  text, text, text, text, timestamptz
) owner to postgres;
alter function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) owner to postgres;
alter function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) owner to postgres;

revoke all on function public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
  text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) to service_role;
grant execute on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) to service_role;

comment on table public.flight_consumer_live_duffel_shopping_attempts is
  'Digest-only Production Duffel live-shopping dark journal. It carries no provider references, passenger PII, credentials, raw payloads, orders, or payments.';

commit;
