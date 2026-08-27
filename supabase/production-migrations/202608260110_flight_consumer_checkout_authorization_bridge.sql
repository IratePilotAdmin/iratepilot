begin;

-- Forward repair for the frozen 107 -> 109 -> 108 state ordering. This
-- migration records evidence only: it cannot contact Stripe or Duffel,
-- authorize a provider dispatch, create/capture/refund a payment, create an
-- order, issue a ticket, service a booking, or release a consumer path.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_checkout_evidence_aggregates'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_checkout_evidence_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_executions'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_execution_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_confirmation_attempts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_confirmation_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_executions'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_live_checkout_evidence_v1(uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_duffel_order_execution_v1(uuid,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,text,timestamp with time zone)'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_live_stripe_confirmation_terminal_v1(uuid,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,boolean)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live checkout authorization bridge requires frozen 106 through 109 and SHA-256 prerequisites';
  end if;
end;
$migration$;

create table public.flight_consumer_live_checkout_authorization_bridges (
  checkout_aggregate_id uuid primary key references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  stripe_confirmation_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_confirmation_attempts(id)
    on delete restrict,
  stripe_execution_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_payment_executions(id)
    on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique,
  checkout_execution_scope_sha256 text not null
    check (checkout_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_binding_sha256 text not null unique
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_prepared_receipt_sha256 text not null unique
    check (checkout_prepared_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_finalized_receipt_sha256 text not null unique
    check (checkout_finalized_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_bridge_receipt_sha256 text not null unique
    check (authorization_bridge_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_workflow_sha256 text not null
    check (stripe_execution_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_prerequisite_sha256 text not null
    check (stripe_execution_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_completed_receipt_sha256 text not null unique
    check (stripe_execution_completed_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_execution_scope_sha256 text not null
    check (confirmation_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_binding_sha256 text not null unique
    check (confirmation_binding_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_workflow_sha256 text not null unique
    check (confirmation_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_prerequisite_sha256 text not null
    check (confirmation_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_state text not null check (
    confirmation_state in ('authorized_requires_capture', 'reconciled')
  ),
  confirmation_revision integer not null check (
    confirmation_revision in (2, 3)
  ),
  confirmation_reconciled_outcome text check (
    confirmation_reconciled_outcome is null
    or confirmation_reconciled_outcome = 'authorized_requires_capture'
  ),
  confirmation_state_receipt_sha256 text not null unique
    check (confirmation_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_response_sha256 text not null
    check (provider_response_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_evidence_sha256 text not null
    check (confirmation_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observed_payment_intent_status text not null default 'requires_capture'
    check (observed_payment_intent_status = 'requires_capture'),
  observed_amount_cents bigint not null
    check (observed_amount_cents between 50 and 99999999),
  observed_currency text not null default 'usd'
    check (observed_currency = 'usd'),
  observed_livemode boolean not null default true check (observed_livemode),
  payment_intent_reference_sha256 text not null unique
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),
  finalization_evidence_sha256 text not null unique
    check (finalization_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_evidence_at timestamptz not null,
  authorization_not_after timestamptz not null,
  finalized_at timestamptz not null default clock_timestamp(),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  confirmation_handoff_authorized boolean not null default false
    check (not confirmation_handoff_authorized),
  booking_authorized boolean not null default false
    check (not booking_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  settlement_authorized boolean not null default false
    check (not settlement_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  check (order_reference_sha256 <> customer_reference_sha256),
  check (authorization_evidence_at <= finalized_at),
  check (finalized_at < authorization_not_after),
  check (observed_amount_cents = amount_cents),
  check (observed_currency = lower(currency)),
  check (
    (confirmation_state = 'authorized_requires_capture'
      and confirmation_revision = 2
      and confirmation_reconciled_outcome is null)
    or
    (confirmation_state = 'reconciled'
      and confirmation_revision = 3
      and confirmation_reconciled_outcome =
        'authorized_requires_capture')
  )
);

alter table public.flight_consumer_live_checkout_authorization_bridges
  enable row level security;
alter table public.flight_consumer_live_checkout_authorization_bridges
  force row level security;
revoke all on table
  public.flight_consumer_live_checkout_authorization_bridges
  from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_checkout_authorization_bridge_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_checkout_authorization_bridge_v1$
begin
  raise exception
    'Flight Consumer Live checkout authorization bridges are immutable';
end;
$protect_flight_consumer_live_checkout_authorization_bridge_v1$;

create trigger flight_consumer_live_checkout_authorization_bridge_guard
before update or delete
on public.flight_consumer_live_checkout_authorization_bridges
for each row execute function
  public.protect_flight_consumer_live_checkout_authorization_bridge_v1();

-- Frozen 109 validates the deadline before looking for an exact durable
-- replay. Keep its new-attempt checks intact behind an internal name, while
-- the public v1 boundary resolves exact replay/collision first.
alter function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  uuid, uuid, text, text, text, text, text, text, text,
  timestamp with time zone
) rename to prepare_flight_consumer_live_stripe_confirmation_frozen109;

revoke all on function
  public.prepare_flight_consumer_live_stripe_confirmation_frozen109(
    uuid, uuid, text, text, text, text, text, text, text,
    timestamp with time zone
  ) from public, anon, authenticated, service_role;

create function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  p_checkout_aggregate_id uuid,
  p_stripe_execution_attempt_id uuid,
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_confirmation_binding_sha256 text,
  p_confirmation_workflow_sha256 text,
  p_confirmation_prerequisite_sha256 text,
  p_checkout_state_receipt_sha256 text,
  p_stripe_execution_completed_receipt_sha256 text,
  p_confirmation_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  confirmation_state text,
  confirmation_revision integer,
  amount_cents bigint,
  currency text,
  payment_intent_reference_sha256 text,
  state_receipt_sha256 text,
  reconciled_outcome text,
  confirmation_handoff_authorized boolean,
  provider_dispatch_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
  order_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_live_stripe_confirmation_v1$
declare
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_match_count bigint;
  v_exact_match boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe confirmation preparation is service-role only';
  end if;
  if p_checkout_aggregate_id is null
    or p_stripe_execution_attempt_id is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_workflow_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_execution_completed_receipt_sha256
      !~ '^[0-9a-f]{64}$'
    or p_confirmation_not_after is null then
    raise exception
      'Flight Consumer Live Stripe confirmation envelope is invalid';
  end if;

  select count(*), coalesce(bool_and(row(
      candidate.checkout_aggregate_id,
      candidate.stripe_execution_attempt_id,
      candidate.execution_scope_sha256,
      candidate.idempotency_sha256,
      candidate.confirmation_binding_sha256,
      candidate.confirmation_workflow_sha256,
      candidate.confirmation_prerequisite_sha256,
      candidate.checkout_state_receipt_sha256,
      candidate.stripe_execution_completed_receipt_sha256,
      candidate.confirmation_not_after
    ) = row(
      p_checkout_aggregate_id, p_stripe_execution_attempt_id,
      p_execution_scope_sha256, p_idempotency_sha256,
      p_confirmation_binding_sha256, p_confirmation_workflow_sha256,
      p_confirmation_prerequisite_sha256,
      p_checkout_state_receipt_sha256,
      p_stripe_execution_completed_receipt_sha256,
      p_confirmation_not_after
    )), false)
    into v_match_count, v_exact_match
    from public.flight_consumer_live_stripe_confirmation_attempts as candidate
   where candidate.checkout_aggregate_id = p_checkout_aggregate_id
      or candidate.stripe_execution_attempt_id =
        p_stripe_execution_attempt_id
      or candidate.execution_scope_sha256 = p_execution_scope_sha256
      or candidate.idempotency_sha256 = p_idempotency_sha256
      or candidate.confirmation_binding_sha256 =
        p_confirmation_binding_sha256
      or candidate.confirmation_workflow_sha256 =
        p_confirmation_workflow_sha256;
  if v_match_count > 0 then
    if v_match_count <> 1 or not v_exact_match then
      raise exception
        'Flight Consumer Live Stripe confirmation replay collision';
    end if;
    select candidate.* into v_attempt
      from public.flight_consumer_live_stripe_confirmation_attempts
        as candidate
     where candidate.checkout_aggregate_id = p_checkout_aggregate_id
       and candidate.stripe_execution_attempt_id =
         p_stripe_execution_attempt_id
       and candidate.execution_scope_sha256 = p_execution_scope_sha256
       and candidate.idempotency_sha256 = p_idempotency_sha256
       and candidate.confirmation_binding_sha256 =
         p_confirmation_binding_sha256
       and candidate.confirmation_workflow_sha256 =
         p_confirmation_workflow_sha256
       and candidate.confirmation_prerequisite_sha256 =
         p_confirmation_prerequisite_sha256
       and candidate.checkout_state_receipt_sha256 =
         p_checkout_state_receipt_sha256
       and candidate.stripe_execution_completed_receipt_sha256 =
         p_stripe_execution_completed_receipt_sha256
       and candidate.confirmation_not_after = p_confirmation_not_after
     for update;
    return query select
      'replay'::text, v_attempt.id, v_attempt.confirmation_state,
      v_attempt.confirmation_revision, v_attempt.amount_cents,
      v_attempt.currency, v_attempt.payment_intent_reference_sha256,
      v_attempt.latest_state_receipt_sha256,
      v_attempt.reconciled_outcome,
      v_attempt.confirmation_handoff_authorized,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled,
      v_attempt.blind_retry_authorized;
    return;
  end if;

  -- Only a genuinely new identity reaches frozen 109, so all of its original
  -- deadline, digest-domain, prerequisite, uniqueness, and CAS checks remain
  -- authoritative and unchanged. The additional one-minute lower bound keeps
  -- a newly immutable attempt from being born inside 110's 15-second
  -- finalization/dispatch safety margin.
  if p_confirmation_not_after <=
    clock_timestamp() + interval '60 seconds' then
    raise exception
      'Flight Consumer Live Stripe confirmation new-attempt window is too short';
  end if;
  select delegated.* into
      decision, attempt_id, confirmation_state, confirmation_revision,
      amount_cents, currency, payment_intent_reference_sha256,
      state_receipt_sha256, reconciled_outcome,
      confirmation_handoff_authorized, provider_dispatch_authorized,
      stripe_dispatch_authorized, booking_authorized, order_authorized,
      payment_authorized, capture_authorized, refund_authorized,
      settlement_authorized, ticketing_authorized, servicing_authorized,
      consumer_release_enabled, blind_retry_authorized
    from public.prepare_flight_consumer_live_stripe_confirmation_frozen109(
      p_checkout_aggregate_id, p_stripe_execution_attempt_id,
      p_execution_scope_sha256, p_idempotency_sha256,
      p_confirmation_binding_sha256, p_confirmation_workflow_sha256,
      p_confirmation_prerequisite_sha256,
      p_checkout_state_receipt_sha256,
      p_stripe_execution_completed_receipt_sha256,
      p_confirmation_not_after
    ) as delegated;
  if not found then
    raise exception
      'Flight Consumer Live Stripe confirmation delegation returned no result';
  end if;
  -- Frozen 109 can block while it locks the checkout/execution rows and its
  -- own initial v_now would then be stale. Re-read trusted database time only
  -- after the delegate completes. Raising here rolls back any attempt that
  -- the delegated INSERT created, so a lock wait cannot leave a newly
  -- immutable attempt inside the one-minute safety window.
  if decision = 'created' and p_confirmation_not_after <=
    clock_timestamp() + interval '60 seconds' then
    raise exception
      'Flight Consumer Live Stripe confirmation new-attempt window expired during preparation';
  end if;
  return next;
  return;
end;
$prepare_flight_consumer_live_stripe_confirmation_v1$;

alter function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  uuid, uuid, text, text, text, text, text, text, text,
  timestamp with time zone
) owner to postgres;
revoke all on function
  public.prepare_flight_consumer_live_stripe_confirmation_v1(
    uuid, uuid, text, text, text, text, text, text, text,
    timestamp with time zone
  ) from public, anon, authenticated;
grant execute on function
  public.prepare_flight_consumer_live_stripe_confirmation_v1(
    uuid, uuid, text, text, text, text, text, text, text,
    timestamp with time zone
  ) to service_role;

create or replace function public.finalize_flight_consumer_live_checkout_evidence_v1(
  p_aggregate_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_checkout_binding_sha256 text,
  p_finalization_evidence_sha256 text
)
returns table (
  decision text,
  aggregate_id uuid,
  checkout_state text,
  checkout_revision integer,
  amount_cents bigint,
  currency text,
  state_receipt_sha256 text,
  provider_dispatch_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
  order_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $finalize_flight_consumer_live_checkout_evidence_v1$
declare
  v_aggregate public.flight_consumer_live_checkout_evidence_aggregates;
  v_confirmation public.flight_consumer_live_stripe_confirmation_attempts;
  v_execution public.flight_consumer_live_stripe_payment_executions;
  v_authorization_evidence_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_previous_receipt text;
  v_bridge_receipt text;
  v_receipt text;
  v_prerequisite_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live checkout evidence is service-role only';
  end if;
  if p_aggregate_id is null or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_finalization_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live checkout finalization is invalid';
  end if;

  select aggregate.* into v_aggregate
    from public.flight_consumer_live_checkout_evidence_aggregates as aggregate
   where aggregate.id = p_aggregate_id
     and aggregate.execution_scope_sha256 = p_execution_scope_sha256
     and aggregate.checkout_binding_sha256 = p_checkout_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live checkout finalization binding is invalid';
  end if;

  if v_aggregate.checkout_state = 'finalized'
    and v_aggregate.checkout_revision = 1
    and v_aggregate.finalization_evidence_sha256 =
      p_finalization_evidence_sha256 then
    select count(*) into v_prerequisite_count
      from public.flight_consumer_live_checkout_authorization_bridges as bridge
      join public.flight_consumer_live_stripe_confirmation_attempts
        as confirmation
        on confirmation.id = bridge.stripe_confirmation_attempt_id
      join public.flight_consumer_live_stripe_confirmation_receipts
        as confirmation_receipt
        on confirmation_receipt.attempt_id = confirmation.id
       and confirmation_receipt.confirmation_revision =
         bridge.confirmation_revision
       and confirmation_receipt.receipt_sha256 =
         bridge.confirmation_state_receipt_sha256
     where bridge.checkout_aggregate_id = v_aggregate.id
       and bridge.checkout_binding_sha256 =
         v_aggregate.checkout_binding_sha256
       and bridge.checkout_finalized_receipt_sha256 =
         v_aggregate.latest_state_receipt_sha256
       and bridge.authorization_bridge_receipt_sha256 ~
         '^[0-9a-f]{64}$'
       and bridge.finalization_evidence_sha256 =
         p_finalization_evidence_sha256
       and confirmation.latest_state_receipt_sha256 =
         bridge.confirmation_state_receipt_sha256
       and confirmation.confirmation_state = bridge.confirmation_state
       and confirmation.confirmation_revision = bridge.confirmation_revision
       and confirmation.provider_response_sha256 =
         bridge.provider_response_sha256
       and confirmation.confirmation_evidence_sha256 =
         bridge.confirmation_evidence_sha256
       and confirmation.observed_payment_intent_status =
         'requires_capture'
       and confirmation.observed_amount_cents = bridge.amount_cents
       and confirmation.observed_currency = lower(bridge.currency)
       and confirmation.observed_livemode
       and confirmation.observed_payment_intent_reference_sha256 =
         bridge.payment_intent_reference_sha256;
    if v_prerequisite_count is distinct from 1 then
      raise exception
        'Flight Consumer Live checkout finalization replay bridge is invalid';
    end if;
    return query select
      'replay'::text, v_aggregate.id, v_aggregate.checkout_state,
      v_aggregate.checkout_revision, v_aggregate.amount_cents,
      v_aggregate.currency, v_aggregate.latest_state_receipt_sha256,
      v_aggregate.provider_dispatch_authorized,
      v_aggregate.stripe_dispatch_authorized,
      v_aggregate.booking_authorized, v_aggregate.order_authorized,
      v_aggregate.payment_authorized, v_aggregate.capture_authorized,
      v_aggregate.refund_authorized, v_aggregate.settlement_authorized,
      v_aggregate.ticketing_authorized, v_aggregate.servicing_authorized,
      v_aggregate.consumer_release_enabled;
    return;
  end if;
  if v_aggregate.checkout_state <> 'prepared'
    or v_aggregate.checkout_revision <> p_expected_revision then
    raise exception 'Flight Consumer Live checkout finalization CAS failed';
  end if;

  select confirmation.* into v_confirmation
    from public.flight_consumer_live_stripe_confirmation_attempts
      as confirmation
   where confirmation.checkout_aggregate_id = v_aggregate.id
     and confirmation.stripe_execution_attempt_id =
       v_aggregate.stripe_execution_attempt_id
   for update;
  if not found then
    raise exception
      'Flight Consumer Live checkout finalization authorization is missing';
  end if;
  v_authorization_evidence_at := case
    when v_confirmation.confirmation_state = 'reconciled'
      then v_confirmation.reconciled_at
    else v_confirmation.terminal_at
  end;

  select execution.* into v_execution
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = v_aggregate.stripe_execution_attempt_id
   for update;
  if not found then
    raise exception
      'Flight Consumer Live checkout finalization execution is missing';
  end if;

  select count(*) into v_prerequisite_count
    from public.flight_consumer_live_duffel_offer_refresh_attempts as refresh
    join public.flight_consumer_live_checkout_evidence_receipts
      as checkout_receipt
      on checkout_receipt.aggregate_id = v_aggregate.id
     and checkout_receipt.checkout_revision = 0
     and checkout_receipt.receipt_kind = 'prepared'
     and checkout_receipt.checkout_state = 'prepared'
     and checkout_receipt.receipt_sha256 =
       v_aggregate.latest_state_receipt_sha256
    join public.flight_consumer_live_stripe_payment_execution_receipts
      as execution_receipt
      on execution_receipt.attempt_id = v_execution.id
     and execution_receipt.attempt_revision = 2
     and execution_receipt.receipt_kind = 'completed'
     and execution_receipt.attempt_state = 'completed'
     and execution_receipt.receipt_sha256 =
       v_confirmation.stripe_execution_completed_receipt_sha256
    join public.flight_consumer_live_stripe_confirmation_receipts
      as confirmation_receipt
      on confirmation_receipt.attempt_id = v_confirmation.id
     and confirmation_receipt.confirmation_revision =
       v_confirmation.confirmation_revision
     and confirmation_receipt.confirmation_state =
       v_confirmation.confirmation_state
     and confirmation_receipt.receipt_sha256 =
       v_confirmation.latest_state_receipt_sha256
   where refresh.id = v_aggregate.offer_refresh_attempt_id
     and refresh.execution_scope_sha256 =
       v_aggregate.offer_refresh_execution_scope_sha256
     and refresh.offer_binding_sha256 = v_aggregate.offer_binding_sha256
     and refresh.normalized_offer_sha256 =
       v_aggregate.normalized_offer_sha256
     and refresh.terminal_response_sha256 =
       v_aggregate.offer_terminal_response_sha256
     and refresh.attempt_state = 'succeeded'
     and refresh.attempt_revision = 2
     and refresh.price_amount_minor = v_aggregate.amount_cents
     and refresh.price_currency = v_aggregate.currency
     and refresh.offer_expires_at = v_aggregate.offer_expires_at
     and refresh.offer_expires_at > v_now + interval '15 seconds';

  if v_prerequisite_count is distinct from 1
    or v_aggregate.provider_request_count <> 0
    or v_aggregate.stripe_request_count <> 0
    or v_aggregate.order_request_count <> 0
    or v_aggregate.payment_request_count <> 0
    or v_aggregate.capture_request_count <> 0
    or v_aggregate.refund_request_count <> 0
    or v_aggregate.settlement_request_count <> 0
    or v_aggregate.ticket_request_count <> 0
    or v_aggregate.provider_dispatch_authorized
    or v_aggregate.stripe_dispatch_authorized
    or v_aggregate.booking_authorized
    or v_aggregate.order_authorized
    or v_aggregate.payment_authorized
    or v_aggregate.capture_authorized
    or v_aggregate.refund_authorized
    or v_aggregate.settlement_authorized
    or v_aggregate.ticketing_authorized
    or v_aggregate.servicing_authorized
    or v_aggregate.consumer_release_enabled
    or v_execution.plan_id <> v_aggregate.stripe_plan_id
    or v_execution.execution_workflow_sha256 <>
      v_aggregate.stripe_execution_workflow_sha256
    or v_execution.execution_prerequisite_sha256 <>
      v_aggregate.stripe_execution_prerequisite_sha256
    or v_execution.payment_binding_sha256 <>
      v_aggregate.payment_binding_sha256
    or v_execution.order_reference_sha256 <>
      v_aggregate.order_reference_sha256
    or v_execution.customer_reference_sha256 <>
      v_aggregate.customer_reference_sha256
    or v_execution.amount_cents <> v_aggregate.amount_cents
    or upper(v_execution.currency) <> v_aggregate.currency
    or v_execution.attempt_state <> 'completed'
    or v_execution.attempt_revision <> 2
    or v_execution.latest_state_receipt_sha256 <>
      v_confirmation.stripe_execution_completed_receipt_sha256
    or v_execution.payment_intent_reference_sha256 is null
    or v_execution.payment_intent_reference_ciphertext is null
    or v_execution.stripe_request_count <> 1
    or v_execution.stripe_mutation_count <> 1
    or v_execution.payment_intent_create_count <> 1
    or not v_execution.external_request_made
    or v_execution.processor_environment <> 'stripe_live'
    or not v_execution.livemode
    or v_execution.capture_method <> 'manual'
    or v_execution.payment_authorized
    or v_execution.order_authorized
    or v_execution.capture_authorized
    or v_execution.refund_authorized
    or v_execution.settlement_authorized
    or v_execution.ticketing_authorized
    or v_execution.servicing_authorized
    or v_execution.consumer_release_enabled
    or v_execution.blind_retry_authorized
    or v_confirmation.checkout_aggregate_id <> v_aggregate.id
    or v_confirmation.stripe_execution_attempt_id <> v_execution.id
    or v_confirmation.customer_id <> v_aggregate.customer_id
    or v_confirmation.order_id <> v_aggregate.order_id
    or v_confirmation.checkout_binding_sha256 <>
      v_aggregate.checkout_binding_sha256
    or v_confirmation.checkout_state_receipt_sha256 <>
      v_aggregate.latest_state_receipt_sha256
    or v_confirmation.stripe_execution_workflow_sha256 <>
      v_execution.execution_workflow_sha256
    or v_confirmation.stripe_execution_prerequisite_sha256 <>
      v_execution.execution_prerequisite_sha256
    or v_confirmation.stripe_execution_completed_receipt_sha256 <>
      v_execution.latest_state_receipt_sha256
    or v_confirmation.payment_binding_sha256 <>
      v_aggregate.payment_binding_sha256
    or v_confirmation.order_reference_sha256 <>
      v_aggregate.order_reference_sha256
    or v_confirmation.customer_reference_sha256 <>
      v_aggregate.customer_reference_sha256
    or v_confirmation.amount_cents <> v_aggregate.amount_cents
    or v_confirmation.currency <> v_aggregate.currency
    or v_confirmation.processor_environment <> 'stripe_live'
    or not v_confirmation.livemode
    or v_confirmation.capture_method <> 'manual'
    or v_confirmation.observed_payment_intent_status <>
      'requires_capture'
    or v_confirmation.observed_amount_cents <>
      v_aggregate.amount_cents
    or v_confirmation.observed_currency <> lower(v_aggregate.currency)
    or v_confirmation.observed_livemode is distinct from true
    or v_confirmation.payment_intent_reference_sha256 <>
      v_execution.payment_intent_reference_sha256
    or v_confirmation.observed_payment_intent_reference_sha256 <>
      v_execution.payment_intent_reference_sha256
    or v_confirmation.provider_response_sha256 is null
    or v_confirmation.confirmation_evidence_sha256 is null
    or (v_confirmation.webhook_event_sha256 is null
      and v_confirmation.retrieval_evidence_sha256 is null)
    or not (
      (v_confirmation.confirmation_state = 'authorized_requires_capture'
        and v_confirmation.confirmation_revision = 2
        and v_confirmation.reconciled_outcome is null)
      or
      (v_confirmation.confirmation_state = 'reconciled'
        and v_confirmation.confirmation_revision = 3
        and v_confirmation.reconciled_outcome =
          'authorized_requires_capture')
    )
    or v_authorization_evidence_at is null
    or v_authorization_evidence_at > v_now
    or v_confirmation.confirmation_not_after <=
      v_now + interval '15 seconds'
    or v_confirmation.confirmation_not_after >
      v_aggregate.offer_expires_at
    or v_confirmation.handoff_count <> 1
    or v_confirmation.stripe_confirmation_request_count <> 1
    or not v_confirmation.external_request_made
    or v_confirmation.confirmation_handoff_authorized
    or v_confirmation.provider_dispatch_authorized
    or v_confirmation.stripe_dispatch_authorized
    or v_confirmation.booking_authorized
    or v_confirmation.order_authorized
    or v_confirmation.payment_authorized
    or v_confirmation.capture_authorized
    or v_confirmation.refund_authorized
    or v_confirmation.settlement_authorized
    or v_confirmation.ticketing_authorized
    or v_confirmation.servicing_authorized
    or v_confirmation.consumer_release_enabled
    or v_confirmation.blind_retry_authorized then
    raise exception
      'Flight Consumer Live checkout finalization authorization changed';
  end if;

  v_previous_receipt := v_aggregate.latest_state_receipt_sha256;
  v_bridge_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout-authorization-bridge-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'aggregate_id', v_aggregate.id,
      'authorization_evidence_at', v_authorization_evidence_at,
      'authorization_not_after',
        v_confirmation.confirmation_not_after,
      'checkout_binding_sha256', v_aggregate.checkout_binding_sha256,
      'checkout_execution_scope_sha256',
        v_aggregate.execution_scope_sha256,
      'checkout_prepared_receipt_sha256', v_previous_receipt,
      'confirmation_execution_scope_sha256',
        v_confirmation.execution_scope_sha256,
      'confirmation_binding_sha256',
        v_confirmation.confirmation_binding_sha256,
      'confirmation_evidence_sha256',
        v_confirmation.confirmation_evidence_sha256,
      'confirmation_prerequisite_sha256',
        v_confirmation.confirmation_prerequisite_sha256,
      'confirmation_revision', v_confirmation.confirmation_revision,
      'confirmation_state', v_confirmation.confirmation_state,
      'confirmation_state_receipt_sha256',
        v_confirmation.latest_state_receipt_sha256,
      'confirmation_workflow_sha256',
        v_confirmation.confirmation_workflow_sha256,
      'customer_id', v_aggregate.customer_id,
      'customer_reference_sha256',
        v_aggregate.customer_reference_sha256,
      'finalization_evidence_sha256', p_finalization_evidence_sha256,
      'order_id', v_aggregate.order_id,
      'order_reference_sha256', v_aggregate.order_reference_sha256,
      'observed_amount_cents', v_confirmation.observed_amount_cents,
      'observed_currency', v_confirmation.observed_currency,
      'observed_livemode', v_confirmation.observed_livemode,
      'observed_payment_intent_reference_sha256',
        v_confirmation.observed_payment_intent_reference_sha256,
      'observed_payment_intent_status',
        v_confirmation.observed_payment_intent_status,
      'provider_response_sha256',
        v_confirmation.provider_response_sha256,
      'payment_binding_sha256', v_aggregate.payment_binding_sha256,
      'stripe_confirmation_attempt_id', v_confirmation.id,
      'stripe_execution_attempt_id', v_execution.id,
      'stripe_execution_completed_receipt_sha256',
        v_confirmation.stripe_execution_completed_receipt_sha256,
      'stripe_execution_prerequisite_sha256',
        v_execution.execution_prerequisite_sha256,
      'stripe_execution_workflow_sha256',
        v_execution.execution_workflow_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout-state-receipt:v2',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'aggregate_id', v_aggregate.id,
      'authorization_bridge_receipt_sha256', v_bridge_receipt,
      'checkout_binding_sha256', v_aggregate.checkout_binding_sha256,
      'checkout_revision', 1,
      'checkout_state', 'finalized',
      'confirmation_binding_sha256',
        v_confirmation.confirmation_binding_sha256,
      'confirmation_evidence_sha256',
        v_confirmation.confirmation_evidence_sha256,
      'confirmation_revision', v_confirmation.confirmation_revision,
      'confirmation_state', v_confirmation.confirmation_state,
      'confirmation_state_receipt_sha256',
        v_confirmation.latest_state_receipt_sha256,
      'finalization_evidence_sha256', p_finalization_evidence_sha256,
      'observed_amount_cents', v_confirmation.observed_amount_cents,
      'observed_currency', v_confirmation.observed_currency,
      'observed_livemode', v_confirmation.observed_livemode,
      'observed_payment_intent_reference_sha256',
        v_confirmation.observed_payment_intent_reference_sha256,
      'observed_payment_intent_status',
        v_confirmation.observed_payment_intent_status,
      'previous_receipt_sha256', v_previous_receipt,
      'provider_response_sha256',
        v_confirmation.provider_response_sha256,
      'stripe_confirmation_attempt_id', v_confirmation.id,
      'stripe_execution_completed_receipt_sha256',
        v_confirmation.stripe_execution_completed_receipt_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  -- The aggregate, confirmation, and Stripe execution FOR UPDATE locks above
  -- can wait. Refresh trusted database time after all of those blocking locks
  -- and immediately before the finalize CAS, then repeat both time-sensitive
  -- gates. Never persist a finalized bridge from a stale pre-lock clock.
  v_now := clock_timestamp();
  if v_aggregate.offer_expires_at <= v_now + interval '15 seconds'
    or v_confirmation.confirmation_not_after <=
      v_now + interval '15 seconds'
    or v_confirmation.confirmation_not_after >
      v_aggregate.offer_expires_at then
    raise exception
      'Flight Consumer Live checkout finalization window expired while waiting for locks';
  end if;

  update public.flight_consumer_live_checkout_evidence_aggregates as target
     set checkout_state = 'finalized', checkout_revision = 1,
         finalization_evidence_sha256 = p_finalization_evidence_sha256,
         latest_state_receipt_sha256 = v_receipt,
         finalized_at = v_now, updated_at = v_now
   where target.id = v_aggregate.id
     and target.checkout_state = 'prepared'
     and target.checkout_revision = p_expected_revision
     and target.latest_state_receipt_sha256 = v_previous_receipt
  returning target.* into v_aggregate;
  if not found then
    raise exception 'Flight Consumer Live checkout finalization CAS failed';
  end if;

  insert into public.flight_consumer_live_checkout_evidence_receipts (
    aggregate_id, checkout_revision, receipt_kind, checkout_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_aggregate.id, 1, 'finalized', 'finalized',
    v_previous_receipt, v_receipt
  );

  insert into public.flight_consumer_live_checkout_authorization_bridges (
    checkout_aggregate_id, stripe_confirmation_attempt_id,
    stripe_execution_attempt_id, customer_id, order_id,
    checkout_execution_scope_sha256, checkout_binding_sha256,
    checkout_prepared_receipt_sha256,
    checkout_finalized_receipt_sha256,
    authorization_bridge_receipt_sha256,
    stripe_execution_workflow_sha256,
    stripe_execution_prerequisite_sha256,
    stripe_execution_completed_receipt_sha256,
    confirmation_execution_scope_sha256,
    confirmation_binding_sha256, confirmation_workflow_sha256,
    confirmation_prerequisite_sha256, confirmation_state,
    confirmation_revision, confirmation_reconciled_outcome,
    confirmation_state_receipt_sha256, provider_response_sha256,
    confirmation_evidence_sha256, observed_payment_intent_status,
    observed_amount_cents, observed_currency, observed_livemode,
    payment_intent_reference_sha256, payment_binding_sha256,
    order_reference_sha256, customer_reference_sha256,
    amount_cents, currency, finalization_evidence_sha256,
    authorization_evidence_at, authorization_not_after, finalized_at
  ) values (
    v_aggregate.id, v_confirmation.id, v_execution.id,
    v_aggregate.customer_id, v_aggregate.order_id,
    v_aggregate.execution_scope_sha256,
    v_aggregate.checkout_binding_sha256, v_previous_receipt, v_receipt,
    v_bridge_receipt,
    v_execution.execution_workflow_sha256,
    v_execution.execution_prerequisite_sha256,
    v_execution.latest_state_receipt_sha256,
    v_confirmation.execution_scope_sha256,
    v_confirmation.confirmation_binding_sha256,
    v_confirmation.confirmation_workflow_sha256,
    v_confirmation.confirmation_prerequisite_sha256,
    v_confirmation.confirmation_state,
    v_confirmation.confirmation_revision,
    v_confirmation.reconciled_outcome,
    v_confirmation.latest_state_receipt_sha256,
    v_confirmation.provider_response_sha256,
    v_confirmation.confirmation_evidence_sha256,
    v_confirmation.observed_payment_intent_status,
    v_confirmation.observed_amount_cents,
    v_confirmation.observed_currency,
    v_confirmation.observed_livemode,
    v_confirmation.observed_payment_intent_reference_sha256,
    v_confirmation.payment_binding_sha256,
    v_confirmation.order_reference_sha256,
    v_confirmation.customer_reference_sha256,
    v_confirmation.amount_cents, v_confirmation.currency,
    p_finalization_evidence_sha256, v_authorization_evidence_at,
    v_confirmation.confirmation_not_after, v_now
  );

  return query select
    'finalized'::text, v_aggregate.id, v_aggregate.checkout_state,
    v_aggregate.checkout_revision, v_aggregate.amount_cents,
    v_aggregate.currency, v_aggregate.latest_state_receipt_sha256,
    v_aggregate.provider_dispatch_authorized,
    v_aggregate.stripe_dispatch_authorized,
    v_aggregate.booking_authorized, v_aggregate.order_authorized,
    v_aggregate.payment_authorized, v_aggregate.capture_authorized,
    v_aggregate.refund_authorized, v_aggregate.settlement_authorized,
    v_aggregate.ticketing_authorized, v_aggregate.servicing_authorized,
    v_aggregate.consumer_release_enabled;
end;
$finalize_flight_consumer_live_checkout_evidence_v1$;

-- Defense in depth for the unchanged 108 RPCs: both preparation (INSERT) and
-- the prepared -> dispatching claim must retain the exact, fresh 109
-- authorization and the exact 110-finalized checkout receipt.
create function public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $enforce_flight_consumer_live_duffel_order_authorization_bridge_v1$
declare
  v_now timestamptz := clock_timestamp();
  v_match_count bigint;
begin
  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE'
      and old.attempt_state = 'prepared'
      and new.attempt_state = 'dispatching') then
    select count(*) into v_match_count
      from public.flight_consumer_live_checkout_evidence_aggregates as checkout
      join public.flight_consumer_live_checkout_authorization_bridges
        as bridge
        on bridge.checkout_aggregate_id = checkout.id
      join public.flight_consumer_live_stripe_confirmation_attempts
        as confirmation
        on confirmation.id = bridge.stripe_confirmation_attempt_id
      join public.flight_consumer_live_stripe_confirmation_receipts
        as confirmation_receipt
        on confirmation_receipt.attempt_id = confirmation.id
       and confirmation_receipt.confirmation_revision =
         confirmation.confirmation_revision
       and confirmation_receipt.confirmation_state =
         confirmation.confirmation_state
       and confirmation_receipt.receipt_sha256 =
         confirmation.latest_state_receipt_sha256
      join public.flight_consumer_live_checkout_evidence_receipts
        as checkout_receipt
        on checkout_receipt.aggregate_id = checkout.id
       and checkout_receipt.checkout_revision = 1
       and checkout_receipt.receipt_kind = 'finalized'
       and checkout_receipt.checkout_state = 'finalized'
       and checkout_receipt.receipt_sha256 =
         checkout.latest_state_receipt_sha256
     where checkout.id = new.checkout_evidence_aggregate_id
       and checkout.execution_scope_sha256 =
         new.checkout_execution_scope_sha256
       and checkout.checkout_binding_sha256 =
         new.checkout_binding_sha256
       and checkout.latest_state_receipt_sha256 =
         new.checkout_state_receipt_sha256
       and checkout.checkout_state = 'finalized'
       and checkout.checkout_revision = 1
       and checkout.customer_reference_sha256 =
         new.customer_reference_sha256
       and checkout.order_reference_sha256 = new.order_reference_sha256
       and checkout.amount_cents = new.amount_cents
       and checkout.currency = new.currency
       and bridge.checkout_binding_sha256 =
         new.checkout_binding_sha256
       and bridge.checkout_finalized_receipt_sha256 =
         new.checkout_state_receipt_sha256
       and bridge.authorization_bridge_receipt_sha256 ~
         '^[0-9a-f]{64}$'
       and bridge.stripe_execution_attempt_id =
         checkout.stripe_execution_attempt_id
       and bridge.customer_id = checkout.customer_id
       and bridge.order_id = checkout.order_id
       and bridge.payment_binding_sha256 =
         checkout.payment_binding_sha256
       and bridge.order_reference_sha256 = new.order_reference_sha256
       and bridge.customer_reference_sha256 =
         new.customer_reference_sha256
       and bridge.amount_cents = new.amount_cents
       and bridge.currency = new.currency
       and bridge.finalization_evidence_sha256 =
         checkout.finalization_evidence_sha256
       and bridge.authorization_evidence_at <= v_now
       and bridge.authorization_not_after > v_now + interval '15 seconds'
       and new.dispatch_not_after <= bridge.authorization_not_after
       and confirmation.checkout_aggregate_id = checkout.id
       and confirmation.stripe_execution_attempt_id =
         bridge.stripe_execution_attempt_id
       and confirmation.customer_id = checkout.customer_id
       and confirmation.order_id = checkout.order_id
       and confirmation.checkout_binding_sha256 =
         checkout.checkout_binding_sha256
       and confirmation.checkout_state_receipt_sha256 =
         bridge.checkout_prepared_receipt_sha256
       and confirmation.stripe_execution_completed_receipt_sha256 =
         bridge.stripe_execution_completed_receipt_sha256
       and confirmation.confirmation_binding_sha256 =
         bridge.confirmation_binding_sha256
       and confirmation.confirmation_workflow_sha256 =
         bridge.confirmation_workflow_sha256
       and confirmation.confirmation_prerequisite_sha256 =
         bridge.confirmation_prerequisite_sha256
       and confirmation.confirmation_state = bridge.confirmation_state
       and confirmation.confirmation_revision = bridge.confirmation_revision
       and confirmation.reconciled_outcome is not distinct from
         bridge.confirmation_reconciled_outcome
       and confirmation.latest_state_receipt_sha256 =
         bridge.confirmation_state_receipt_sha256
       and confirmation.provider_response_sha256 =
         bridge.provider_response_sha256
       and confirmation.confirmation_evidence_sha256 =
         bridge.confirmation_evidence_sha256
       and confirmation.observed_payment_intent_status =
         'requires_capture'
       and confirmation.observed_amount_cents = new.amount_cents
       and confirmation.observed_currency = lower(new.currency)
       and confirmation.observed_livemode
       and confirmation.payment_intent_reference_sha256 =
         bridge.payment_intent_reference_sha256
       and confirmation.observed_payment_intent_reference_sha256 =
         bridge.payment_intent_reference_sha256
       and confirmation.confirmation_not_after =
         bridge.authorization_not_after
       and confirmation.confirmation_not_after >
         v_now + interval '15 seconds'
       and confirmation.confirmation_handoff_authorized = false
       and confirmation.provider_dispatch_authorized = false
       and confirmation.stripe_dispatch_authorized = false
       and confirmation.booking_authorized = false
       and confirmation.order_authorized = false
       and confirmation.payment_authorized = false
       and confirmation.capture_authorized = false
       and confirmation.refund_authorized = false
       and confirmation.settlement_authorized = false
       and confirmation.ticketing_authorized = false
       and confirmation.servicing_authorized = false
       and confirmation.consumer_release_enabled = false
       and confirmation.blind_retry_authorized = false;
    if v_match_count is distinct from 1 then
      raise exception
        'Flight Consumer Live Duffel order authorization bridge is invalid or expired';
    end if;
  end if;
  return new;
end;
$enforce_flight_consumer_live_duffel_order_authorization_bridge_v1$;

create trigger flight_consumer_live_duffel_order_authorization_bridge_110
before insert or update
on public.flight_consumer_live_duffel_order_executions
for each row execute function
  public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1();

alter function public.protect_flight_consumer_live_checkout_authorization_bridge_v1()
  owner to postgres;
alter function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) owner to postgres;
alter function public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1()
  owner to postgres;

revoke all on function
  public.protect_flight_consumer_live_checkout_authorization_bridge_v1()
  from public, anon, authenticated;
revoke all on function
  public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1()
  from public, anon, authenticated, service_role;

comment on table public.flight_consumer_live_checkout_authorization_bridges is
  'Immutable evidence bridge from one exact live Stripe requires-capture observation to one finalized checkout. Every authority remains false; this is not dispatch, payment, booking, ticketing, servicing, or release authority.';
comment on function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) is
  'Finalizes one prepared checkout only from exact fresh 106-completed and structured 109 authorized-requires-capture evidence, recording a 110 bridge while granting no provider or consumer authority.';
comment on function public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1() is
  'Rejects 108 preparation and prepared-to-dispatching transitions unless the exact fresh 109 authorization and exact 110-finalized checkout receipt remain bound. It grants no authority itself.';

commit;
