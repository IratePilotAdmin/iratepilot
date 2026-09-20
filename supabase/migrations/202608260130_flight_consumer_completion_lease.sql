begin;

-- Order completion is a resumable, externally mutating workflow. This
-- digest-only lease serializes the HTTP completion coordinator without ever
-- authorizing a Stripe or Duffel dispatch. Durable payment/provider journals
-- remain the sole authority for those side effects.
do $flight_consumer_preview_091_dependencies$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_passenger_refs') is null
    or to_regclass('public.flight_ticket_documents') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_consumer_duffel_webhook_pending_links') is null
    or to_regprocedure(
      'public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(uuid,integer,integer)'
    ) is null then
    raise exception 'Flight Consumer Preview completion lease requires migrations 068 through 090';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview completion lease requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_091_dependencies$;

do $flight_consumer_preview_091_relocked_precondition$
declare
  v_safe_count integer;
begin
  select count(*)::integer into v_safe_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and control.execution_kill_switch_engaged
     and not control.synthetic_execution_enabled
     and not control.provider_sandbox_traffic_enabled
     and not control.provider_live_traffic_enabled
     and not control.shopping_enabled
     and not control.order_enabled
     and not control.payment_enabled
     and not control.ticketing_enabled
     and not control.servicing_enabled
     and not control.provider_events_enabled
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 091 requires relock before hardening';
  end if;
end;
$flight_consumer_preview_091_relocked_precondition$;

