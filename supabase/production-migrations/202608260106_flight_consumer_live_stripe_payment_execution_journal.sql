begin;

-- Production-local persistence prerequisite only. This migration cannot call
-- Stripe, accept a payment method or client secret, create/capture/refund a
-- PaymentIntent, create an order, issue a ticket, or release a consumer flow.
-- It journals immutable evidence around a separately authorized future live
-- execution. The only stored Stripe object reference is encrypted ciphertext
-- paired with its SHA-256 digest; no RPC returns that ciphertext.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_stripe_payment_intent_plans'
  ) is null
    or to_regprocedure(
      'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Stripe execution journal requires the reviewed 103 plan journal and SHA-256 prerequisite';
  end if;
end;
$migration$;

create table public.flight_consumer_live_stripe_payment_executions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique
    references public.flight_consumer_live_stripe_payment_intent_plans(id)
    on delete restrict,
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_attempt_reference_sha256 text not null
    check (payment_attempt_reference_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_sha256 text not null
    check (metadata_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null
    check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  request_envelope_sha256 text not null
    check (request_envelope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_request_sha256 text not null
    check (idempotency_request_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text not null unique
    check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  execution_workflow_sha256 text not null unique
    check (execution_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  execution_prerequisite_sha256 text not null
    check (execution_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'usd' check (currency = 'usd'),
  processor_environment text not null default 'stripe_live'
    check (processor_environment = 'stripe_live'),
  livemode boolean not null default true check (livemode),
  capture_method text not null default 'manual'
    check (capture_method = 'manual'),
  confirmation_method text not null default 'automatic'
    check (confirmation_method = 'automatic'),
  payment_method_type text not null default 'card'
    check (payment_method_type = 'card'),
  attempt_state text not null default 'prepared'
    check (attempt_state in (
      'prepared', 'claimed', 'completed', 'ambiguous', 'reconciled'
    )),
  attempt_revision integer not null default 0
    check (attempt_revision between 0 and 3),
  dispatch_not_after timestamptz not null,
  lease_token_sha256 text
    check (
      lease_token_sha256 is null
      or lease_token_sha256 ~ '^[0-9a-f]{64}$'
    ),
  lease_seconds integer
    check (lease_seconds is null or lease_seconds between 15 and 120),
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  payment_intent_reference_ciphertext text
    check (
      payment_intent_reference_ciphertext is null
      or (
        char_length(payment_intent_reference_ciphertext) <= 4096
        and payment_intent_reference_ciphertext
          ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
      )
    ),
  payment_intent_reference_sha256 text
    check (
      payment_intent_reference_sha256 is null
      or payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
    ),
  terminal_response_sha256 text
    check (
      terminal_response_sha256 is null
      or terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    ),
  completion_evidence_sha256 text
    check (
      completion_evidence_sha256 is null
      or completion_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  ambiguity_code text
    check (
      ambiguity_code is null
      or ambiguity_code ~ '^[a-z0-9_]{1,96}$'
    ),
  ambiguity_evidence_sha256 text
    check (
      ambiguity_evidence_sha256 is null
      or ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  recovery_origin_state text
    check (
      recovery_origin_state is null
      or recovery_origin_state in ('claimed', 'ambiguous')
    ),
  recovery_state text not null default 'none'
    check (recovery_state in (
      'none', 'provider_present', 'provider_absence_attested', 'unresolved'
    )),
  reconciliation_evidence_sha256 text
    check (
      reconciliation_evidence_sha256 is null
      or reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  recovery_evidence_sha256 text
    check (
      recovery_evidence_sha256 is null
      or recovery_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  latest_state_receipt_sha256 text not null
    check (latest_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_request_count integer not null default 0
    check (stripe_request_count in (0, 1)),
  stripe_mutation_count integer not null default 0
    check (stripe_mutation_count in (0, 1)),
  payment_intent_create_count integer not null default 0
    check (payment_intent_create_count in (0, 1)),
  order_request_count integer not null default 0
    check (order_request_count = 0),
  capture_request_count integer not null default 0
    check (capture_request_count = 0),
  refund_request_count integer not null default 0
    check (refund_request_count = 0),
  ticket_request_count integer not null default 0
    check (ticket_request_count = 0),
  external_request_made boolean not null default false,
  raw_payment_method_stored boolean not null default false
    check (not raw_payment_method_stored),
  client_secret_stored boolean not null default false
    check (not client_secret_stored),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
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
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  reconciled_at timestamptz,
  unique (execution_scope_sha256, payment_attempt_reference_sha256),
  unique (execution_scope_sha256, idempotency_key_sha256),
  check (
    order_reference_sha256 <> customer_reference_sha256
    and order_reference_sha256 <> payment_attempt_reference_sha256
    and customer_reference_sha256 <> payment_attempt_reference_sha256
  ),
  check (
    (payment_intent_reference_ciphertext is null
      and payment_intent_reference_sha256 is null)
    or
    (payment_intent_reference_ciphertext is not null
      and payment_intent_reference_sha256 is not null)
  ),
  check (
    stripe_request_count = stripe_mutation_count
    and stripe_request_count = payment_intent_create_count
    and external_request_made = (stripe_request_count = 1)
  ),
  check (
    (attempt_state = 'prepared'
      and attempt_revision = 0
      and lease_token_sha256 is null
      and lease_seconds is null
      and lease_expires_at is null
      and claimed_at is null
      and stripe_request_count = 0
      and payment_intent_reference_sha256 is null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_code is null
      and ambiguity_evidence_sha256 is null
      and recovery_origin_state is null
      and recovery_state = 'none'
      and reconciliation_evidence_sha256 is null
      and recovery_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'claimed'
      and attempt_revision = 1
      and lease_token_sha256 is not null
      and lease_seconds is not null
      and lease_expires_at is not null
      and claimed_at is not null
      and stripe_request_count = 0
      and payment_intent_reference_sha256 is null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_code is null
      and ambiguity_evidence_sha256 is null
      and recovery_origin_state is null
      and recovery_state = 'none'
      and reconciliation_evidence_sha256 is null
      and recovery_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'completed'
      and attempt_revision = 2
      and lease_token_sha256 is not null
      and lease_seconds is not null
      and lease_expires_at is not null
      and claimed_at is not null
      and stripe_request_count = 1
      and payment_intent_reference_sha256 is not null
      and terminal_response_sha256 is not null
      and completion_evidence_sha256 is not null
      and ambiguity_code is null
      and ambiguity_evidence_sha256 is null
      and recovery_origin_state is null
      and recovery_state = 'none'
      and reconciliation_evidence_sha256 is null
      and recovery_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'ambiguous'
      and attempt_revision = 2
      and lease_token_sha256 is not null
      and lease_seconds is not null
      and lease_expires_at is not null
      and claimed_at is not null
      and stripe_request_count = 1
      and payment_intent_reference_sha256 is null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_code is not null
      and ambiguity_evidence_sha256 is not null
      and recovery_origin_state is null
      and recovery_state = 'none'
      and reconciliation_evidence_sha256 is null
      and recovery_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'reconciled'
      and attempt_revision in (2, 3)
      and lease_token_sha256 is not null
      and lease_seconds is not null
      and lease_expires_at is not null
      and claimed_at is not null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and recovery_origin_state in ('claimed', 'ambiguous')
      and recovery_state in (
        'provider_present', 'provider_absence_attested', 'unresolved'
      )
      and reconciliation_evidence_sha256 is not null
      and recovery_evidence_sha256 is not null
      and completed_at is not null
      and reconciled_at is not null
      and (
        (recovery_origin_state = 'claimed'
          and attempt_revision = 2
          and ambiguity_code is null
          and ambiguity_evidence_sha256 is null)
        or
        (recovery_origin_state = 'ambiguous'
          and attempt_revision = 3
          and ambiguity_code is not null
          and ambiguity_evidence_sha256 is not null)
      )
      and (
        (recovery_state = 'provider_present'
          and payment_intent_reference_sha256 is not null
          and stripe_request_count = 1)
        or
        (recovery_state <> 'provider_present'
          and payment_intent_reference_sha256 is null
          and stripe_request_count = case
            when recovery_origin_state = 'ambiguous' then 1
            when recovery_state = 'unresolved' then 1
            else 0
          end)
      ))
  ),
  check (dispatch_not_after > created_at),
  check (updated_at >= created_at),
  check (claimed_at is null or claimed_at >= created_at),
  check (lease_expires_at is null or lease_expires_at > claimed_at),
  check (completed_at is null or completed_at >= claimed_at),
  check (reconciled_at is null or reconciled_at >= completed_at)
);

create unique index flight_consumer_live_stripe_executions_pi_ref_uidx
  on public.flight_consumer_live_stripe_payment_executions (
    payment_intent_reference_sha256
  ) where payment_intent_reference_sha256 is not null;

create index flight_consumer_live_stripe_executions_state_idx
  on public.flight_consumer_live_stripe_payment_executions (
    attempt_state, lease_expires_at, updated_at desc
  );

create table public.flight_consumer_live_stripe_payment_execution_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_live_stripe_payment_executions(id)
    on delete restrict,
  attempt_revision integer not null check (attempt_revision between 0 and 3),
  receipt_kind text not null check (receipt_kind in (
    'prepared', 'claimed', 'completed', 'ambiguous', 'recovered'
  )),
  attempt_state text not null check (attempt_state in (
    'prepared', 'claimed', 'completed', 'ambiguous', 'reconciled'
  )),
  previous_receipt_sha256 text
    check (
      previous_receipt_sha256 is null
      or previous_receipt_sha256 ~ '^[0-9a-f]{64}$'
    ),
  receipt_sha256 text not null unique
    check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  livemode boolean not null default true check (livemode),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
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
  recorded_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, attempt_revision),
  check (
    (attempt_revision = 0
      and receipt_kind = 'prepared'
      and attempt_state = 'prepared'
      and previous_receipt_sha256 is null)
    or
    (attempt_revision > 0 and previous_receipt_sha256 is not null)
  )
);

create index flight_consumer_live_stripe_execution_receipts_attempt_idx
  on public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision desc
  );

alter table public.flight_consumer_live_stripe_payment_executions
  enable row level security;
alter table public.flight_consumer_live_stripe_payment_executions
  force row level security;
alter table public.flight_consumer_live_stripe_payment_execution_receipts
  enable row level security;
alter table public.flight_consumer_live_stripe_payment_execution_receipts
  force row level security;

revoke all on table public.flight_consumer_live_stripe_payment_executions
  from public, anon, authenticated, service_role;
revoke all on table
  public.flight_consumer_live_stripe_payment_execution_receipts
  from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_stripe_payment_execution_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_payment_execution_v1$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Flight Consumer Live Stripe execution evidence is append-preserving';
  end if;

  if new.id is distinct from old.id
    or new.plan_id is distinct from old.plan_id
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.payment_binding_sha256 is distinct from old.payment_binding_sha256
    or new.order_reference_sha256 is distinct from old.order_reference_sha256
    or new.customer_reference_sha256
      is distinct from old.customer_reference_sha256
    or new.payment_attempt_reference_sha256
      is distinct from old.payment_attempt_reference_sha256
    or new.metadata_sha256 is distinct from old.metadata_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.request_envelope_sha256 is distinct from old.request_envelope_sha256
    or new.idempotency_request_sha256
      is distinct from old.idempotency_request_sha256
    or new.idempotency_key_sha256 is distinct from old.idempotency_key_sha256
    or new.plan_sha256 is distinct from old.plan_sha256
    or new.execution_workflow_sha256
      is distinct from old.execution_workflow_sha256
    or new.execution_prerequisite_sha256
      is distinct from old.execution_prerequisite_sha256
    or new.amount_cents is distinct from old.amount_cents
    or new.currency is distinct from old.currency
    or new.processor_environment is distinct from old.processor_environment
    or new.livemode is distinct from old.livemode
    or new.capture_method is distinct from old.capture_method
    or new.confirmation_method is distinct from old.confirmation_method
    or new.payment_method_type is distinct from old.payment_method_type
    or new.dispatch_not_after is distinct from old.dispatch_not_after
    or new.order_request_count is distinct from old.order_request_count
    or new.capture_request_count is distinct from old.capture_request_count
    or new.refund_request_count is distinct from old.refund_request_count
    or new.ticket_request_count is distinct from old.ticket_request_count
    or new.raw_payment_method_stored
      is distinct from old.raw_payment_method_stored
    or new.client_secret_stored is distinct from old.client_secret_stored
    or new.stripe_dispatch_authorized
      is distinct from old.stripe_dispatch_authorized
    or new.payment_authorized is distinct from old.payment_authorized
    or new.order_authorized is distinct from old.order_authorized
    or new.capture_authorized is distinct from old.capture_authorized
    or new.refund_authorized is distinct from old.refund_authorized
    or new.settlement_authorized is distinct from old.settlement_authorized
    or new.ticketing_authorized is distinct from old.ticketing_authorized
    or new.servicing_authorized is distinct from old.servicing_authorized
    or new.consumer_release_enabled
      is distinct from old.consumer_release_enabled
    or new.blind_retry_authorized is distinct from old.blind_retry_authorized
    or new.created_at is distinct from old.created_at then
    raise exception
      'Flight Consumer Live Stripe execution identity is immutable';
  end if;

  if old.lease_token_sha256 is not null and row(
    new.lease_token_sha256,
    new.lease_seconds,
    new.lease_expires_at,
    new.claimed_at
  ) is distinct from row(
    old.lease_token_sha256,
    old.lease_seconds,
    old.lease_expires_at,
    old.claimed_at
  ) then
    raise exception 'Flight Consumer Live Stripe claim binding is immutable';
  end if;
  if old.payment_intent_reference_sha256 is not null and row(
    new.payment_intent_reference_ciphertext,
    new.payment_intent_reference_sha256
  ) is distinct from row(
    old.payment_intent_reference_ciphertext,
    old.payment_intent_reference_sha256
  ) then
    raise exception
      'Flight Consumer Live Stripe PaymentIntent binding is immutable';
  end if;
  if old.ambiguity_evidence_sha256 is not null and row(
    new.ambiguity_code,
    new.ambiguity_evidence_sha256
  ) is distinct from row(
    old.ambiguity_code,
    old.ambiguity_evidence_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe ambiguity evidence is immutable';
  end if;
  if old.recovery_evidence_sha256 is not null and row(
    new.recovery_origin_state,
    new.recovery_state,
    new.reconciliation_evidence_sha256,
    new.recovery_evidence_sha256
  ) is distinct from row(
    old.recovery_origin_state,
    old.recovery_state,
    old.reconciliation_evidence_sha256,
    old.recovery_evidence_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe recovery evidence is immutable';
  end if;
  if new.attempt_revision <> old.attempt_revision + 1 then
    raise exception
      'Flight Consumer Live Stripe execution revision must advance by exact CAS';
  end if;
  if new.latest_state_receipt_sha256 = old.latest_state_receipt_sha256 then
    raise exception
      'Flight Consumer Live Stripe execution receipt must advance with state';
  end if;

  if old.attempt_state = 'prepared' and new.attempt_state = 'claimed' then
    return new;
  end if;
  if old.attempt_state = 'claimed'
    and new.attempt_state in ('completed', 'ambiguous', 'reconciled') then
    return new;
  end if;
  if old.attempt_state = 'ambiguous'
    and new.attempt_state = 'reconciled' then
    return new;
  end if;

  raise exception
    'Flight Consumer Live Stripe execution transition is not authorized';
end;
$protect_flight_consumer_live_stripe_payment_execution_v1$;

create trigger flight_consumer_live_stripe_execution_transition_guard
before update or delete
on public.flight_consumer_live_stripe_payment_executions
for each row execute function
  public.protect_flight_consumer_live_stripe_payment_execution_v1();

create function public.protect_flight_consumer_live_stripe_execution_receipt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_execution_receipt_v1$
begin
  raise exception
    'Flight Consumer Live Stripe execution receipts are append-only';
end;
$protect_flight_consumer_live_stripe_execution_receipt_v1$;

create trigger flight_consumer_live_stripe_execution_receipt_append_guard
before update or delete
on public.flight_consumer_live_stripe_payment_execution_receipts
for each row execute function
  public.protect_flight_consumer_live_stripe_execution_receipt_v1();

create function public.prepare_flight_consumer_live_stripe_payment_execution_v1(
  p_plan_id uuid,
  p_plan_sha256 text,
  p_execution_workflow_sha256 text,
  p_execution_prerequisite_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  state_receipt_sha256 text,
  livemode boolean,
  stripe_dispatch_authorized boolean,
  payment_authorized boolean,
  order_authorized boolean,
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
as $prepare_flight_consumer_live_stripe_payment_execution_v1$
declare
  v_plan public.flight_consumer_live_stripe_payment_intent_plans;
  v_attempt public.flight_consumer_live_stripe_payment_executions;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe execution preparation is service-role only';
  end if;
  if p_plan_id is null
    or p_plan_sha256 is null
    or p_plan_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_workflow_sha256 is null
    or p_execution_workflow_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_prerequisite_sha256 is null
    or p_execution_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_not_after is null
    or p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '2 minutes' then
    raise exception
      'Flight Consumer Live Stripe execution preparation envelope is invalid';
  end if;

  select plan.* into v_plan
    from public.flight_consumer_live_stripe_payment_intent_plans as plan
   where plan.id = p_plan_id
     and plan.plan_sha256 = p_plan_sha256
   for update;
  if not found
    or v_plan.plan_mode <> 'zero_dispatch'
    or v_plan.processor_id <> 'stripe_live'
    or v_plan.currency <> 'usd'
    or v_plan.capture_method <> 'manual'
    or v_plan.confirmation_method <> 'automatic'
    or v_plan.payment_method_type <> 'card'
    or v_plan.provider_request_count <> 0
    or v_plan.stripe_request_count <> 0
    or v_plan.stripe_mutation_count <> 0
    or v_plan.payment_intent_count <> 0
    or v_plan.charge_count <> 0
    or v_plan.refund_count <> 0
    or v_plan.external_request_made
    or v_plan.raw_payment_method_accepted
    or v_plan.client_secret_exposed
    or v_plan.payment_authorized
    or v_plan.capture_authorized
    or v_plan.refund_authorized
    or v_plan.order_authorized
    or v_plan.ticketing_authorized
    or v_plan.consumer_release_enabled then
    raise exception
      'Flight Consumer Live Stripe execution plan binding is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.plan_id = p_plan_id
   for update;
  if found then
    if v_attempt.plan_sha256 is distinct from p_plan_sha256
      or v_attempt.execution_workflow_sha256
        is distinct from p_execution_workflow_sha256
      or v_attempt.execution_prerequisite_sha256
        is distinct from p_execution_prerequisite_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception
        'Flight Consumer Live Stripe execution preparation collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.latest_state_receipt_sha256,
      v_attempt.livemode, v_attempt.stripe_dispatch_authorized,
      v_attempt.payment_authorized, v_attempt.order_authorized,
      v_attempt.capture_authorized, v_attempt.refund_authorized,
      v_attempt.settlement_authorized, v_attempt.ticketing_authorized,
      v_attempt.servicing_authorized, v_attempt.consumer_release_enabled;
    return;
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_revision', 0,
      'attempt_state', 'prepared',
      'execution_prerequisite_sha256', p_execution_prerequisite_sha256,
      'execution_workflow_sha256', p_execution_workflow_sha256,
      'livemode', true,
      'plan_id', p_plan_id,
      'plan_sha256', p_plan_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_stripe_payment_executions (
    plan_id, execution_scope_sha256, payment_binding_sha256,
    order_reference_sha256, customer_reference_sha256,
    payment_attempt_reference_sha256, metadata_sha256,
    request_body_sha256, request_envelope_sha256,
    idempotency_request_sha256, idempotency_key_sha256, plan_sha256,
    execution_workflow_sha256, execution_prerequisite_sha256,
    amount_cents, dispatch_not_after, latest_state_receipt_sha256
  ) values (
    v_plan.id, v_plan.execution_scope_sha256,
    v_plan.payment_binding_sha256, v_plan.order_reference_sha256,
    v_plan.customer_reference_sha256,
    v_plan.payment_attempt_reference_sha256, v_plan.metadata_sha256,
    v_plan.request_body_sha256, v_plan.request_envelope_sha256,
    v_plan.idempotency_request_sha256, v_plan.idempotency_key_sha256,
    v_plan.plan_sha256, p_execution_workflow_sha256,
    p_execution_prerequisite_sha256, v_plan.amount_cents,
    p_dispatch_not_after, v_receipt
  ) returning * into v_attempt;

  insert into public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 0, 'prepared', 'prepared', null, v_receipt
  );

  return query select
    'created'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.latest_state_receipt_sha256,
    v_attempt.livemode, v_attempt.stripe_dispatch_authorized,
    v_attempt.payment_authorized, v_attempt.order_authorized,
    v_attempt.capture_authorized, v_attempt.refund_authorized,
    v_attempt.settlement_authorized, v_attempt.ticketing_authorized,
    v_attempt.servicing_authorized, v_attempt.consumer_release_enabled;
exception
  when unique_violation then
    select execution.* into v_attempt
      from public.flight_consumer_live_stripe_payment_executions as execution
     where execution.plan_id = p_plan_id
     for update;
    if not found
      or v_attempt.plan_sha256 is distinct from p_plan_sha256
      or v_attempt.execution_workflow_sha256
        is distinct from p_execution_workflow_sha256
      or v_attempt.execution_prerequisite_sha256
        is distinct from p_execution_prerequisite_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception
        'Flight Consumer Live Stripe execution preparation concurrency collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.latest_state_receipt_sha256,
      v_attempt.livemode, v_attempt.stripe_dispatch_authorized,
      v_attempt.payment_authorized, v_attempt.order_authorized,
      v_attempt.capture_authorized, v_attempt.refund_authorized,
      v_attempt.settlement_authorized, v_attempt.ticketing_authorized,
      v_attempt.servicing_authorized, v_attempt.consumer_release_enabled;
end;
$prepare_flight_consumer_live_stripe_payment_execution_v1$;

create function public.claim_flight_consumer_live_stripe_payment_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_lease_seconds integer
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  lease_expires_at timestamptz,
  state_receipt_sha256 text,
  livemode boolean,
  stripe_dispatch_authorized boolean,
  payment_authorized boolean,
  order_authorized boolean,
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
as $claim_flight_consumer_live_stripe_payment_execution_v1$
declare
  v_attempt public.flight_consumer_live_stripe_payment_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
  v_lease_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe execution claim is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null or p_expected_revision <> 0
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120 then
    raise exception 'Flight Consumer Live Stripe execution claim is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256 then
    raise exception 'Flight Consumer Live Stripe execution claim binding is invalid';
  end if;
  if v_attempt.attempt_state = 'claimed'
    and v_attempt.attempt_revision = 1
    and v_attempt.lease_token_sha256 = p_lease_token_sha256
    and v_attempt.lease_seconds = p_lease_seconds then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.lease_expires_at,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
      v_attempt.order_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled;
    return;
  end if;
  v_lease_expires := v_now + make_interval(secs => p_lease_seconds);
  if v_attempt.attempt_state <> 'prepared'
    or v_attempt.attempt_revision <> p_expected_revision
    or v_lease_expires > v_attempt.dispatch_not_after then
    raise exception 'Flight Consumer Live Stripe execution claim CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 1,
      'attempt_state', 'claimed',
      'lease_expires_at', to_char(
        v_lease_expires at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'lease_token_sha256', p_lease_token_sha256,
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_payment_executions as execution
     set attempt_state = 'claimed',
         attempt_revision = 1,
         lease_token_sha256 = p_lease_token_sha256,
         lease_seconds = p_lease_seconds,
         lease_expires_at = v_lease_expires,
         claimed_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe execution claim CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 1, 'claimed', 'claimed', v_previous_receipt, v_receipt
  );

  return query select
    'claimed'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.lease_expires_at,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
    v_attempt.order_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled;
end;
$claim_flight_consumer_live_stripe_payment_execution_v1$;

create function public.complete_flight_consumer_live_stripe_payment_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_payment_intent_reference_ciphertext text,
  p_payment_intent_reference_sha256 text,
  p_terminal_response_sha256 text,
  p_completion_evidence_sha256 text,
  p_livemode boolean
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  state_receipt_sha256 text,
  livemode boolean,
  stripe_dispatch_authorized boolean,
  payment_authorized boolean,
  order_authorized boolean,
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
as $complete_flight_consumer_live_stripe_payment_execution_v1$
declare
  v_attempt public.flight_consumer_live_stripe_payment_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe execution completion is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null or p_expected_revision <> 1
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_intent_reference_ciphertext is null
    or char_length(p_payment_intent_reference_ciphertext) > 4096
    or p_payment_intent_reference_ciphertext
      !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
    or p_payment_intent_reference_sha256 is null
    or p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_response_sha256 is null
    or p_terminal_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_completion_evidence_sha256 is null
    or p_completion_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_livemode is distinct from true then
    raise exception 'Flight Consumer Live Stripe execution completion is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256
    or v_attempt.lease_token_sha256 <> p_lease_token_sha256 then
    raise exception
      'Flight Consumer Live Stripe execution completion binding is invalid';
  end if;
  if v_attempt.attempt_state = 'completed'
    and v_attempt.attempt_revision = 2
    and v_attempt.payment_intent_reference_ciphertext =
      p_payment_intent_reference_ciphertext
    and v_attempt.payment_intent_reference_sha256 =
      p_payment_intent_reference_sha256
    and v_attempt.terminal_response_sha256 = p_terminal_response_sha256
    and v_attempt.completion_evidence_sha256 = p_completion_evidence_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.payment_intent_reference_sha256,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
      v_attempt.order_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled;
    return;
  end if;
  if v_attempt.attempt_state <> 'claimed'
    or v_attempt.attempt_revision <> p_expected_revision then
    raise exception 'Flight Consumer Live Stripe execution completion CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 2,
      'attempt_state', 'completed',
      'completion_evidence_sha256', p_completion_evidence_sha256,
      'livemode', true,
      'payment_intent_reference_sha256', p_payment_intent_reference_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'terminal_response_sha256', p_terminal_response_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_payment_executions as execution
     set attempt_state = 'completed',
         attempt_revision = 2,
         payment_intent_reference_ciphertext =
           p_payment_intent_reference_ciphertext,
         payment_intent_reference_sha256 = p_payment_intent_reference_sha256,
         terminal_response_sha256 = p_terminal_response_sha256,
         completion_evidence_sha256 = p_completion_evidence_sha256,
         stripe_request_count = 1,
         stripe_mutation_count = 1,
         payment_intent_create_count = 1,
         external_request_made = true,
         completed_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe execution completion CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, 'completed', 'completed',
    v_previous_receipt, v_receipt
  );

  return query select
    'completed'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.payment_intent_reference_sha256,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
    v_attempt.order_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled;
end;
$complete_flight_consumer_live_stripe_payment_execution_v1$;

create function public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_ambiguity_code text,
  p_ambiguity_evidence_sha256 text,
  p_livemode boolean
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  ambiguity_code text,
  state_receipt_sha256 text,
  livemode boolean,
  stripe_dispatch_authorized boolean,
  payment_authorized boolean,
  order_authorized boolean,
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
as $mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1$
declare
  v_attempt public.flight_consumer_live_stripe_payment_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe execution ambiguity is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null or p_expected_revision <> 1
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_ambiguity_code is null
    or p_ambiguity_code !~ '^[a-z0-9_]{1,96}$'
    or p_ambiguity_evidence_sha256 is null
    or p_ambiguity_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_livemode is distinct from true then
    raise exception 'Flight Consumer Live Stripe execution ambiguity is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256
    or v_attempt.lease_token_sha256 <> p_lease_token_sha256 then
    raise exception
      'Flight Consumer Live Stripe execution ambiguity binding is invalid';
  end if;
  if v_attempt.attempt_state = 'ambiguous'
    and v_attempt.attempt_revision = 2
    and v_attempt.ambiguity_code = p_ambiguity_code
    and v_attempt.ambiguity_evidence_sha256 = p_ambiguity_evidence_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.ambiguity_code,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
      v_attempt.order_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled;
    return;
  end if;
  if v_attempt.attempt_state <> 'claimed'
    or v_attempt.attempt_revision <> p_expected_revision then
    raise exception 'Flight Consumer Live Stripe execution ambiguity CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'ambiguity_code', p_ambiguity_code,
      'ambiguity_evidence_sha256', p_ambiguity_evidence_sha256,
      'attempt_id', v_attempt.id,
      'attempt_revision', 2,
      'attempt_state', 'ambiguous',
      'livemode', true,
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_payment_executions as execution
     set attempt_state = 'ambiguous',
         attempt_revision = 2,
         ambiguity_code = p_ambiguity_code,
         ambiguity_evidence_sha256 = p_ambiguity_evidence_sha256,
         stripe_request_count = 1,
         stripe_mutation_count = 1,
         payment_intent_create_count = 1,
         external_request_made = true,
         completed_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe execution ambiguity CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, 'ambiguous', 'ambiguous',
    v_previous_receipt, v_receipt
  );

  return query select
    'ambiguous'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.ambiguity_code,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
    v_attempt.order_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled;
end;
$mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1$;

create function public.recover_flight_consumer_live_stripe_payment_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_reconciliation_state text,
  p_reconciliation_evidence_sha256 text,
  p_recovery_evidence_sha256 text,
  p_payment_intent_reference_ciphertext text,
  p_payment_intent_reference_sha256 text,
  p_livemode boolean
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  recovery_state text,
  payment_intent_reference_sha256 text,
  blind_retry_authorized boolean,
  state_receipt_sha256 text,
  livemode boolean,
  stripe_dispatch_authorized boolean,
  payment_authorized boolean,
  order_authorized boolean,
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
as $recover_flight_consumer_live_stripe_payment_execution_v1$
declare
  v_attempt public.flight_consumer_live_stripe_payment_executions;
  v_origin text;
  v_new_revision integer;
  v_request_count integer;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe execution recovery is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null or p_expected_revision not in (1, 2)
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_state is null
    or p_reconciliation_state not in (
      'provider_present', 'provider_absence_attested', 'unresolved'
    )
    or p_reconciliation_evidence_sha256 is null
    or p_reconciliation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_recovery_evidence_sha256 is null
    or p_recovery_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_livemode is distinct from true
    or (
      p_reconciliation_state = 'provider_present'
      and (
        p_payment_intent_reference_ciphertext is null
        or char_length(p_payment_intent_reference_ciphertext) > 4096
        or p_payment_intent_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_payment_intent_reference_sha256 is null
        or p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
      )
    )
    or (
      p_reconciliation_state <> 'provider_present'
      and (
        p_payment_intent_reference_ciphertext is not null
        or p_payment_intent_reference_sha256 is not null
      )
    ) then
    raise exception 'Flight Consumer Live Stripe execution recovery is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256
    or v_attempt.lease_token_sha256 <> p_lease_token_sha256 then
    raise exception
      'Flight Consumer Live Stripe execution recovery binding is invalid';
  end if;
  if v_attempt.attempt_state = 'reconciled'
    and v_attempt.attempt_revision = p_expected_revision + 1
    and v_attempt.recovery_state = p_reconciliation_state
    and v_attempt.reconciliation_evidence_sha256 =
      p_reconciliation_evidence_sha256
    and v_attempt.recovery_evidence_sha256 = p_recovery_evidence_sha256
    and v_attempt.payment_intent_reference_ciphertext
      is not distinct from p_payment_intent_reference_ciphertext
    and v_attempt.payment_intent_reference_sha256
      is not distinct from p_payment_intent_reference_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.recovery_state,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.blind_retry_authorized,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
      v_attempt.order_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled;
    return;
  end if;
  if v_attempt.attempt_state not in ('claimed', 'ambiguous')
    or v_attempt.attempt_revision <> p_expected_revision
    or (v_attempt.attempt_state = 'claimed'
      and v_now < v_attempt.lease_expires_at) then
    raise exception 'Flight Consumer Live Stripe execution recovery CAS refused';
  end if;

  v_origin := v_attempt.attempt_state;
  v_new_revision := v_attempt.attempt_revision + 1;
  v_request_count := case
    when v_origin = 'ambiguous' then 1
    when p_reconciliation_state in ('provider_present', 'unresolved') then 1
    else 0
  end;
  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', v_new_revision,
      'attempt_state', 'reconciled',
      'livemode', true,
      'payment_intent_reference_sha256', p_payment_intent_reference_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'reconciliation_evidence_sha256',
        p_reconciliation_evidence_sha256,
      'recovery_evidence_sha256', p_recovery_evidence_sha256,
      'recovery_origin_state', v_origin,
      'recovery_state', p_reconciliation_state
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_payment_executions as execution
     set attempt_state = 'reconciled',
         attempt_revision = v_new_revision,
         recovery_origin_state = v_origin,
         recovery_state = p_reconciliation_state,
         reconciliation_evidence_sha256 =
           p_reconciliation_evidence_sha256,
         recovery_evidence_sha256 = p_recovery_evidence_sha256,
         payment_intent_reference_ciphertext =
           p_payment_intent_reference_ciphertext,
         payment_intent_reference_sha256 = p_payment_intent_reference_sha256,
         stripe_request_count = v_request_count,
         stripe_mutation_count = v_request_count,
         payment_intent_create_count = v_request_count,
         external_request_made = (v_request_count = 1),
         completed_at = coalesce(v_attempt.completed_at, v_now),
         reconciled_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe execution recovery CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_payment_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, v_new_revision, 'recovered', 'reconciled',
    v_previous_receipt, v_receipt
  );

  return query select
    'reconciled'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.recovery_state,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.blind_retry_authorized,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.stripe_dispatch_authorized, v_attempt.payment_authorized,
    v_attempt.order_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled;
end;
$recover_flight_consumer_live_stripe_payment_execution_v1$;

alter function
  public.protect_flight_consumer_live_stripe_payment_execution_v1()
  owner to postgres;
alter function
  public.protect_flight_consumer_live_stripe_execution_receipt_v1()
  owner to postgres;
alter function
  public.prepare_flight_consumer_live_stripe_payment_execution_v1(
    uuid, text, text, text, timestamptz
  ) owner to postgres;
alter function
  public.claim_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, integer
  ) owner to postgres;
alter function
  public.complete_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, boolean
  ) owner to postgres;
alter function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  ) owner to postgres;
alter function
  public.recover_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, boolean
  ) owner to postgres;

revoke all on function
  public.protect_flight_consumer_live_stripe_payment_execution_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.protect_flight_consumer_live_stripe_execution_receipt_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_live_stripe_payment_execution_v1(
    uuid, text, text, text, timestamptz
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, integer
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.complete_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.recover_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;

grant execute on function
  public.prepare_flight_consumer_live_stripe_payment_execution_v1(
    uuid, text, text, text, timestamptz
  ) to service_role;
grant execute on function
  public.claim_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, integer
  ) to service_role;
grant execute on function
  public.complete_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, boolean
  ) to service_role;
grant execute on function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  ) to service_role;
grant execute on function
  public.recover_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, boolean
  ) to service_role;

