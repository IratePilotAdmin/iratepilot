begin;

-- Production-dark persistence only. This journal cannot contact Stripe,
-- capture/refund money, create or service a Duffel order, issue a ticket, or
-- release a consumer path. It records one separately signed, one-shot manual
-- capture attempt after an exact 109/110 authorization and exact successful
-- 108 order receipt. State evidence and a successful claim grant no authority.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_checkout_authorization_bridges'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_confirmation_attempts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_executions'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_executions'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_execution_receipts'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_live_checkout_evidence_v1(uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.reconcile_flight_consumer_live_duffel_order_execution_v1(uuid,integer,text,text,text,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Stripe capture journal requires frozen 106 through 110 and SHA-256 prerequisites';
  end if;

  if to_regclass(
    'public.flight_consumer_live_stripe_capture_attempts'
  ) is not null
    or to_regclass(
      'public.flight_consumer_live_stripe_capture_receipts'
    ) is not null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_stripe_capture_v1(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text,timestamp with time zone,timestamp with time zone)'
    ) is not null then
    raise exception
      'Flight Consumer Live Stripe capture journal object collision refused';
  end if;
end;
$migration$;

create table public.flight_consumer_live_stripe_capture_attempts (
  id uuid primary key default gen_random_uuid(),
  checkout_aggregate_id uuid not null unique references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  authorization_bridge_receipt_sha256 text not null unique
    check (authorization_bridge_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_confirmation_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_confirmation_attempts(id)
    on delete restrict,
  confirmation_state_receipt_sha256 text not null unique
    check (confirmation_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_payment_executions(id)
    on delete restrict,
  duffel_order_execution_id uuid not null unique references
    public.flight_consumer_live_duffel_order_executions(id)
    on delete restrict,
  duffel_order_state_receipt_sha256 text not null unique
    check (duffel_order_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  duffel_order_execution_binding_sha256 text not null
    check (duffel_order_execution_binding_sha256 ~ '^[0-9a-f]{64}$'),
  provider_order_reference_sha256 text not null unique
    check (provider_order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_intent_reference_ciphertext text not null check (
    char_length(payment_intent_reference_ciphertext) <= 4096
    and payment_intent_reference_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
  ),
  payment_intent_reference_sha256 text not null unique
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_binding_sha256 text not null
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),

  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  capture_binding_sha256 text not null unique
    check (capture_binding_sha256 ~ '^[0-9a-f]{64}$'),
  capture_prerequisite_sha256 text not null
    check (capture_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  capture_request_sha256 text not null unique
    check (capture_request_sha256 ~ '^[0-9a-f]{64}$'),
  capture_authority_scope_sha256 text not null
    check (capture_authority_scope_sha256 ~ '^[0-9a-f]{64}$'),
  capture_authority_payload_sha256 text not null unique
    check (capture_authority_payload_sha256 ~ '^[0-9a-f]{64}$'),
  capture_authority_signature_sha256 text not null unique
    check (capture_authority_signature_sha256 ~ '^[0-9a-f]{64}$'),
  capture_authority_key_id text not null
    check (capture_authority_key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  capture_authority_not_after timestamptz not null,
  dispatch_not_after timestamptz not null,
  operation text not null default 'capture_payment_intent'
    check (operation = 'capture_payment_intent'),
  processor_environment text not null default 'stripe_live'
    check (processor_environment = 'stripe_live'),
  livemode boolean not null default true check (livemode),
  capture_method text not null default 'manual'
    check (capture_method = 'manual'),
  payment_method_type text not null default 'card'
    check (payment_method_type = 'card'),

  attempt_state text not null default 'prepared' check (
    attempt_state in (
      'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous',
      'reconciled'
    )
  ),
  attempt_revision integer not null default 0
    check (attempt_revision between 0 and 3),
  dispatch_token_sha256 text check (
    dispatch_token_sha256 is null
    or dispatch_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  dispatch_started_at timestamptz,
  stripe_capture_request_count integer not null default 0
    check (stripe_capture_request_count in (0, 1)),
  stripe_mutation_count integer not null default 0
    check (stripe_mutation_count in (0, 1)),
  stripe_retrieval_request_count integer not null default 0
    check (stripe_retrieval_request_count in (0, 1)),
  external_capture_request_made boolean not null default false,
  payment_intent_create_count integer not null default 0
    check (payment_intent_create_count = 0),
  order_request_count integer not null default 0
    check (order_request_count = 0),
  refund_request_count integer not null default 0
    check (refund_request_count = 0),
  settlement_request_count integer not null default 0
    check (settlement_request_count = 0),
  ticket_request_count integer not null default 0
    check (ticket_request_count = 0),
  servicing_request_count integer not null default 0
    check (servicing_request_count = 0),
  terminal_error_code text check (
    terminal_error_code is null
    or terminal_error_code ~ '^[a-z0-9_]{1,96}$'
  ),
  terminal_http_status integer check (
    terminal_http_status is null
    or terminal_http_status between 100 and 599
  ),
  terminal_response_sha256 text check (
    terminal_response_sha256 is null
    or terminal_response_sha256 ~ '^[0-9a-f]{64}$'
  ),
  completion_evidence_sha256 text check (
    completion_evidence_sha256 is null
    or completion_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ambiguity_evidence_sha256 text check (
    ambiguity_evidence_sha256 is null
    or ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  observed_payment_intent_status text check (
    observed_payment_intent_status is null
    or observed_payment_intent_status in ('succeeded', 'requires_capture')
  ),
  observed_payment_intent_reference_sha256 text check (
    observed_payment_intent_reference_sha256 is null
    or observed_payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  observed_amount_received_cents bigint check (
    observed_amount_received_cents is null
    or observed_amount_received_cents between 0 and 99999999
  ),
  observed_currency text check (
    observed_currency is null or observed_currency = 'usd'
  ),
  observed_livemode boolean,
  observed_capture_method text check (
    observed_capture_method is null or observed_capture_method = 'manual'
  ),
  charge_reference_ciphertext text check (
    charge_reference_ciphertext is null
    or (
      char_length(charge_reference_ciphertext) <= 4096
      and charge_reference_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
    )
  ),
  charge_reference_sha256 text unique check (
    charge_reference_sha256 is null
    or charge_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  reconciliation_outcome text check (
    reconciliation_outcome is null
    or reconciliation_outcome in ('succeeded', 'failed')
  ),
  retrieval_response_sha256 text check (
    retrieval_response_sha256 is null
    or retrieval_response_sha256 ~ '^[0-9a-f]{64}$'
  ),
  reconciliation_evidence_sha256 text check (
    reconciliation_evidence_sha256 is null
    or reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),

  client_secret_stored boolean not null default false
    check (not client_secret_stored),
  payment_method_stored boolean not null default false
    check (not payment_method_stored),
  card_data_stored boolean not null default false
    check (not card_data_stored),
  raw_provider_payload_stored boolean not null default false
    check (not raw_provider_payload_stored),
  pii_stored boolean not null default false check (not pii_stored),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
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

  latest_state_receipt_sha256 text not null
    check (latest_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  prepared_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  reconciled_at timestamptz,
  unique (execution_scope_sha256, idempotency_sha256),
  check (order_reference_sha256 <> customer_reference_sha256),
  check (capture_authority_not_after >= dispatch_not_after),
  check (dispatch_not_after > prepared_at),
  check (updated_at >= prepared_at),
  check (
    completed_at is null
    or (dispatch_started_at is not null and completed_at >= dispatch_started_at)
  ),
  check (
    reconciled_at is null
    or (completed_at is not null and reconciled_at >= completed_at)
  ),
  check (stripe_capture_request_count = stripe_mutation_count),
  check (
    stripe_capture_request_count = case
      when external_capture_request_made then 1 else 0
    end
  ),
  check (
    (charge_reference_ciphertext is null) =
      (charge_reference_sha256 is null)
  ),
  check (
    charge_reference_sha256 is null
    or (
      charge_reference_sha256 <> payment_intent_reference_sha256
      and charge_reference_sha256 <> provider_order_reference_sha256
    )
  ),
  check (
    capture_authority_payload_sha256 <>
      capture_authority_signature_sha256
  ),
  check (
    (observed_payment_intent_status is null
      and observed_payment_intent_reference_sha256 is null
      and observed_amount_received_cents is null
      and observed_currency is null
      and observed_livemode is null
      and observed_capture_method is null)
    or
    (observed_payment_intent_status = 'succeeded'
      and observed_payment_intent_reference_sha256 =
        payment_intent_reference_sha256
      and observed_amount_received_cents = amount_cents
      and observed_currency = lower(currency)
      and observed_livemode is true
      and observed_capture_method = capture_method)
    or
    (observed_payment_intent_status = 'requires_capture'
      and observed_payment_intent_reference_sha256 =
        payment_intent_reference_sha256
      and observed_amount_received_cents = 0
      and observed_currency = lower(currency)
      and observed_livemode is true
      and observed_capture_method = capture_method)
  ),
  check (
    (attempt_state = 'prepared'
      and attempt_revision = 0
      and dispatch_token_sha256 is null
      and dispatch_started_at is null
      and stripe_capture_request_count = 0
      and stripe_retrieval_request_count = 0
      and not external_capture_request_made
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_payment_intent_reference_sha256 is null
      and charge_reference_sha256 is null
      and reconciliation_outcome is null
      and retrieval_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'dispatching'
      and attempt_revision = 1
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and stripe_capture_request_count = 0
      and stripe_retrieval_request_count = 0
      and not external_capture_request_made
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_payment_intent_reference_sha256 is null
      and charge_reference_sha256 is null
      and reconciliation_outcome is null
      and retrieval_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'succeeded'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and stripe_capture_request_count = 1
      and stripe_retrieval_request_count = 0
      and external_capture_request_made
      and terminal_error_code is null
      and terminal_http_status = 200
      and terminal_response_sha256 is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is null
      and observed_payment_intent_status = 'succeeded'
      and observed_payment_intent_reference_sha256 =
        payment_intent_reference_sha256
      and charge_reference_ciphertext is not null
      and charge_reference_sha256 is not null
      and reconciliation_outcome is null
      and retrieval_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'failed'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and stripe_retrieval_request_count = 0
      and terminal_error_code is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_payment_intent_reference_sha256 is null
      and charge_reference_sha256 is null
      and reconciliation_outcome is null
      and retrieval_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null
      and (
        (stripe_capture_request_count = 0
          and not external_capture_request_made
          and terminal_http_status is null
          and terminal_response_sha256 is null)
        or
        (stripe_capture_request_count = 1
          and external_capture_request_made
          and terminal_http_status between 400 and 499
          and terminal_response_sha256 is not null)
      ))
    or
    (attempt_state = 'ambiguous'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and stripe_capture_request_count = 1
      and stripe_retrieval_request_count = 0
      and external_capture_request_made
      and terminal_error_code is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is not null
      and observed_payment_intent_status is null
      and observed_payment_intent_reference_sha256 is null
      and charge_reference_sha256 is null
      and reconciliation_outcome is null
      and retrieval_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'reconciled'
      and attempt_revision = 3
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and stripe_capture_request_count = 1
      and stripe_retrieval_request_count = 1
      and external_capture_request_made
      and terminal_error_code is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is not null
      and reconciliation_outcome is not null
      and retrieval_response_sha256 is not null
      and reconciliation_evidence_sha256 is not null
      and completed_at is not null
      and reconciled_at is not null
      and (
        (reconciliation_outcome = 'succeeded'
          and observed_payment_intent_status = 'succeeded'
          and observed_payment_intent_reference_sha256 =
            payment_intent_reference_sha256
          and charge_reference_ciphertext is not null
          and charge_reference_sha256 is not null)
        or
        (reconciliation_outcome = 'failed'
          and observed_payment_intent_status = 'requires_capture'
          and observed_payment_intent_reference_sha256 =
            payment_intent_reference_sha256
          and charge_reference_sha256 is null)
      ))
  )
);

create index flight_consumer_live_stripe_capture_state_idx
  on public.flight_consumer_live_stripe_capture_attempts (
    attempt_state, updated_at desc
  );

create table public.flight_consumer_live_stripe_capture_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_live_stripe_capture_attempts(id)
    on delete restrict,
  attempt_revision integer not null check (attempt_revision between 0 and 3),
  receipt_kind text not null check (
    receipt_kind in (
      'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous',
      'reconciled'
    )
  ),
  attempt_state text not null check (attempt_state = receipt_kind),
  previous_receipt_sha256 text check (
    previous_receipt_sha256 is null
    or previous_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  receipt_sha256 text not null unique
    check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, attempt_revision),
  check (
    (attempt_revision = 0
      and receipt_kind = 'prepared'
      and previous_receipt_sha256 is null)
    or
    (attempt_revision between 1 and 3
      and receipt_kind <> 'prepared'
      and previous_receipt_sha256 is not null)
  )
);

alter table public.flight_consumer_live_stripe_capture_attempts
  enable row level security;
alter table public.flight_consumer_live_stripe_capture_attempts
  force row level security;
alter table public.flight_consumer_live_stripe_capture_receipts
  enable row level security;
alter table public.flight_consumer_live_stripe_capture_receipts
  force row level security;

revoke all on table
  public.flight_consumer_live_stripe_capture_attempts,
  public.flight_consumer_live_stripe_capture_receipts
from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_stripe_capture_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_capture_v1$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight Consumer Live Stripe capture evidence is immutable';
  end if;

  if row(
    new.id, new.checkout_aggregate_id,
    new.authorization_bridge_receipt_sha256,
    new.stripe_confirmation_attempt_id,
    new.confirmation_state_receipt_sha256,
    new.stripe_execution_attempt_id, new.duffel_order_execution_id,
    new.duffel_order_state_receipt_sha256,
    new.duffel_order_execution_binding_sha256,
    new.provider_order_reference_sha256,
    new.payment_intent_reference_ciphertext,
    new.payment_intent_reference_sha256, new.checkout_binding_sha256,
    new.order_reference_sha256, new.customer_reference_sha256,
    new.amount_cents, new.currency, new.execution_scope_sha256,
    new.idempotency_sha256, new.capture_binding_sha256,
    new.capture_prerequisite_sha256, new.capture_request_sha256,
    new.capture_authority_scope_sha256,
    new.capture_authority_payload_sha256,
    new.capture_authority_signature_sha256,
    new.capture_authority_key_id, new.capture_authority_not_after,
    new.dispatch_not_after, new.operation, new.processor_environment,
    new.livemode, new.capture_method, new.payment_method_type,
    new.prepared_at,
    new.payment_intent_create_count, new.order_request_count,
    new.refund_request_count, new.settlement_request_count,
    new.ticket_request_count, new.servicing_request_count,
    new.client_secret_stored, new.payment_method_stored,
    new.card_data_stored, new.raw_provider_payload_stored, new.pii_stored,
    new.provider_dispatch_authorized, new.stripe_dispatch_authorized,
    new.booking_authorized, new.order_authorized, new.payment_authorized,
    new.capture_authorized, new.refund_authorized,
    new.settlement_authorized, new.ticketing_authorized,
    new.servicing_authorized, new.consumer_release_enabled,
    new.blind_retry_authorized
  ) is distinct from row(
    old.id, old.checkout_aggregate_id,
    old.authorization_bridge_receipt_sha256,
    old.stripe_confirmation_attempt_id,
    old.confirmation_state_receipt_sha256,
    old.stripe_execution_attempt_id, old.duffel_order_execution_id,
    old.duffel_order_state_receipt_sha256,
    old.duffel_order_execution_binding_sha256,
    old.provider_order_reference_sha256,
    old.payment_intent_reference_ciphertext,
    old.payment_intent_reference_sha256, old.checkout_binding_sha256,
    old.order_reference_sha256, old.customer_reference_sha256,
    old.amount_cents, old.currency, old.execution_scope_sha256,
    old.idempotency_sha256, old.capture_binding_sha256,
    old.capture_prerequisite_sha256, old.capture_request_sha256,
    old.capture_authority_scope_sha256,
    old.capture_authority_payload_sha256,
    old.capture_authority_signature_sha256,
    old.capture_authority_key_id, old.capture_authority_not_after,
    old.dispatch_not_after, old.operation, old.processor_environment,
    old.livemode, old.capture_method, old.payment_method_type,
    old.prepared_at,
    old.payment_intent_create_count, old.order_request_count,
    old.refund_request_count, old.settlement_request_count,
    old.ticket_request_count, old.servicing_request_count,
    old.client_secret_stored, old.payment_method_stored,
    old.card_data_stored, old.raw_provider_payload_stored, old.pii_stored,
    old.provider_dispatch_authorized, old.stripe_dispatch_authorized,
    old.booking_authorized, old.order_authorized, old.payment_authorized,
    old.capture_authorized, old.refund_authorized,
    old.settlement_authorized, old.ticketing_authorized,
    old.servicing_authorized, old.consumer_release_enabled,
    old.blind_retry_authorized
  ) then
    raise exception 'Flight Consumer Live Stripe capture binding is immutable';
  end if;

  if not (
    (old.attempt_state = 'prepared'
      and old.attempt_revision = 0
      and new.attempt_state = 'dispatching'
      and new.attempt_revision = 1)
    or
    (old.attempt_state = 'dispatching'
      and old.attempt_revision = 1
      and new.attempt_state in ('succeeded', 'failed', 'ambiguous')
      and new.attempt_revision = 2)
    or
    (old.attempt_state = 'ambiguous'
      and old.attempt_revision = 2
      and new.attempt_state = 'reconciled'
      and new.attempt_revision = 3)
  ) then
    raise exception 'Flight Consumer Live Stripe capture transition refused';
  end if;

  if new.stripe_capture_request_count < old.stripe_capture_request_count
    or new.stripe_mutation_count < old.stripe_mutation_count
    or new.stripe_retrieval_request_count <
      old.stripe_retrieval_request_count then
    raise exception 'Flight Consumer Live Stripe capture counter regression';
  end if;
  return new;
end;
$protect_flight_consumer_live_stripe_capture_v1$;

create trigger flight_consumer_live_stripe_capture_transition_guard
before update or delete
on public.flight_consumer_live_stripe_capture_attempts
for each row execute function
  public.protect_flight_consumer_live_stripe_capture_v1();

create function public.protect_flight_consumer_live_stripe_capture_receipt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_capture_receipt_v1$
begin
  raise exception 'Flight Consumer Live Stripe capture receipts are append-only';
end;
$protect_flight_consumer_live_stripe_capture_receipt_v1$;

create trigger flight_consumer_live_stripe_capture_receipt_append_guard
before update or delete
on public.flight_consumer_live_stripe_capture_receipts
for each row execute function
  public.protect_flight_consumer_live_stripe_capture_receipt_v1();

create function public.prepare_flight_consumer_live_stripe_capture_v1(
  p_checkout_aggregate_id uuid,
  p_authorization_bridge_receipt_sha256 text,
  p_stripe_confirmation_attempt_id uuid,
  p_confirmation_state_receipt_sha256 text,
  p_duffel_order_execution_id uuid,
  p_duffel_order_state_receipt_sha256 text,
  p_provider_order_reference_sha256 text,
  p_payment_intent_reference_sha256 text,
  p_duffel_order_execution_binding_sha256 text,
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_capture_binding_sha256 text,
  p_capture_prerequisite_sha256 text,
  p_capture_request_sha256 text,
  p_capture_authority_scope_sha256 text,
  p_capture_authority_payload_sha256 text,
  p_capture_authority_signature_sha256 text,
  p_capture_authority_key_id text,
  p_amount_cents bigint,
  p_currency text,
  p_capture_authority_not_after timestamptz,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
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
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_live_stripe_capture_v1$
declare
  v_bridge public.flight_consumer_live_checkout_authorization_bridges;
  v_confirmation public.flight_consumer_live_stripe_confirmation_attempts;
  v_order public.flight_consumer_live_duffel_order_executions;
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
  v_attempt_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_receipt text;
  v_match_count bigint;
  v_exact_match boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe capture is service-role only';
  end if;
  if p_checkout_aggregate_id is null
    or p_stripe_confirmation_attempt_id is null
    or p_duffel_order_execution_id is null
    or p_authorization_bridge_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_duffel_order_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_duffel_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_authority_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_authority_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_authority_signature_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_authority_key_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_amount_cents not between 50 and 99999999
    or p_currency is distinct from 'USD'
    or p_capture_authority_not_after is null
    or p_dispatch_not_after is null
    or p_capture_authority_not_after < p_dispatch_not_after
    or p_capture_authority_not_after > v_now + interval '15 minutes'
  then
    raise exception 'Flight Consumer Live Stripe capture preparation is invalid';
  end if;

  -- Resolve an exact durable identity before consulting freshness. This
  -- permits observation/recovery of an already-recorded terminal attempt
  -- after its one-shot authority expires without reopening dispatch.
  select count(*), coalesce(bool_and(row(
    attempt.checkout_aggregate_id,
    attempt.authorization_bridge_receipt_sha256,
    attempt.stripe_confirmation_attempt_id,
    attempt.confirmation_state_receipt_sha256,
    attempt.duffel_order_execution_id,
    attempt.duffel_order_state_receipt_sha256,
    attempt.provider_order_reference_sha256,
    attempt.payment_intent_reference_sha256,
    attempt.duffel_order_execution_binding_sha256,
    attempt.execution_scope_sha256, attempt.idempotency_sha256,
    attempt.capture_binding_sha256, attempt.capture_prerequisite_sha256,
    attempt.capture_request_sha256,
    attempt.capture_authority_scope_sha256,
    attempt.capture_authority_payload_sha256,
    attempt.capture_authority_signature_sha256,
    attempt.capture_authority_key_id,
    attempt.capture_authority_not_after, attempt.dispatch_not_after,
    attempt.amount_cents, attempt.currency
  ) = row(
    p_checkout_aggregate_id, p_authorization_bridge_receipt_sha256,
    p_stripe_confirmation_attempt_id,
    p_confirmation_state_receipt_sha256,
    p_duffel_order_execution_id, p_duffel_order_state_receipt_sha256,
    p_provider_order_reference_sha256,
    p_payment_intent_reference_sha256,
    p_duffel_order_execution_binding_sha256,
    p_execution_scope_sha256, p_idempotency_sha256,
    p_capture_binding_sha256, p_capture_prerequisite_sha256,
    p_capture_request_sha256, p_capture_authority_scope_sha256,
    p_capture_authority_payload_sha256,
    p_capture_authority_signature_sha256, p_capture_authority_key_id,
    p_capture_authority_not_after, p_dispatch_not_after,
    p_amount_cents, p_currency
  )), false)
  into v_match_count, v_exact_match
  from public.flight_consumer_live_stripe_capture_attempts as attempt
  where attempt.checkout_aggregate_id = p_checkout_aggregate_id
     or attempt.stripe_confirmation_attempt_id =
       p_stripe_confirmation_attempt_id
     or attempt.duffel_order_execution_id = p_duffel_order_execution_id
     or attempt.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     or attempt.execution_scope_sha256 = p_execution_scope_sha256
     or attempt.idempotency_sha256 = p_idempotency_sha256
     or attempt.capture_binding_sha256 = p_capture_binding_sha256
     or attempt.capture_request_sha256 = p_capture_request_sha256
     or attempt.capture_authority_payload_sha256 =
       p_capture_authority_payload_sha256
     or attempt.capture_authority_signature_sha256 =
       p_capture_authority_signature_sha256;

  if v_match_count > 0 then
    if v_match_count <> 1 or not v_exact_match then
      raise exception 'Flight Consumer Live Stripe capture collision refused';
    end if;
    select attempt.* into v_attempt
      from public.flight_consumer_live_stripe_capture_attempts as attempt
     where attempt.checkout_aggregate_id = p_checkout_aggregate_id;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.provider_order_reference_sha256,
      v_attempt.charge_reference_sha256,
      v_attempt.stripe_capture_request_count,
      v_attempt.stripe_mutation_count,
      v_attempt.stripe_retrieval_request_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now + interval '15 seconds'
    or p_capture_authority_not_after <= v_now + interval '15 seconds'
    or p_capture_authority_not_after > v_now + interval '15 minutes' then
    raise exception 'Flight Consumer Live Stripe capture authority is stale';
  end if;

  select bridge.* into v_bridge
    from public.flight_consumer_live_checkout_authorization_bridges as bridge
   where bridge.checkout_aggregate_id = p_checkout_aggregate_id
     and bridge.authorization_bridge_receipt_sha256 =
       p_authorization_bridge_receipt_sha256
     and bridge.stripe_confirmation_attempt_id =
       p_stripe_confirmation_attempt_id
     and bridge.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     and bridge.amount_cents = p_amount_cents
     and bridge.currency = p_currency
     and bridge.authorization_not_after >= p_capture_authority_not_after
     and bridge.authorization_not_after > v_now + interval '15 seconds';
  if not found then
    raise exception 'Flight Consumer Live Stripe capture bridge is invalid';
  end if;

  select confirmation.* into v_confirmation
    from public.flight_consumer_live_stripe_confirmation_attempts
      as confirmation
   where confirmation.id = p_stripe_confirmation_attempt_id
     and confirmation.checkout_aggregate_id = p_checkout_aggregate_id
     and confirmation.stripe_execution_attempt_id =
       v_bridge.stripe_execution_attempt_id
     and confirmation.latest_state_receipt_sha256 =
       p_confirmation_state_receipt_sha256
     and confirmation.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     and confirmation.checkout_binding_sha256 =
       v_bridge.checkout_binding_sha256
     and confirmation.order_reference_sha256 =
       v_bridge.order_reference_sha256
     and confirmation.customer_reference_sha256 =
       v_bridge.customer_reference_sha256
     and confirmation.amount_cents = p_amount_cents
     and confirmation.currency = p_currency
     and confirmation.livemode
     and confirmation.capture_method = 'manual'
     and confirmation.payment_method_type = 'card'
     and confirmation.observed_payment_intent_status = 'requires_capture'
     and confirmation.observed_amount_cents = p_amount_cents
     and confirmation.observed_currency = lower(p_currency)
     and confirmation.observed_livemode
     and confirmation.confirmation_not_after > v_now + interval '15 seconds'
     and (
       (confirmation.confirmation_state = 'authorized_requires_capture'
         and confirmation.confirmation_revision = 2
         and confirmation.reconciled_outcome is null)
       or
       (confirmation.confirmation_state = 'reconciled'
         and confirmation.confirmation_revision = 3
         and confirmation.reconciled_outcome =
           'authorized_requires_capture')
     );
  if not found then
    raise exception 'Flight Consumer Live Stripe capture confirmation is invalid';
  end if;

  select execution.* into v_order
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_duffel_order_execution_id
     and execution.checkout_evidence_aggregate_id = p_checkout_aggregate_id
     and execution.checkout_binding_sha256 =
       v_bridge.checkout_binding_sha256
     and execution.checkout_state_receipt_sha256 =
       v_bridge.checkout_finalized_receipt_sha256
     and execution.order_execution_binding_sha256 =
       p_duffel_order_execution_binding_sha256
     and execution.latest_state_receipt_sha256 =
       p_duffel_order_state_receipt_sha256
     and execution.provider_order_reference_sha256 =
       p_provider_order_reference_sha256
     and execution.provider_order_reference_ciphertext is not null
     and execution.order_reference_sha256 =
       v_bridge.order_reference_sha256
     and execution.customer_reference_sha256 =
       v_bridge.customer_reference_sha256
     and execution.amount_cents = p_amount_cents
     and execution.currency = p_currency
     and execution.livemode
     and execution.provider_request_count = 1
     and execution.air_orders_post_count = 1
     and execution.external_request_made
     and (
       (execution.attempt_state = 'succeeded'
         and execution.attempt_revision = 2
         and execution.reconciliation_outcome is null)
       or
       (execution.attempt_state = 'reconciled'
         and execution.attempt_revision = 3
         and execution.reconciliation_outcome = 'succeeded')
     );
  if not found or not exists (
    select 1
      from public.flight_consumer_live_duffel_order_execution_receipts
        as receipt
     where receipt.attempt_id = v_order.id
       and receipt.attempt_revision = v_order.attempt_revision
       and receipt.attempt_state = v_order.attempt_state
       and receipt.receipt_sha256 = p_duffel_order_state_receipt_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe capture order evidence is invalid';
  end if;

  -- Refresh trusted time after all prerequisite reads. A new authority must
  -- still have a usable window at the last pre-insert checkpoint.
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now + interval '15 seconds'
    or p_capture_authority_not_after <= v_now + interval '15 seconds'
    or v_bridge.authorization_not_after <= v_now + interval '15 seconds'
    or v_confirmation.confirmation_not_after <=
      v_now + interval '15 seconds' then
    raise exception 'Flight Consumer Live Stripe capture authority expired';
  end if;

  select count(*), coalesce(bool_and(row(
    attempt.checkout_aggregate_id,
    attempt.authorization_bridge_receipt_sha256,
    attempt.stripe_confirmation_attempt_id,
    attempt.confirmation_state_receipt_sha256,
    attempt.duffel_order_execution_id,
    attempt.duffel_order_state_receipt_sha256,
    attempt.provider_order_reference_sha256,
    attempt.payment_intent_reference_sha256,
    attempt.duffel_order_execution_binding_sha256,
    attempt.execution_scope_sha256, attempt.idempotency_sha256,
    attempt.capture_binding_sha256, attempt.capture_prerequisite_sha256,
    attempt.capture_request_sha256,
    attempt.capture_authority_scope_sha256,
    attempt.capture_authority_payload_sha256,
    attempt.capture_authority_signature_sha256,
    attempt.capture_authority_key_id,
    attempt.capture_authority_not_after, attempt.dispatch_not_after,
    attempt.amount_cents, attempt.currency
  ) = row(
    p_checkout_aggregate_id, p_authorization_bridge_receipt_sha256,
    p_stripe_confirmation_attempt_id,
    p_confirmation_state_receipt_sha256,
    p_duffel_order_execution_id, p_duffel_order_state_receipt_sha256,
    p_provider_order_reference_sha256,
    p_payment_intent_reference_sha256,
    p_duffel_order_execution_binding_sha256,
    p_execution_scope_sha256, p_idempotency_sha256,
    p_capture_binding_sha256, p_capture_prerequisite_sha256,
    p_capture_request_sha256, p_capture_authority_scope_sha256,
    p_capture_authority_payload_sha256,
    p_capture_authority_signature_sha256, p_capture_authority_key_id,
    p_capture_authority_not_after, p_dispatch_not_after,
    p_amount_cents, p_currency
  )), false)
  into v_match_count, v_exact_match
  from public.flight_consumer_live_stripe_capture_attempts as attempt
  where attempt.checkout_aggregate_id = p_checkout_aggregate_id
     or attempt.stripe_confirmation_attempt_id =
       p_stripe_confirmation_attempt_id
     or attempt.duffel_order_execution_id = p_duffel_order_execution_id
     or attempt.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     or attempt.execution_scope_sha256 = p_execution_scope_sha256
     or attempt.idempotency_sha256 = p_idempotency_sha256
     or attempt.capture_binding_sha256 = p_capture_binding_sha256
     or attempt.capture_request_sha256 = p_capture_request_sha256
     or attempt.capture_authority_payload_sha256 =
       p_capture_authority_payload_sha256
     or attempt.capture_authority_signature_sha256 =
       p_capture_authority_signature_sha256;

  if v_match_count > 0 then
    if v_match_count <> 1 or not v_exact_match then
      raise exception 'Flight Consumer Live Stripe capture collision refused';
    end if;
    select attempt.* into v_attempt
      from public.flight_consumer_live_stripe_capture_attempts as attempt
     where attempt.checkout_aggregate_id = p_checkout_aggregate_id;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.provider_order_reference_sha256,
      v_attempt.charge_reference_sha256,
      v_attempt.stripe_capture_request_count,
      v_attempt.stripe_mutation_count,
      v_attempt.stripe_retrieval_request_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-capture-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt_id,
      'attempt_revision', 0,
      'attempt_state', 'prepared',
      'authorization_bridge_receipt_sha256',
        p_authorization_bridge_receipt_sha256,
      'capture_authority_payload_sha256',
        p_capture_authority_payload_sha256,
      'capture_authority_signature_sha256',
        p_capture_authority_signature_sha256,
      'capture_request_sha256', p_capture_request_sha256,
      'duffel_order_state_receipt_sha256',
        p_duffel_order_state_receipt_sha256,
      'payment_intent_reference_sha256',
        p_payment_intent_reference_sha256,
      'provider_order_reference_sha256',
        p_provider_order_reference_sha256,
      'previous_receipt_sha256', null
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_stripe_capture_attempts (
    id, checkout_aggregate_id, authorization_bridge_receipt_sha256,
    stripe_confirmation_attempt_id, confirmation_state_receipt_sha256,
    stripe_execution_attempt_id, duffel_order_execution_id,
    duffel_order_state_receipt_sha256,
    duffel_order_execution_binding_sha256,
    provider_order_reference_sha256,
    payment_intent_reference_ciphertext,
    payment_intent_reference_sha256, checkout_binding_sha256,
    order_reference_sha256, customer_reference_sha256,
    amount_cents, currency, execution_scope_sha256, idempotency_sha256,
    capture_binding_sha256, capture_prerequisite_sha256,
    capture_request_sha256, capture_authority_scope_sha256,
    capture_authority_payload_sha256, capture_authority_signature_sha256,
    capture_authority_key_id, capture_authority_not_after,
    dispatch_not_after, latest_state_receipt_sha256
  ) values (
    v_attempt_id, p_checkout_aggregate_id,
    p_authorization_bridge_receipt_sha256,
    p_stripe_confirmation_attempt_id, p_confirmation_state_receipt_sha256,
    v_bridge.stripe_execution_attempt_id, p_duffel_order_execution_id,
    p_duffel_order_state_receipt_sha256,
    p_duffel_order_execution_binding_sha256,
    p_provider_order_reference_sha256,
    v_confirmation.payment_intent_reference_ciphertext,
    p_payment_intent_reference_sha256, v_bridge.checkout_binding_sha256,
    v_bridge.order_reference_sha256, v_bridge.customer_reference_sha256,
    p_amount_cents, p_currency, p_execution_scope_sha256,
    p_idempotency_sha256, p_capture_binding_sha256,
    p_capture_prerequisite_sha256, p_capture_request_sha256,
    p_capture_authority_scope_sha256, p_capture_authority_payload_sha256,
    p_capture_authority_signature_sha256, p_capture_authority_key_id,
    p_capture_authority_not_after, p_dispatch_not_after, v_receipt
  ) returning * into v_attempt;

  -- A uniqueness wait can outlive the authority. Re-read trusted time after
  -- the insert and abort this transaction if the one-shot window is stale.
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now + interval '15 seconds'
    or v_attempt.capture_authority_not_after <=
      v_now + interval '15 seconds' then
    raise exception 'Flight Consumer Live Stripe capture insert expired';
  end if;

  insert into public.flight_consumer_live_stripe_capture_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 0, 'prepared', 'prepared', null, v_receipt
  );

  return query select
    'created'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.provider_order_reference_sha256,
    v_attempt.charge_reference_sha256,
    v_attempt.stripe_capture_request_count, v_attempt.stripe_mutation_count,
    v_attempt.stripe_retrieval_request_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.stripe_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$prepare_flight_consumer_live_stripe_capture_v1$;

create function public.claim_flight_consumer_live_stripe_capture_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_capture_binding_sha256 text,
  p_capture_request_sha256 text,
  p_dispatch_token_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
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
set search_path = pg_catalog, public, extensions
as $claim_flight_consumer_live_stripe_capture_v1$
declare
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
  v_previous_receipt text;
  v_receipt text;
  v_bridge_not_after timestamptz;
  v_confirmation_not_after timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe capture claim is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Stripe capture claim is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_capture_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.capture_binding_sha256 = p_capture_binding_sha256
     and attempt.capture_request_sha256 = p_capture_request_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture claim binding is invalid';
  end if;

  -- FOR UPDATE can block. Never evaluate a capture deadline with the
  -- function-entry timestamp after the row lock is finally acquired.
  v_now := clock_timestamp();

  if v_attempt.attempt_state = 'dispatching'
    and v_attempt.attempt_revision = 1
    and v_attempt.dispatch_token_sha256 = p_dispatch_token_sha256
    and v_attempt.dispatch_not_after > v_now + interval '15 seconds'
    and v_attempt.capture_authority_not_after >
      v_now + interval '15 seconds' then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.provider_order_reference_sha256,
      v_attempt.charge_reference_sha256,
      v_attempt.stripe_capture_request_count,
      v_attempt.stripe_mutation_count,
      v_attempt.stripe_retrieval_request_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'prepared'
    or v_attempt.attempt_revision <> p_expected_revision
    or v_attempt.dispatch_not_after <= v_now + interval '15 seconds'
    or v_attempt.capture_authority_not_after <= v_now + interval '15 seconds'
    or not exists (
      select 1
        from public.flight_consumer_live_checkout_authorization_bridges
          as bridge
        join public.flight_consumer_live_stripe_confirmation_attempts
          as confirmation
          on confirmation.id = bridge.stripe_confirmation_attempt_id
        join public.flight_consumer_live_duffel_order_executions as execution
          on execution.checkout_evidence_aggregate_id =
            bridge.checkout_aggregate_id
       where bridge.checkout_aggregate_id = v_attempt.checkout_aggregate_id
         and bridge.authorization_bridge_receipt_sha256 =
           v_attempt.authorization_bridge_receipt_sha256
         and bridge.authorization_not_after >=
           v_attempt.capture_authority_not_after
         and confirmation.id = v_attempt.stripe_confirmation_attempt_id
         and confirmation.latest_state_receipt_sha256 =
           v_attempt.confirmation_state_receipt_sha256
         and confirmation.observed_payment_intent_status = 'requires_capture'
         and confirmation.observed_amount_cents = v_attempt.amount_cents
         and confirmation.observed_currency = lower(v_attempt.currency)
         and confirmation.observed_livemode
         and confirmation.capture_method = 'manual'
         and confirmation.payment_method_type = 'card'
         and confirmation.payment_intent_reference_sha256 =
           v_attempt.payment_intent_reference_sha256
         and (
           confirmation.confirmation_state = 'authorized_requires_capture'
           or (confirmation.confirmation_state = 'reconciled'
             and confirmation.reconciled_outcome =
               'authorized_requires_capture')
         )
         and execution.id = v_attempt.duffel_order_execution_id
         and execution.latest_state_receipt_sha256 =
           v_attempt.duffel_order_state_receipt_sha256
         and execution.provider_order_reference_sha256 =
           v_attempt.provider_order_reference_sha256
         and execution.order_execution_binding_sha256 =
           v_attempt.duffel_order_execution_binding_sha256
         and (
           execution.attempt_state = 'succeeded'
           or (execution.attempt_state = 'reconciled'
             and execution.reconciliation_outcome = 'succeeded')
         )
    ) then
    raise exception 'Flight Consumer Live Stripe capture claim CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-capture-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 1,
      'attempt_state', 'dispatching',
      'dispatch_token_sha256', p_dispatch_token_sha256,
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  -- The prerequisite scan and receipt construction can both follow blocking
  -- work. Resolve the immutable upstream deadlines again, then use a fresh
  -- trusted timestamp immediately before the claim CAS. Evidence that was
  -- fresh when the row lock was acquired cannot authorize a late capture.
  select bridge.authorization_not_after, confirmation.confirmation_not_after
    into v_bridge_not_after, v_confirmation_not_after
    from public.flight_consumer_live_checkout_authorization_bridges as bridge
    join public.flight_consumer_live_stripe_confirmation_attempts
      as confirmation
      on confirmation.id = bridge.stripe_confirmation_attempt_id
   where bridge.checkout_aggregate_id = v_attempt.checkout_aggregate_id
     and bridge.authorization_bridge_receipt_sha256 =
       v_attempt.authorization_bridge_receipt_sha256
     and confirmation.id = v_attempt.stripe_confirmation_attempt_id
     and confirmation.latest_state_receipt_sha256 =
       v_attempt.confirmation_state_receipt_sha256;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture claim prerequisite changed';
  end if;

  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now + interval '15 seconds'
    or v_attempt.capture_authority_not_after <=
      v_now + interval '15 seconds'
    or v_bridge_not_after <= v_now + interval '15 seconds'
    or v_confirmation_not_after <= v_now + interval '15 seconds' then
    raise exception 'Flight Consumer Live Stripe capture claim expired before CAS';
  end if;

  update public.flight_consumer_live_stripe_capture_attempts as attempt
     set attempt_state = 'dispatching', attempt_revision = 1,
         dispatch_token_sha256 = p_dispatch_token_sha256,
         dispatch_started_at = v_now, updated_at = v_now,
         latest_state_receipt_sha256 = v_receipt
   where attempt.id = v_attempt.id
     and attempt.attempt_state = 'prepared'
     and attempt.attempt_revision = p_expected_revision
  returning attempt.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture claim CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_capture_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 1, 'dispatching', 'dispatching',
    v_previous_receipt, v_receipt
  );

  return query select
    'claimed'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.provider_order_reference_sha256,
    v_attempt.charge_reference_sha256,
    v_attempt.stripe_capture_request_count, v_attempt.stripe_mutation_count,
    v_attempt.stripe_retrieval_request_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.stripe_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$claim_flight_consumer_live_stripe_capture_v1$;

create function public.complete_flight_consumer_live_stripe_capture_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_capture_binding_sha256 text,
  p_capture_request_sha256 text,
  p_dispatch_token_sha256 text,
  p_terminal_state text,
  p_stripe_capture_request_count integer,
  p_stripe_mutation_count integer,
  p_terminal_error_code text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_completion_evidence_sha256 text,
  p_ambiguity_evidence_sha256 text,
  p_observed_payment_intent_status text,
  p_observed_payment_intent_reference_sha256 text,
  p_observed_amount_received_cents bigint,
  p_observed_currency text,
  p_observed_livemode boolean,
  p_observed_capture_method text,
  p_charge_reference_ciphertext text,
  p_charge_reference_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
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
set search_path = pg_catalog, public, extensions
as $complete_flight_consumer_live_stripe_capture_v1$
declare
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe capture completion is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 1
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_state not in ('succeeded', 'failed', 'ambiguous')
    or p_stripe_capture_request_count not in (0, 1)
    or p_stripe_mutation_count is distinct from
      p_stripe_capture_request_count
    or p_completion_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (p_charge_reference_ciphertext is null) <>
      (p_charge_reference_sha256 is null)
    or (
      p_charge_reference_ciphertext is not null
      and (
        char_length(p_charge_reference_ciphertext) > 4096
        or p_charge_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_charge_reference_sha256 !~ '^[0-9a-f]{64}$'
      )
    ) then
    raise exception 'Flight Consumer Live Stripe capture completion is invalid';
  end if;

  if p_terminal_state = 'succeeded' and not coalesce((
    p_stripe_capture_request_count = 1
    and p_terminal_error_code is null
    and p_terminal_http_status = 200
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_ambiguity_evidence_sha256 is null
    and p_observed_payment_intent_status = 'succeeded'
    and p_observed_payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
    and p_observed_amount_received_cents between 50 and 99999999
    and p_observed_currency = 'usd'
    and p_observed_livemode is true
    and p_observed_capture_method = 'manual'
    and p_charge_reference_ciphertext is not null
    and p_charge_reference_sha256 ~ '^[0-9a-f]{64}$'
  ), false) then
    raise exception 'Flight Consumer Live Stripe capture success evidence is invalid';
  elsif p_terminal_state = 'failed' and not coalesce((
    p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and p_ambiguity_evidence_sha256 is null
    and p_observed_payment_intent_status is null
    and p_observed_payment_intent_reference_sha256 is null
    and p_observed_amount_received_cents is null
    and p_observed_currency is null
    and p_observed_livemode is null
    and p_observed_capture_method is null
    and p_charge_reference_sha256 is null
    and (
      (p_stripe_capture_request_count = 0
        and p_terminal_http_status is null
        and p_terminal_response_sha256 is null)
      or
      (p_stripe_capture_request_count = 1
        and p_terminal_http_status between 400 and 499
        and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$')
    )
  ), false) then
    raise exception 'Flight Consumer Live Stripe capture failure evidence is invalid';
  elsif p_terminal_state = 'ambiguous' and not coalesce((
    p_stripe_capture_request_count = 1
    and p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and (p_terminal_http_status is null
      or p_terminal_http_status between 100 and 599)
    and (p_terminal_response_sha256 is null
      or p_terminal_response_sha256 ~ '^[0-9a-f]{64}$')
    and p_ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
    and p_ambiguity_evidence_sha256 <> p_completion_evidence_sha256
    and p_observed_payment_intent_status is null
    and p_observed_payment_intent_reference_sha256 is null
    and p_observed_amount_received_cents is null
    and p_observed_currency is null
    and p_observed_livemode is null
    and p_observed_capture_method is null
    and p_charge_reference_sha256 is null
  ), false) then
    raise exception 'Flight Consumer Live Stripe capture ambiguity evidence is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_capture_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.capture_binding_sha256 = p_capture_binding_sha256
     and attempt.capture_request_sha256 = p_capture_request_sha256
     and attempt.dispatch_token_sha256 = p_dispatch_token_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture completion binding is invalid';
  end if;

  if p_terminal_state = 'succeeded'
    and p_observed_amount_received_cents <> v_attempt.amount_cents then
    raise exception 'Flight Consumer Live Stripe capture amount mismatch';
  end if;
  if p_terminal_state = 'succeeded'
    and p_observed_payment_intent_reference_sha256 <>
      v_attempt.payment_intent_reference_sha256 then
    raise exception 'Flight Consumer Live Stripe capture observed PaymentIntent mismatch';
  end if;
  if p_charge_reference_sha256 is not null and (
    p_charge_reference_sha256 =
      v_attempt.payment_intent_reference_sha256
    or p_charge_reference_sha256 =
      v_attempt.provider_order_reference_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe capture charge binding is invalid';
  end if;

  if v_attempt.attempt_state = p_terminal_state
    and v_attempt.attempt_revision = 2
    and v_attempt.stripe_capture_request_count =
      p_stripe_capture_request_count
    and v_attempt.stripe_mutation_count = p_stripe_mutation_count
    and v_attempt.terminal_error_code is not distinct from
      p_terminal_error_code
    and v_attempt.terminal_http_status is not distinct from
      p_terminal_http_status
    and v_attempt.terminal_response_sha256 is not distinct from
      p_terminal_response_sha256
    and v_attempt.completion_evidence_sha256 =
      p_completion_evidence_sha256
    and v_attempt.ambiguity_evidence_sha256 is not distinct from
      p_ambiguity_evidence_sha256
    and v_attempt.observed_payment_intent_status is not distinct from
      p_observed_payment_intent_status
    and v_attempt.observed_payment_intent_reference_sha256 is not distinct from
      p_observed_payment_intent_reference_sha256
    and v_attempt.observed_amount_received_cents is not distinct from
      p_observed_amount_received_cents
    and v_attempt.observed_currency is not distinct from
      p_observed_currency
    and v_attempt.observed_livemode is not distinct from
      p_observed_livemode
    and v_attempt.observed_capture_method is not distinct from
      p_observed_capture_method
    and v_attempt.charge_reference_ciphertext is not distinct from
      p_charge_reference_ciphertext
    and v_attempt.charge_reference_sha256 is not distinct from
      p_charge_reference_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.provider_order_reference_sha256,
      v_attempt.charge_reference_sha256,
      v_attempt.stripe_capture_request_count,
      v_attempt.stripe_mutation_count,
      v_attempt.stripe_retrieval_request_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'dispatching'
    or v_attempt.attempt_revision <> p_expected_revision then
    raise exception 'Flight Consumer Live Stripe capture completion CAS refused';
  end if;

  -- The dispatch row lock can block behind the claim transaction. Stamp the
  -- terminal evidence only with trusted time observed after that lock/CAS.
  v_now := clock_timestamp();
  if v_attempt.dispatch_started_at is null
    or v_now < v_attempt.dispatch_started_at then
    raise exception 'Flight Consumer Live Stripe capture completion chronology refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-capture-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 2,
      'attempt_state', p_terminal_state,
      'charge_reference_sha256', p_charge_reference_sha256,
      'completion_evidence_sha256', p_completion_evidence_sha256,
      'observed_amount_received_cents',
        p_observed_amount_received_cents,
      'observed_payment_intent_status',
        p_observed_payment_intent_status,
      'observed_payment_intent_reference_sha256',
        p_observed_payment_intent_reference_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'stripe_capture_request_count', p_stripe_capture_request_count,
      'terminal_response_sha256', p_terminal_response_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_capture_attempts as attempt
     set attempt_state = p_terminal_state, attempt_revision = 2,
         stripe_capture_request_count = p_stripe_capture_request_count,
         stripe_mutation_count = p_stripe_mutation_count,
         external_capture_request_made =
           p_stripe_capture_request_count = 1,
         terminal_error_code = p_terminal_error_code,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         completion_evidence_sha256 = p_completion_evidence_sha256,
         ambiguity_evidence_sha256 = p_ambiguity_evidence_sha256,
         observed_payment_intent_status =
           p_observed_payment_intent_status,
         observed_payment_intent_reference_sha256 =
           p_observed_payment_intent_reference_sha256,
         observed_amount_received_cents =
           p_observed_amount_received_cents,
         observed_currency = p_observed_currency,
         observed_livemode = p_observed_livemode,
         observed_capture_method = p_observed_capture_method,
         charge_reference_ciphertext = p_charge_reference_ciphertext,
         charge_reference_sha256 = p_charge_reference_sha256,
         completed_at = v_now, updated_at = v_now,
         latest_state_receipt_sha256 = v_receipt
   where attempt.id = v_attempt.id
     and attempt.attempt_state = 'dispatching'
     and attempt.attempt_revision = p_expected_revision
  returning attempt.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture completion CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_capture_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, p_terminal_state, p_terminal_state,
    v_previous_receipt, v_receipt
  );

  return query select
    p_terminal_state, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.provider_order_reference_sha256,
    v_attempt.charge_reference_sha256,
    v_attempt.stripe_capture_request_count, v_attempt.stripe_mutation_count,
    v_attempt.stripe_retrieval_request_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.stripe_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$complete_flight_consumer_live_stripe_capture_v1$;

create function public.reconcile_flight_consumer_live_stripe_capture_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_capture_binding_sha256 text,
  p_dispatch_token_sha256 text,
  p_reconciliation_outcome text,
  p_stripe_retrieval_request_count integer,
  p_retrieval_response_sha256 text,
  p_reconciliation_evidence_sha256 text,
  p_observed_payment_intent_status text,
  p_observed_payment_intent_reference_sha256 text,
  p_observed_amount_received_cents bigint,
  p_observed_currency text,
  p_observed_livemode boolean,
  p_observed_capture_method text,
  p_charge_reference_ciphertext text,
  p_charge_reference_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
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
set search_path = pg_catalog, public, extensions
as $reconcile_flight_consumer_live_stripe_capture_v1$
declare
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe capture reconciliation is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 2
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_outcome not in ('succeeded', 'failed')
    or p_stripe_retrieval_request_count is distinct from 1
    or p_retrieval_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_retrieval_response_sha256 = p_reconciliation_evidence_sha256
    or (p_charge_reference_ciphertext is null) <>
      (p_charge_reference_sha256 is null)
    or (
      p_charge_reference_ciphertext is not null
      and (
        char_length(p_charge_reference_ciphertext) > 4096
        or p_charge_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_charge_reference_sha256 !~ '^[0-9a-f]{64}$'
      )
    ) then
    raise exception 'Flight Consumer Live Stripe capture reconciliation is invalid';
  end if;
  if p_reconciliation_outcome = 'succeeded' and not coalesce((
    p_observed_payment_intent_status = 'succeeded'
    and p_observed_payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
    and p_observed_amount_received_cents between 50 and 99999999
    and p_observed_currency = 'usd'
    and p_observed_livemode is true
    and p_observed_capture_method = 'manual'
    and p_charge_reference_ciphertext is not null
    and p_charge_reference_sha256 ~ '^[0-9a-f]{64}$'
  ), false) then
    raise exception 'Flight Consumer Live Stripe capture reconciliation success is invalid';
  elsif p_reconciliation_outcome = 'failed' and not coalesce((
    p_observed_payment_intent_status = 'requires_capture'
    and p_observed_payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
    and p_observed_amount_received_cents = 0
    and p_observed_currency = 'usd'
    and p_observed_livemode is true
    and p_observed_capture_method = 'manual'
    and p_charge_reference_sha256 is null
  ), false) then
    raise exception 'Flight Consumer Live Stripe capture reconciliation failure is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_capture_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.capture_binding_sha256 = p_capture_binding_sha256
     and attempt.dispatch_token_sha256 = p_dispatch_token_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture reconciliation binding is invalid';
  end if;
  if p_reconciliation_outcome = 'succeeded'
    and p_observed_amount_received_cents <> v_attempt.amount_cents then
    raise exception 'Flight Consumer Live Stripe capture reconciliation amount mismatch';
  end if;
  if p_observed_payment_intent_reference_sha256 <>
    v_attempt.payment_intent_reference_sha256 then
    raise exception 'Flight Consumer Live Stripe capture reconciliation observed PaymentIntent mismatch';
  end if;
  if p_charge_reference_sha256 is not null and (
    p_charge_reference_sha256 =
      v_attempt.payment_intent_reference_sha256
    or p_charge_reference_sha256 =
      v_attempt.provider_order_reference_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe capture reconciliation charge binding is invalid';
  end if;

  if v_attempt.attempt_state = 'reconciled'
    and v_attempt.attempt_revision = 3
    and v_attempt.reconciliation_outcome = p_reconciliation_outcome
    and v_attempt.stripe_retrieval_request_count =
      p_stripe_retrieval_request_count
    and v_attempt.retrieval_response_sha256 =
      p_retrieval_response_sha256
    and v_attempt.reconciliation_evidence_sha256 =
      p_reconciliation_evidence_sha256
    and v_attempt.observed_payment_intent_status is not distinct from
      p_observed_payment_intent_status
    and v_attempt.observed_payment_intent_reference_sha256 is not distinct from
      p_observed_payment_intent_reference_sha256
    and v_attempt.observed_amount_received_cents is not distinct from
      p_observed_amount_received_cents
    and v_attempt.observed_currency is not distinct from
      p_observed_currency
    and v_attempt.observed_livemode is not distinct from
      p_observed_livemode
    and v_attempt.observed_capture_method is not distinct from
      p_observed_capture_method
    and v_attempt.charge_reference_ciphertext is not distinct from
      p_charge_reference_ciphertext
    and v_attempt.charge_reference_sha256 is not distinct from
      p_charge_reference_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.payment_intent_reference_sha256,
      v_attempt.provider_order_reference_sha256,
      v_attempt.charge_reference_sha256,
      v_attempt.stripe_capture_request_count,
      v_attempt.stripe_mutation_count,
      v_attempt.stripe_retrieval_request_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.stripe_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'ambiguous'
    or v_attempt.attempt_revision <> p_expected_revision
    or v_attempt.stripe_capture_request_count <> 1
    or v_attempt.stripe_mutation_count <> 1
    or not v_attempt.external_capture_request_made then
    raise exception 'Flight Consumer Live Stripe capture reconciliation CAS refused';
  end if;

  -- Retrieval reconciliation can likewise wait on the terminal row lock.
  -- Refresh trusted time after the lock so revision 3 cannot predate revision 2.
  v_now := clock_timestamp();
  if v_attempt.completed_at is null or v_now < v_attempt.completed_at then
    raise exception 'Flight Consumer Live Stripe capture reconciliation chronology refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-live-capture-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 3,
      'attempt_state', 'reconciled',
      'charge_reference_sha256', p_charge_reference_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'reconciliation_evidence_sha256',
        p_reconciliation_evidence_sha256,
      'reconciliation_outcome', p_reconciliation_outcome,
      'retrieval_response_sha256', p_retrieval_response_sha256,
      'observed_payment_intent_reference_sha256',
        p_observed_payment_intent_reference_sha256,
      'stripe_capture_request_count',
        v_attempt.stripe_capture_request_count,
      'stripe_retrieval_request_count',
        p_stripe_retrieval_request_count
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_capture_attempts as attempt
     set attempt_state = 'reconciled', attempt_revision = 3,
         stripe_retrieval_request_count =
           p_stripe_retrieval_request_count,
         reconciliation_outcome = p_reconciliation_outcome,
         retrieval_response_sha256 = p_retrieval_response_sha256,
         reconciliation_evidence_sha256 =
           p_reconciliation_evidence_sha256,
         observed_payment_intent_status =
           p_observed_payment_intent_status,
         observed_payment_intent_reference_sha256 =
           p_observed_payment_intent_reference_sha256,
         observed_amount_received_cents =
           p_observed_amount_received_cents,
         observed_currency = p_observed_currency,
         observed_livemode = p_observed_livemode,
         observed_capture_method = p_observed_capture_method,
         charge_reference_ciphertext = p_charge_reference_ciphertext,
         charge_reference_sha256 = p_charge_reference_sha256,
         reconciled_at = v_now, updated_at = v_now,
         latest_state_receipt_sha256 = v_receipt
   where attempt.id = v_attempt.id
     and attempt.attempt_state = 'ambiguous'
     and attempt.attempt_revision = p_expected_revision
  returning attempt.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe capture reconciliation CAS refused';
  end if;

  insert into public.flight_consumer_live_stripe_capture_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 3, 'reconciled', 'reconciled',
    v_previous_receipt, v_receipt
  );

  return query select
    'reconciled'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.provider_order_reference_sha256,
    v_attempt.charge_reference_sha256,
    v_attempt.stripe_capture_request_count, v_attempt.stripe_mutation_count,
    v_attempt.stripe_retrieval_request_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.stripe_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$reconcile_flight_consumer_live_stripe_capture_v1$;

alter function public.protect_flight_consumer_live_stripe_capture_v1()
  owner to postgres;
alter function public.protect_flight_consumer_live_stripe_capture_receipt_v1()
  owner to postgres;
alter function public.prepare_flight_consumer_live_stripe_capture_v1(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, bigint, text, timestamptz, timestamptz
) owner to postgres;
alter function public.claim_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text
) owner to postgres;
alter function public.complete_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text
) owner to postgres;
alter function public.reconcile_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text, integer, text, text, text, text,
  bigint, text, boolean, text, text, text
) owner to postgres;

revoke all on function
  public.protect_flight_consumer_live_stripe_capture_v1()
from public, anon, authenticated, service_role;
revoke all on function
  public.protect_flight_consumer_live_stripe_capture_receipt_v1()
from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_live_stripe_capture_v1(
    uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, text, text, bigint, text, timestamptz,
    timestamptz
  )
from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text
  )
from public, anon, authenticated, service_role;
revoke all on function
  public.complete_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text
  )
from public, anon, authenticated, service_role;
revoke all on function
  public.reconcile_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, integer, text, text, text, text,
    bigint, text, boolean, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.prepare_flight_consumer_live_stripe_capture_v1(
    uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, text, text, bigint, text, timestamptz,
    timestamptz
  )
to service_role;
grant execute on function
  public.claim_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text
  )
to service_role;
grant execute on function
  public.complete_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text
  )
to service_role;
grant execute on function
  public.reconcile_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, integer, text, text, text, text,
    bigint, text, boolean, text, text, text
  )
to service_role;

comment on table public.flight_consumer_live_stripe_capture_attempts is
  'Immutable Production-dark evidence for one separately signed manual Stripe capture attempt after exact 109/110 authorization and exact successful 108 order evidence. No row grants authority.';
comment on function public.claim_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text
) is
  'Claims one immutable token but grants no dispatch or capture authority. A future adapter must independently verify the signed one-shot authority and recheck both deadlines immediately before its only capture mutation.';
comment on function public.reconcile_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text, integer, text, text, text, text,
  bigint, text, boolean, text, text, text
) is
  'Records retrieval-only recovery of one ambiguous capture. It never redispatches a capture mutation and grants no payment, capture, refund, settlement, order, ticket, servicing, or consumer-release authority.';

commit;