-- Idempotency keys are customer-scoped within one execution scope. order_id is
-- the primary key, so the same order can never be rebound to a different key
-- or request digest. Only hashes enter this table; payment references and the
-- raw HTTP Idempotency-Key remain outside PostgreSQL.
create table public.flight_consumer_completion_leases (
  order_id uuid primary key references public.flight_orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  lease_state text not null check (lease_state in ('processing', 'released', 'completed')),
  lease_revision integer not null default 0 check (lease_revision >= 0),
  lease_token_sha256 text check (
    lease_token_sha256 is null or lease_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  completed_owner_token_sha256 text check (
    completed_owner_token_sha256 is null
    or completed_owner_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  processing_attempt_count integer not null default 1
    check (processing_attempt_count >= 1),
  outcome_sha256 text check (
    outcome_sha256 is null or outcome_sha256 ~ '^[0-9a-f]{64}$'
  ),
  result_order_status text check (
    result_order_status is null or result_order_status = 'ticketed'
  ),
  result_issued_ticket_count integer check (
    result_issued_ticket_count is null or result_issued_ticket_count > 0
  ),
  last_failure_sha256 text check (
    last_failure_sha256 is null or last_failure_sha256 ~ '^[0-9a-f]{64}$'
  ),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, customer_id, idempotency_key_sha256),
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  check (
    (lease_state = 'processing'
      and lease_token_sha256 is not null
      and completed_owner_token_sha256 is null
      and lease_acquired_at is not null
      and lease_expires_at is not null
      and heartbeat_at is not null
      and outcome_sha256 is null
      and result_order_status is null
      and result_issued_ticket_count is null
      and completed_at is null)
    or (lease_state = 'released'
      and lease_token_sha256 is null
      and completed_owner_token_sha256 is null
      and lease_acquired_at is not null
      and lease_expires_at is null
      and heartbeat_at is not null
      and outcome_sha256 is null
      and result_order_status is null
      and result_issued_ticket_count is null
      and last_failure_sha256 is not null
      and completed_at is null)
    or (lease_state = 'completed'
      and lease_token_sha256 is null
      and lease_expires_at is null
      and outcome_sha256 is not null
      and result_order_status = 'ticketed'
      and result_issued_ticket_count > 0
      and completed_at is not null)
  ),
  check (
    lease_acquired_at is null
    or (heartbeat_at >= lease_acquired_at and updated_at >= lease_acquired_at)
  ),
  check (lease_expires_at is null or lease_expires_at > heartbeat_at),
  check (completed_at is null or completed_at >= created_at),
  check (updated_at >= created_at)
);

create index flight_consumer_completion_leases_state_expiry_idx
  on public.flight_consumer_completion_leases (lease_state, lease_expires_at)
  where lease_state = 'processing';

create function public.protect_flight_consumer_completion_lease_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_completion_lease$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight completion lease evidence is append-preserving';
  end if;
  if tg_op = 'INSERT' then
    if new.lease_revision <> 0 or new.processing_attempt_count <> 1 then
      raise exception 'Flight completion lease must begin at its first exact revision';
    end if;
    return new;
  end if;
  if new.order_id is distinct from old.order_id
    or new.customer_id is distinct from old.customer_id
    or new.execution_mode is distinct from old.execution_mode
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.idempotency_key_sha256 is distinct from old.idempotency_key_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.created_at is distinct from old.created_at then
    raise exception 'Flight completion lease identity is immutable';
  end if;
  if old.lease_state = 'completed' then
    raise exception 'Completed Flight completion lease evidence is immutable';
  end if;
  if new.updated_at <= old.updated_at then
    raise exception 'Flight completion lease time must advance';
  end if;

  -- Heartbeats preserve the owner token and revision. They can only advance
  -- the two bounded liveness timestamps.
  if new.lease_revision = old.lease_revision then
    if old.lease_state <> 'processing'
      or new.lease_state <> 'processing'
      or new.lease_token_sha256 is distinct from old.lease_token_sha256
      or new.completed_owner_token_sha256
        is distinct from old.completed_owner_token_sha256
      or new.lease_acquired_at is distinct from old.lease_acquired_at
      or new.processing_attempt_count <> old.processing_attempt_count
      or new.outcome_sha256 is distinct from old.outcome_sha256
      or new.result_order_status is distinct from old.result_order_status
      or new.result_issued_ticket_count
        is distinct from old.result_issued_ticket_count
      or new.last_failure_sha256 is distinct from old.last_failure_sha256
      or new.completed_at is distinct from old.completed_at
      or new.heartbeat_at <= old.heartbeat_at
      or new.lease_expires_at <= old.lease_expires_at then
      raise exception 'Flight completion lease heartbeat is malformed';
    end if;
    return new;
  end if;

  if new.lease_revision <> old.lease_revision + 1 then
    raise exception 'Flight completion lease revision must advance by exact CAS';
  end if;
  if new.lease_state = 'processing' then
    if old.lease_state not in ('processing', 'released')
      or new.processing_attempt_count <> old.processing_attempt_count + 1
      or new.lease_token_sha256 is not distinct from old.lease_token_sha256 then
      raise exception 'Flight completion lease reclaim is malformed';
    end if;
    return new;
  end if;
  if new.lease_state = 'released' then
    if old.lease_state <> 'processing'
      or new.processing_attempt_count <> old.processing_attempt_count then
      raise exception 'Flight completion lease release is malformed';
    end if;
    return new;
  end if;
  if new.lease_state = 'completed' then
    if old.lease_state not in ('processing', 'released')
      or new.processing_attempt_count <> old.processing_attempt_count then
      raise exception 'Flight completion lease result is malformed';
    end if;
    return new;
  end if;
  raise exception 'Flight completion lease transition is not authorized';
end;
$protect_flight_consumer_completion_lease$;

create trigger flight_consumer_completion_lease_guard
before insert or update or delete on public.flight_consumer_completion_leases
for each row execute function public.protect_flight_consumer_completion_lease_v1();

create function public.acquire_flight_consumer_completion_lease_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_idempotency_key_sha256 text,
  p_request_sha256 text,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_lease_duration_seconds integer
)
returns table (
  decision text,
  lease_revision integer,
  lease_state text,
  lease_token_sha256 text,
  lease_expires_at timestamptz,
  order_status text,
  issued_ticket_count integer,
  provider_attempt_state text,
  provider_attempt_revision integer,
  payment_attempt_state text,
  payment_attempt_revision integer,
  provider_redispatch_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $acquire_flight_consumer_completion_lease$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_lease public.flight_consumer_completion_leases;
  v_provider public.flight_provider_request_attempts;
  v_capture public.flight_payment_operation_attempts;
  v_has_lease boolean;
  v_expected integer;
  v_issued integer;
  v_exact_ticketed boolean;
  v_now timestamptz := clock_timestamp();
  v_reclaim_at timestamptz;
  v_auto_outcome_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion lease is service-role only';
  end if;
  if p_customer_id is null or p_order_id is null
    or p_idempotency_key_sha256 is null
    or p_idempotency_key_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 is null or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_duration_seconds is null
    or p_lease_duration_seconds not between 30 and 300 then
    raise exception 'Flight completion lease input is invalid';
  end if;

  -- Every RPC in this contract uses the same order: order, lease, provider
  -- create-order journal, then Stripe capture journal.
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
   for update;
  if not found
    or v_order.customer_id is distinct from p_customer_id
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.execution_scope_sha256 is distinct from p_execution_scope_sha256 then
    raise exception 'Flight completion order owner or execution scope does not match';
  end if;

  select * into v_lease
    from public.flight_consumer_completion_leases as completion_lease
   where completion_lease.order_id = p_order_id
   for update;
  v_has_lease := found;

  select * into v_provider
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  select * into v_capture
    from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.operation = 'capture'
   for update;

  select count(*)::integer into v_expected
    from public.flight_passenger_refs as passenger
   where passenger.order_id = p_order_id;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = p_order_id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  v_exact_ticketed := v_order.status = 'ticketed'
    and v_order.provider_order_ref_ciphertext is not null
    and v_order.provider_order_ref_sha256 is not null
    and v_expected > 0
    and v_issued = v_expected
    and not exists (
      select 1
        from public.flight_passenger_refs as passenger
       where passenger.order_id = p_order_id
         and (select count(*)
                from public.flight_ticket_documents as document
               where document.order_id = p_order_id
                 and document.passenger_ref_id = passenger.id
                 and document.document_type = 'electronic_ticket'
                 and document.status = 'issued') <> 1
    )
    and v_provider.id is not null
    and v_provider.state = 'succeeded'
    and v_provider.revision = 2
    and v_capture.id is not null
    and v_capture.state = 'succeeded'
    and v_capture.revision = 2;

  if v_has_lease then
    if v_lease.customer_id is distinct from p_customer_id
      or v_lease.execution_mode <> 'test'
      or v_lease.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or v_lease.idempotency_key_sha256 is distinct from p_idempotency_key_sha256
      or v_lease.request_sha256 is distinct from p_request_sha256 then
      raise exception 'Flight completion idempotency key or request collides';
    end if;
    if v_lease.lease_state = 'completed' then
      if v_lease.result_order_status <> 'ticketed'
        or v_lease.result_issued_ticket_count is null
        or v_lease.result_issued_ticket_count < 1 then
        raise exception 'Flight completion replay result is malformed';
      end if;
      return query select
        'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
        null::text, null::timestamptz, v_lease.result_order_status,
        v_lease.result_issued_ticket_count, v_provider.state,
        v_provider.revision, v_capture.state, v_capture.revision, false;
      return;
    end if;
  end if;

  if v_order.status = 'ticketed' and not v_exact_ticketed then
    raise exception 'Ticketed Flight completion lacks exact durable evidence';
  end if;
  if v_exact_ticketed then
    v_auto_outcome_sha256 := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'domain', 'iratepilot.flight.consumer-completion-durable-replay.v1',
            'order_id', p_order_id::text,
            'customer_id', p_customer_id::text,
            'request_sha256', p_request_sha256,
            'issued_ticket_count', v_issued
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if v_has_lease then
      update public.flight_consumer_completion_leases
         set lease_state = 'completed',
             lease_revision = v_lease.lease_revision + 1,
             completed_owner_token_sha256 = v_lease.lease_token_sha256,
             lease_token_sha256 = null,
             lease_expires_at = null,
             outcome_sha256 = v_auto_outcome_sha256,
             result_order_status = 'ticketed',
             result_issued_ticket_count = v_issued,
             completed_at = v_now,
             updated_at = greatest(v_now, v_lease.updated_at + interval '1 microsecond')
       where order_id = p_order_id
         and lease_revision = v_lease.lease_revision
      returning * into v_lease;
    else
      insert into public.flight_consumer_completion_leases (
        order_id, customer_id, execution_mode, execution_scope_sha256,
        idempotency_key_sha256, request_sha256, lease_state, lease_revision,
        processing_attempt_count, outcome_sha256, result_order_status,
        result_issued_ticket_count, completed_at, created_at, updated_at
      ) values (
        p_order_id, p_customer_id, 'test', p_execution_scope_sha256,
        p_idempotency_key_sha256, p_request_sha256, 'completed', 0, 1,
        v_auto_outcome_sha256, 'ticketed', v_issued, v_now, v_now, v_now
      ) returning * into v_lease;
    end if;
    if not found then
      raise exception 'Flight completion durable replay CAS failed';
    end if;
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, null::timestamptz, v_lease.result_order_status,
      v_lease.result_issued_ticket_count, v_provider.state,
      v_provider.revision, v_capture.state, v_capture.revision, false;
    return;
  end if;

  if not v_has_lease then
    insert into public.flight_consumer_completion_leases (
      order_id, customer_id, execution_mode, execution_scope_sha256,
      idempotency_key_sha256, request_sha256, lease_state, lease_revision,
      lease_token_sha256, lease_acquired_at, lease_expires_at, heartbeat_at,
      processing_attempt_count, created_at, updated_at
    ) values (
      p_order_id, p_customer_id, 'test', p_execution_scope_sha256,
      p_idempotency_key_sha256, p_request_sha256, 'processing', 0,
      p_lease_token_sha256, v_now,
      v_now + make_interval(secs => p_lease_duration_seconds), v_now, 1,
      v_now, v_now
    ) returning * into v_lease;
    return query select
      'acquired'::text, v_lease.lease_revision, v_lease.lease_state,
      v_lease.lease_token_sha256, v_lease.lease_expires_at, v_order.status,
      null::integer, v_provider.state, v_provider.revision, v_capture.state,
      v_capture.revision, false;
    return;
  end if;

  if v_lease.lease_state = 'processing'
    and v_lease.lease_expires_at > v_now then
    return query select
      'processing'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, v_lease.lease_expires_at, v_order.status, null::integer,
      v_provider.state, v_provider.revision, v_capture.state,
      v_capture.revision, false;
    return;
  end if;

  -- A lease timeout is never provider authority. Reclaim reads both durable
  -- journals under lock and leaves the lease untouched while either dispatch
  -- is still inside its exact SQL deadline. An expired dispatch is reclaimable
  -- only so the application can execute its journal-specific retrieve/review
  -- path; provider_redispatch_authorized remains false.
  if (v_provider.state = 'dispatching' and v_provider.dispatch_not_after > v_now)
    or (v_capture.state = 'dispatching' and v_capture.dispatch_not_after > v_now) then
    return query select
      'processing'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, v_lease.lease_expires_at, v_order.status, null::integer,
      v_provider.state, v_provider.revision, v_capture.state,
      v_capture.revision, false;
    return;
  end if;

  v_reclaim_at := greatest(v_now, v_lease.updated_at + interval '1 microsecond');
  update public.flight_consumer_completion_leases
     set lease_state = 'processing',
         lease_revision = v_lease.lease_revision + 1,
         lease_token_sha256 = p_lease_token_sha256,
         completed_owner_token_sha256 = null,
         lease_acquired_at = v_reclaim_at,
         lease_expires_at =
           v_reclaim_at + make_interval(secs => p_lease_duration_seconds),
         heartbeat_at = v_reclaim_at,
         processing_attempt_count = v_lease.processing_attempt_count + 1,
         updated_at = v_reclaim_at
   where order_id = p_order_id
     and lease_revision = v_lease.lease_revision
     and lease_state = v_lease.lease_state
  returning * into v_lease;
  if not found then
    raise exception 'Flight completion lease reclaim CAS failed';
  end if;
  return query select
    'reclaimed'::text, v_lease.lease_revision, v_lease.lease_state,
    v_lease.lease_token_sha256, v_lease.lease_expires_at, v_order.status,
    null::integer, v_provider.state, v_provider.revision, v_capture.state,
    v_capture.revision, false;
exception
  when unique_violation then
    raise exception 'Flight completion idempotency key collides within the customer scope';
end;
$acquire_flight_consumer_completion_lease$;

create function public.heartbeat_flight_consumer_completion_lease_v1(
  p_order_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_lease_duration_seconds integer
)
returns table (
  decision text,
  lease_revision integer,
  lease_state text,
  lease_expires_at timestamptz,
  order_status text,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $heartbeat_flight_consumer_completion_lease$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_lease public.flight_consumer_completion_leases;
  v_now timestamptz := clock_timestamp();
  v_heartbeat_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion lease heartbeat is service-role only';
  end if;
  if p_order_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_duration_seconds is null
    or p_lease_duration_seconds not between 30 and 300 then
    raise exception 'Flight completion lease heartbeat input is invalid';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id for update;
  select * into v_lease
    from public.flight_consumer_completion_leases as completion_lease
   where completion_lease.order_id = p_order_id for update;
  if v_order.id is null or v_lease.order_id is null
    or v_lease.lease_state <> 'processing'
    or v_lease.lease_revision <> p_expected_revision
    or v_lease.lease_token_sha256 is distinct from p_lease_token_sha256
    or v_lease.lease_expires_at <= v_now then
    raise exception 'Flight completion lease heartbeat lost ownership';
  end if;
  v_heartbeat_at := greatest(v_now, v_lease.heartbeat_at + interval '1 microsecond');
  update public.flight_consumer_completion_leases
     set heartbeat_at = v_heartbeat_at,
         lease_expires_at =
           v_heartbeat_at + make_interval(secs => p_lease_duration_seconds),
         updated_at = greatest(
           v_heartbeat_at, v_lease.updated_at + interval '1 microsecond'
         )
   where order_id = p_order_id
     and lease_revision = p_expected_revision
     and lease_state = 'processing'
     and lease_token_sha256 = p_lease_token_sha256
  returning * into v_lease;
  if not found then
    raise exception 'Flight completion lease heartbeat CAS failed';
  end if;
  return query select
    'heartbeat'::text, v_lease.lease_revision, v_lease.lease_state,
    v_lease.lease_expires_at, v_order.status, null::integer;
end;
$heartbeat_flight_consumer_completion_lease$;

create function public.complete_flight_consumer_completion_lease_v1(
  p_order_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_outcome_sha256 text,
  p_issued_ticket_count integer
)
returns table (
  decision text,
  lease_revision integer,
  lease_state text,
  lease_expires_at timestamptz,
  order_status text,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_completion_lease$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_lease public.flight_consumer_completion_leases;
  v_provider public.flight_provider_request_attempts;
  v_capture public.flight_payment_operation_attempts;
  v_expected integer;
  v_issued integer;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion lease result is service-role only';
  end if;
  if p_order_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_outcome_sha256 is null or p_outcome_sha256 !~ '^[0-9a-f]{64}$'
    or p_issued_ticket_count is null or p_issued_ticket_count < 1 then
    raise exception 'Flight completion lease result input is invalid';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id for update;
  select * into v_lease
    from public.flight_consumer_completion_leases as completion_lease
   where completion_lease.order_id = p_order_id for update;
  select * into v_provider
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order' for update;
  select * into v_capture
    from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = p_order_id and attempt.operation = 'capture' for update;
  if v_order.id is null or v_lease.order_id is null then
    raise exception 'Flight completion lease result is unavailable';
  end if;
  if v_lease.lease_state = 'completed' then
    if v_lease.lease_revision <> p_expected_revision + 1
      or v_lease.completed_owner_token_sha256 is distinct from p_lease_token_sha256
      or v_lease.result_order_status <> 'ticketed'
      or v_lease.result_issued_ticket_count <> p_issued_ticket_count then
      raise exception 'Flight completion lease result replay collides';
    end if;
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::timestamptz, v_lease.result_order_status,
      v_lease.result_issued_ticket_count;
    return;
  end if;
  if v_lease.lease_state <> 'processing'
    or v_lease.lease_revision <> p_expected_revision
    or v_lease.lease_token_sha256 is distinct from p_lease_token_sha256 then
    raise exception 'Flight completion lease result lost ownership';
  end if;
  select count(*)::integer into v_expected
    from public.flight_passenger_refs as passenger where passenger.order_id = p_order_id;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = p_order_id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  if v_order.status <> 'ticketed'
    or v_order.provider_order_ref_ciphertext is null
    or v_order.provider_order_ref_sha256 is null
    or v_expected < 1
    or v_issued <> v_expected
    or v_issued <> p_issued_ticket_count
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = p_order_id
         and (select count(*) from public.flight_ticket_documents as document
               where document.order_id = p_order_id
                 and document.passenger_ref_id = passenger.id
                 and document.document_type = 'electronic_ticket'
                 and document.status = 'issued') <> 1
    )
    or v_provider.id is null or v_provider.state <> 'succeeded' or v_provider.revision <> 2
    or v_capture.id is null or v_capture.state <> 'succeeded' or v_capture.revision <> 2 then
    raise exception 'Flight completion result lacks exact durable ticket evidence';
  end if;
  update public.flight_consumer_completion_leases
     set lease_state = 'completed',
         lease_revision = v_lease.lease_revision + 1,
         completed_owner_token_sha256 = v_lease.lease_token_sha256,
         lease_token_sha256 = null,
         lease_expires_at = null,
         outcome_sha256 = p_outcome_sha256,
         result_order_status = 'ticketed',
         result_issued_ticket_count = p_issued_ticket_count,
         completed_at = v_now,
         updated_at = greatest(v_now, v_lease.updated_at + interval '1 microsecond')
   where order_id = p_order_id
     and lease_state = 'processing'
     and lease_revision = p_expected_revision
     and lease_token_sha256 = p_lease_token_sha256
  returning * into v_lease;
  if not found then
    raise exception 'Flight completion lease result CAS failed';
  end if;
  return query select
    'completed'::text, v_lease.lease_revision, v_lease.lease_state,
    null::timestamptz, v_lease.result_order_status,
    v_lease.result_issued_ticket_count;
end;
$complete_flight_consumer_completion_lease$;

create function public.release_flight_consumer_completion_lease_v1(
  p_order_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_failure_sha256 text
)
returns table (
  decision text,
  lease_revision integer,
  lease_state text,
  lease_expires_at timestamptz,
  order_status text,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $release_flight_consumer_completion_lease$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_lease public.flight_consumer_completion_leases;
  v_provider public.flight_provider_request_attempts;
  v_capture public.flight_payment_operation_attempts;
  v_expected integer;
  v_issued integer;
  v_exact_ticketed boolean;
  v_now timestamptz := clock_timestamp();
  v_auto_outcome_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion lease release is service-role only';
  end if;
  if p_order_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_failure_sha256 is null or p_failure_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight completion lease release input is invalid';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id for update;
  select * into v_lease
    from public.flight_consumer_completion_leases as completion_lease
   where completion_lease.order_id = p_order_id for update;
  select * into v_provider
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order' for update;
  select * into v_capture
    from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = p_order_id and attempt.operation = 'capture' for update;
  if v_order.id is null or v_lease.order_id is null then
    raise exception 'Flight completion lease release is unavailable';
  end if;
  if v_lease.lease_state = 'completed' then
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::timestamptz, v_lease.result_order_status,
      v_lease.result_issued_ticket_count;
    return;
  end if;

  select count(*)::integer into v_expected
    from public.flight_passenger_refs as passenger where passenger.order_id = p_order_id;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = p_order_id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  v_exact_ticketed := v_order.status = 'ticketed'
    and v_order.provider_order_ref_ciphertext is not null
    and v_order.provider_order_ref_sha256 is not null
    and v_expected > 0 and v_issued = v_expected
    and not exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = p_order_id
         and (select count(*) from public.flight_ticket_documents as document
               where document.order_id = p_order_id
                 and document.passenger_ref_id = passenger.id
                 and document.document_type = 'electronic_ticket'
                 and document.status = 'issued') <> 1
    )
    and v_provider.id is not null and v_provider.state = 'succeeded' and v_provider.revision = 2
    and v_capture.id is not null and v_capture.state = 'succeeded' and v_capture.revision = 2;
  if v_order.status = 'ticketed' and not v_exact_ticketed then
    raise exception 'Ticketed Flight completion release lacks exact durable evidence';
  end if;
  if v_exact_ticketed then
    v_auto_outcome_sha256 := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'domain', 'iratepilot.flight.consumer-completion-release-replay.v1',
            'order_id', p_order_id::text,
            'request_sha256', v_lease.request_sha256,
            'issued_ticket_count', v_issued
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    update public.flight_consumer_completion_leases
       set lease_state = 'completed',
           lease_revision = v_lease.lease_revision + 1,
           completed_owner_token_sha256 = v_lease.lease_token_sha256,
           lease_token_sha256 = null,
           lease_expires_at = null,
           outcome_sha256 = v_auto_outcome_sha256,
           result_order_status = 'ticketed',
           result_issued_ticket_count = v_issued,
           completed_at = v_now,
           updated_at = greatest(v_now, v_lease.updated_at + interval '1 microsecond')
     where order_id = p_order_id and lease_revision = v_lease.lease_revision
    returning * into v_lease;
    if not found then
      raise exception 'Flight completion release replay CAS failed';
    end if;
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::timestamptz, v_lease.result_order_status,
      v_lease.result_issued_ticket_count;
    return;
  end if;

  if v_lease.lease_state <> 'processing'
    or v_lease.lease_revision <> p_expected_revision
    or v_lease.lease_token_sha256 is distinct from p_lease_token_sha256 then
    raise exception 'Flight completion lease release lost ownership';
  end if;
  if (v_provider.state = 'dispatching' and v_provider.dispatch_not_after > v_now)
    or (v_capture.state = 'dispatching' and v_capture.dispatch_not_after > v_now) then
    return query select
      'held'::text, v_lease.lease_revision, v_lease.lease_state,
      v_lease.lease_expires_at, v_order.status, null::integer;
    return;
  end if;
  update public.flight_consumer_completion_leases
     set lease_state = 'released',
         lease_revision = v_lease.lease_revision + 1,
         lease_token_sha256 = null,
         lease_expires_at = null,
         last_failure_sha256 = p_failure_sha256,
         updated_at = greatest(v_now, v_lease.updated_at + interval '1 microsecond')
   where order_id = p_order_id
     and lease_state = 'processing'
     and lease_revision = p_expected_revision
     and lease_token_sha256 = p_lease_token_sha256
  returning * into v_lease;
  if not found then
    raise exception 'Flight completion lease release CAS failed';
  end if;
  return query select
    'released'::text, v_lease.lease_revision, v_lease.lease_state,
    null::timestamptz, v_order.status, null::integer;
end;
$release_flight_consumer_completion_lease$;

alter table public.flight_consumer_completion_leases enable row level security;
alter table public.flight_consumer_completion_leases force row level security;

revoke all on table public.flight_consumer_completion_leases
  from public, anon, authenticated, service_role;
revoke all on function public.protect_flight_consumer_completion_lease_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) to service_role;
grant execute on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) to service_role;
grant execute on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) to service_role;
grant execute on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) to service_role;