comment on table public.flight_consumer_live_stripe_payment_executions is
  'Production-local Stripe live PaymentIntent execution evidence. Stores immutable plan digests and only encrypted PaymentIntent reference ciphertext plus its digest; grants no dispatch, payment, order, capture, refund, settlement, ticketing, servicing, retry, or consumer-release authority.';
comment on table
  public.flight_consumer_live_stripe_payment_execution_receipts is
  'Append-only digest receipt chain for Production-local Stripe live execution state transitions. No ciphertext, provider payload, credential, payment method, or client secret is returned.';
comment on function
  public.prepare_flight_consumer_live_stripe_payment_execution_v1(
    uuid, text, text, text, timestamptz
  ) is
  'Prepares or exactly replays one immutable live execution prerequisite bound to a reviewed 103 zero-dispatch plan; it grants no Stripe call authority.';
comment on function
  public.claim_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, integer
  ) is
  'Claims one bounded CAS lease without dispatching Stripe or granting payment authority.';
comment on function
  public.complete_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, boolean
  ) is
  'Records an externally obtained livemode=true completion using encrypted PaymentIntent reference ciphertext plus digest; returns digests only and grants no downstream authority.';
comment on function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  ) is
  'Terminally records an unknown live Stripe mutation outcome with digest evidence and no blind retry or reopen path.';
comment on function
  public.recover_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, boolean
  ) is
  'Terminally reconciles an expired claim or ambiguous outcome without reset, reopen, redispatch, ciphertext return, or blind retry authority.';

commit;