comment on table public.flight_consumer_completion_leases is
  'Digest-only, order-scoped TEST completion coordinator; never provider or payment dispatch authority.';
comment on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) is 'Acquires/reclaims one exact completion owner or replays durable ticketing; redispatch authority is always false.';
comment on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) is 'Extends only the exact unexpired completion owner lease.';
comment on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) is 'Commits a completion replay result only after exact durable ticket and journal attestation.';
comment on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) is 'Releases only the exact owner and holds the lease without mutation while a durable dispatch is unresolved.';

do $flight_consumer_preview_091_postcondition$
declare
  v_safe_count integer;
  v_acquire_source text;
  v_complete_source text;
  v_release_source text;
  v_forced boolean;
begin
  select count(*)::integer into v_safe_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and control.execution_kill_switch_engaged
     and not control.synthetic_execution_enabled
     and not control.provider_sandbox_traffic_enabled
     and not control.provider_live_traffic_enabled
     and not control.shopping_enabled
     and not control.order_enabled
     and not control.payment_enabled
     and not control.ticketing_enabled
     and not control.servicing_enabled
     and not control.provider_events_enabled
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 091 changed the locked runtime posture';
  end if;
  select relation.relforcerowsecurity into v_forced
    from pg_catalog.pg_class as relation
   where relation.oid = 'public.flight_consumer_completion_leases'::regclass;
  select routine.prosrc into v_acquire_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)'
   );
  select routine.prosrc into v_complete_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)'
   );
  select routine.prosrc into v_release_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.release_flight_consumer_completion_lease_v1(uuid,integer,text,text)'
   );
  if not coalesce(v_forced, false)
    or v_acquire_source is null
    or position('v_provider.state = ''dispatching''' in v_acquire_source) = 0
    or position('v_capture.state = ''dispatching''' in v_acquire_source) = 0
    or position('v_exact_ticketed' in v_acquire_source) = 0
    or position('false' in v_acquire_source) = 0
    or v_complete_source is null
    or position('v_issued <> p_issued_ticket_count' in v_complete_source) = 0
    or v_release_source is null
    or position('''held''::text' in v_release_source) = 0
    or has_table_privilege(
      'service_role', 'public.flight_consumer_completion_leases',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    or not has_function_privilege(
      'service_role',
      'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.heartbeat_flight_consumer_completion_lease_v1(uuid,integer,text,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.release_flight_consumer_completion_lease_v1(uuid,integer,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 091 postcondition failed';
  end if;
end;
$flight_consumer_preview_091_postcondition$;

commit;
