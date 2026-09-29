begin;

-- Production-dark persistence only. This migration records immutable,
-- digest-bound evidence around one future consumer Stripe confirmation
-- handoff. It cannot call Stripe, disclose a client secret, accept or store a
-- payment method/card, capture/refund money, create a Duffel order, issue a
-- ticket, service a booking, or release a consumer path.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_stripe_payment_executions'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_execution_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_checkout_evidence_aggregates'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_checkout_evidence_receipts'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_stripe_payment_execution_v1(uuid,integer,text,text,text,text,text,text,boolean)'
    ) is null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_checkout_evidence_v1(uuid,uuid,text,text,text,text,uuid,text,text,text,text,uuid,text,uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,timestamp with time zone)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Stripe confirmation journal requires frozen 106/107 and SHA-256 prerequisites';
  end if;
end;
$migration$;

create table public.flight_consumer_live_stripe_confirmation_attempts (
  id uuid primary key default gen_random_uuid(),
  checkout_aggregate_id uuid not null unique references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  stripe_execution_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_payment_executions(id)
    on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique,
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_binding_sha256 text not null unique
    check (confirmation_binding_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_workflow_sha256 text not null unique
    check (confirmation_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_prerequisite_sha256 text not null
    check (confirmation_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_binding_sha256 text not null
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_state_receipt_sha256 text not null
    check (checkout_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_workflow_sha256 text not null
    check (stripe_execution_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_prerequisite_sha256 text not null
    check (stripe_execution_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_prepared_receipt_sha256 text not null
    check (stripe_execution_prepared_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_completed_receipt_sha256 text not null
    check (stripe_execution_completed_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_intent_reference_ciphertext text not null check (
    char_length(payment_intent_reference_ciphertext) <= 4096
    and payment_intent_reference_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
  ),
  payment_intent_reference_sha256 text not null unique
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),
  processor_environment text not null default 'stripe_live'
    check (processor_environment = 'stripe_live'),
  livemode boolean not null default true check (livemode),
  capture_method text not null default 'manual'
    check (capture_method = 'manual'),
  payment_method_type text not null default 'card'
    check (payment_method_type = 'card'),
  confirmation_not_after timestamptz not null,

  confirmation_state text not null default 'prepared' check (
    confirmation_state in (
      'prepared', 'handoff_claimed', 'authorized_requires_capture',
      'failed', 'ambiguous', 'reconciled'
    )
  ),
  confirmation_revision integer not null default 0
    check (confirmation_revision between 0 and 3),
  latest_state_receipt_sha256 text not null
    check (latest_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  handoff_token_sha256 text
    check (
      handoff_token_sha256 is null
      or handoff_token_sha256 ~ '^[0-9a-f]{64}$'
    ),
  handoff_seconds integer
    check (handoff_seconds is null or handoff_seconds between 15 and 300),
  handoff_expires_at timestamptz,
  confirmation_request_sha256 text
    check (
      confirmation_request_sha256 is null
      or confirmation_request_sha256 ~ '^[0-9a-f]{64}$'
    ),
  provider_response_sha256 text
    check (
      provider_response_sha256 is null
      or provider_response_sha256 ~ '^[0-9a-f]{64}$'
    ),
  confirmation_evidence_sha256 text
    check (
      confirmation_evidence_sha256 is null
      or confirmation_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  observed_payment_intent_status text check (
    observed_payment_intent_status is null
    or observed_payment_intent_status in (
      'requires_capture', 'requires_payment_method',
      'requires_confirmation', 'requires_action', 'canceled'
    )
  ),
  observed_amount_cents bigint check (
    observed_amount_cents is null
    or observed_amount_cents between 50 and 99999999
  ),
  observed_currency text check (
    observed_currency is null or observed_currency = 'usd'
  ),
  observed_livemode boolean,
  observed_payment_intent_reference_sha256 text check (
    observed_payment_intent_reference_sha256 is null
    or observed_payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  webhook_event_sha256 text
    check (
      webhook_event_sha256 is null
      or webhook_event_sha256 ~ '^[0-9a-f]{64}$'
    ),
  retrieval_evidence_sha256 text
    check (
      retrieval_evidence_sha256 is null
      or retrieval_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  failure_code text
    check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,96}$'),
  failure_evidence_sha256 text
    check (
      failure_evidence_sha256 is null
      or failure_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  ambiguity_code text
    check (ambiguity_code is null or ambiguity_code ~ '^[a-z0-9_]{1,96}$'),
  ambiguity_evidence_sha256 text
    check (
      ambiguity_evidence_sha256 is null
      or ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  reconciled_outcome text check (
    reconciled_outcome is null
    or reconciled_outcome in (
      'authorized_requires_capture', 'failed', 'unresolved'
    )
  ),
  reconciliation_evidence_sha256 text
    check (
      reconciliation_evidence_sha256 is null
      or reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),

  handoff_count integer not null default 0 check (handoff_count in (0, 1)),
  stripe_confirmation_request_count integer not null default 0
    check (stripe_confirmation_request_count in (0, 1)),
  external_request_made boolean not null default false,
  order_request_count integer not null default 0
    check (order_request_count = 0),
  capture_request_count integer not null default 0
    check (capture_request_count = 0),
  refund_request_count integer not null default 0
    check (refund_request_count = 0),
  ticket_request_count integer not null default 0
    check (ticket_request_count = 0),
  client_secret_stored boolean not null default false
    check (not client_secret_stored),
  raw_payment_method_stored boolean not null default false
    check (not raw_payment_method_stored),
  card_data_stored boolean not null default false
    check (not card_data_stored),
  raw_provider_payload_stored boolean not null default false
    check (not raw_provider_payload_stored),
  pii_stored boolean not null default false check (not pii_stored),
  confirmation_handoff_authorized boolean not null default false
    check (not confirmation_handoff_authorized),
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

  prepared_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  handoff_claimed_at timestamptz,
  terminal_at timestamptz,
  reconciled_at timestamptz,
  unique (execution_scope_sha256, idempotency_sha256),
  check (order_reference_sha256 <> customer_reference_sha256),
  check (
    stripe_confirmation_request_count = case
      when external_request_made then 1 else 0
    end
  ),
  check (confirmation_not_after > prepared_at),
  check (updated_at >= prepared_at),
  check (
    handoff_expires_at is null
    or handoff_expires_at > handoff_claimed_at
  ),
  check (
    (confirmation_state = 'prepared'
      and confirmation_revision = 0
      and handoff_count = 0
      and handoff_token_sha256 is null
      and handoff_seconds is null
      and handoff_expires_at is null
      and confirmation_request_sha256 is null
      and stripe_confirmation_request_count = 0
      and not external_request_made
      and provider_response_sha256 is null
      and confirmation_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_amount_cents is null
      and observed_currency is null
      and observed_livemode is null
      and observed_payment_intent_reference_sha256 is null
      and webhook_event_sha256 is null
      and retrieval_evidence_sha256 is null
      and failure_code is null and failure_evidence_sha256 is null
      and ambiguity_code is null and ambiguity_evidence_sha256 is null
      and reconciled_outcome is null
      and reconciliation_evidence_sha256 is null
      and handoff_claimed_at is null and terminal_at is null
      and reconciled_at is null)
    or
    (confirmation_state = 'handoff_claimed'
      and confirmation_revision = 1
      and handoff_count = 1
      and handoff_token_sha256 is not null
      and handoff_seconds is not null
      and handoff_expires_at is not null
      and confirmation_request_sha256 is not null
      and stripe_confirmation_request_count = 0
      and not external_request_made
      and provider_response_sha256 is null
      and confirmation_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_amount_cents is null
      and observed_currency is null
      and observed_livemode is null
      and observed_payment_intent_reference_sha256 is null
      and webhook_event_sha256 is null
      and retrieval_evidence_sha256 is null
      and failure_code is null and failure_evidence_sha256 is null
      and ambiguity_code is null and ambiguity_evidence_sha256 is null
      and reconciled_outcome is null
      and reconciliation_evidence_sha256 is null
      and handoff_claimed_at is not null and terminal_at is null
      and reconciled_at is null)
    or
    (confirmation_state = 'authorized_requires_capture'
      and confirmation_revision = 2
      and handoff_count = 1
      and stripe_confirmation_request_count = 1
      and external_request_made
      and provider_response_sha256 is not null
      and confirmation_evidence_sha256 is not null
      and observed_payment_intent_status = 'requires_capture'
      and observed_amount_cents = amount_cents
      and observed_currency = lower(currency)
      and observed_livemode
      and observed_payment_intent_reference_sha256 =
        payment_intent_reference_sha256
      and (webhook_event_sha256 is not null
        or retrieval_evidence_sha256 is not null)
      and failure_code is null and failure_evidence_sha256 is null
      and ambiguity_code is null and ambiguity_evidence_sha256 is null
      and reconciled_outcome is null
      and reconciliation_evidence_sha256 is null
      and handoff_claimed_at is not null and terminal_at is not null
      and reconciled_at is null)
    or
    (confirmation_state = 'failed'
      and confirmation_revision = 2
      and handoff_count = 1
      and stripe_confirmation_request_count = 1
      and external_request_made
      and provider_response_sha256 is not null
      and confirmation_evidence_sha256 is not null
      and observed_payment_intent_status in (
        'requires_payment_method', 'requires_confirmation',
        'requires_action', 'canceled'
      )
      and observed_amount_cents = amount_cents
      and observed_currency = lower(currency)
      and observed_livemode
      and observed_payment_intent_reference_sha256 =
        payment_intent_reference_sha256
      and failure_code is not null and failure_evidence_sha256 is not null
      and ambiguity_code is null and ambiguity_evidence_sha256 is null
      and reconciled_outcome is null
      and reconciliation_evidence_sha256 is null
      and handoff_claimed_at is not null and terminal_at is not null
      and reconciled_at is null)
    or
    (confirmation_state = 'ambiguous'
      and confirmation_revision = 2
      and handoff_count = 1
      and stripe_confirmation_request_count = 1
      and external_request_made
      and provider_response_sha256 is null
      and confirmation_evidence_sha256 is null
      and observed_payment_intent_status is null
      and observed_amount_cents is null
      and observed_currency is null
      and observed_livemode is null
      and observed_payment_intent_reference_sha256 is null
      and webhook_event_sha256 is null
      and retrieval_evidence_sha256 is null
      and failure_code is null and failure_evidence_sha256 is null
      and ambiguity_code is not null and ambiguity_evidence_sha256 is not null
      and reconciled_outcome is null
      and reconciliation_evidence_sha256 is null
      and handoff_claimed_at is not null and terminal_at is not null
      and reconciled_at is null)
    or
    (confirmation_state = 'reconciled'
      and confirmation_revision = 3
      and handoff_count = 1
      and stripe_confirmation_request_count = 1
      and external_request_made
      and ambiguity_code is not null and ambiguity_evidence_sha256 is not null
      and reconciled_outcome is not null
      and reconciliation_evidence_sha256 is not null
      and (webhook_event_sha256 is not null
        or retrieval_evidence_sha256 is not null)
      and handoff_claimed_at is not null and terminal_at is not null
      and reconciled_at is not null
      and (
        (reconciled_outcome = 'authorized_requires_capture'
          and provider_response_sha256 is not null
          and confirmation_evidence_sha256 is not null
          and observed_payment_intent_status = 'requires_capture'
          and observed_amount_cents = amount_cents
          and observed_currency = lower(currency)
          and observed_livemode
          and observed_payment_intent_reference_sha256 =
            payment_intent_reference_sha256
          and failure_code is null and failure_evidence_sha256 is null)
        or
        (reconciled_outcome = 'failed'
          and provider_response_sha256 is not null
          and confirmation_evidence_sha256 is not null
          and observed_payment_intent_status in (
            'requires_payment_method', 'requires_confirmation',
            'requires_action', 'canceled'
          )
          and observed_amount_cents = amount_cents
          and observed_currency = lower(currency)
          and observed_livemode
          and observed_payment_intent_reference_sha256 =
            payment_intent_reference_sha256
          and failure_code is not null
          and failure_evidence_sha256 is not null)
        or
        (reconciled_outcome = 'unresolved'
          and provider_response_sha256 is null
          and confirmation_evidence_sha256 is null
          and observed_payment_intent_status is null
          and observed_amount_cents is null
          and observed_currency is null
          and observed_livemode is null
          and observed_payment_intent_reference_sha256 is null
          and failure_code is null and failure_evidence_sha256 is null)
      ))
  )
);

create index flight_consumer_live_stripe_confirmation_state_idx
  on public.flight_consumer_live_stripe_confirmation_attempts (
    confirmation_state, handoff_expires_at, updated_at desc
  );

create table public.flight_consumer_live_stripe_confirmation_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_live_stripe_confirmation_attempts(id)
    on delete restrict,
  confirmation_revision integer not null
    check (confirmation_revision between 0 and 3),
  receipt_kind text not null check (receipt_kind in (
    'prepared', 'handoff_claimed', 'authorized_requires_capture',
    'failed', 'ambiguous', 'reconciled'
  )),
  confirmation_state text not null check (confirmation_state in (
    'prepared', 'handoff_claimed', 'authorized_requires_capture',
    'failed', 'ambiguous', 'reconciled'
  )),
  previous_receipt_sha256 text
    check (
      previous_receipt_sha256 is null
      or previous_receipt_sha256 ~ '^[0-9a-f]{64}$'
    ),
  receipt_sha256 text not null unique
    check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_handoff_authorized boolean not null default false
    check (not confirmation_handoff_authorized),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, confirmation_revision),
  check (
    (confirmation_revision = 0
      and receipt_kind = 'prepared'
      and confirmation_state = 'prepared'
      and previous_receipt_sha256 is null)
    or
    (confirmation_revision > 0
      and receipt_kind = confirmation_state
      and previous_receipt_sha256 is not null)
  )
);

alter table public.flight_consumer_live_stripe_confirmation_attempts
  enable row level security;
alter table public.flight_consumer_live_stripe_confirmation_attempts
  force row level security;
alter table public.flight_consumer_live_stripe_confirmation_receipts
  enable row level security;
alter table public.flight_consumer_live_stripe_confirmation_receipts
  force row level security;

revoke all on table
  public.flight_consumer_live_stripe_confirmation_attempts,
  public.flight_consumer_live_stripe_confirmation_receipts
  from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_stripe_confirmation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_confirmation_v1$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight Consumer Live Stripe confirmation evidence is append-preserving';
  end if;

  if row(
    new.id, new.checkout_aggregate_id, new.stripe_execution_attempt_id,
    new.customer_id, new.order_id, new.execution_scope_sha256,
    new.idempotency_sha256, new.confirmation_binding_sha256,
    new.confirmation_workflow_sha256,
    new.confirmation_prerequisite_sha256,
    new.checkout_binding_sha256, new.checkout_state_receipt_sha256,
    new.stripe_execution_workflow_sha256,
    new.stripe_execution_prerequisite_sha256,
    new.stripe_execution_prepared_receipt_sha256,
    new.stripe_execution_completed_receipt_sha256,
    new.payment_binding_sha256, new.order_reference_sha256,
    new.customer_reference_sha256,
    new.payment_intent_reference_ciphertext,
    new.payment_intent_reference_sha256,
    new.amount_cents, new.currency, new.processor_environment,
    new.livemode, new.capture_method, new.payment_method_type,
    new.confirmation_not_after,
    new.order_request_count, new.capture_request_count,
    new.refund_request_count, new.ticket_request_count,
    new.client_secret_stored, new.raw_payment_method_stored,
    new.card_data_stored, new.raw_provider_payload_stored, new.pii_stored,
    new.confirmation_handoff_authorized,
    new.provider_dispatch_authorized, new.stripe_dispatch_authorized,
    new.booking_authorized, new.order_authorized, new.payment_authorized,
    new.capture_authorized, new.refund_authorized,
    new.settlement_authorized, new.ticketing_authorized,
    new.servicing_authorized, new.consumer_release_enabled,
    new.blind_retry_authorized, new.prepared_at
  ) is distinct from row(
    old.id, old.checkout_aggregate_id, old.stripe_execution_attempt_id,
    old.customer_id, old.order_id, old.execution_scope_sha256,
    old.idempotency_sha256, old.confirmation_binding_sha256,
    old.confirmation_workflow_sha256,
    old.confirmation_prerequisite_sha256,
    old.checkout_binding_sha256, old.checkout_state_receipt_sha256,
    old.stripe_execution_workflow_sha256,
    old.stripe_execution_prerequisite_sha256,
    old.stripe_execution_prepared_receipt_sha256,
    old.stripe_execution_completed_receipt_sha256,
    old.payment_binding_sha256, old.order_reference_sha256,
    old.customer_reference_sha256,
    old.payment_intent_reference_ciphertext,
    old.payment_intent_reference_sha256,
    old.amount_cents, old.currency, old.processor_environment,
    old.livemode, old.capture_method, old.payment_method_type,
    old.confirmation_not_after,
    old.order_request_count, old.capture_request_count,
    old.refund_request_count, old.ticket_request_count,
    old.client_secret_stored, old.raw_payment_method_stored,
    old.card_data_stored, old.raw_provider_payload_stored, old.pii_stored,
    old.confirmation_handoff_authorized,
    old.provider_dispatch_authorized, old.stripe_dispatch_authorized,
    old.booking_authorized, old.order_authorized, old.payment_authorized,
    old.capture_authorized, old.refund_authorized,
    old.settlement_authorized, old.ticketing_authorized,
    old.servicing_authorized, old.consumer_release_enabled,
    old.blind_retry_authorized, old.prepared_at
  ) then
    raise exception 'Flight Consumer Live Stripe confirmation identity is immutable';
  end if;

  if new.confirmation_revision <> old.confirmation_revision + 1
    or not (
      (old.confirmation_state = 'prepared'
        and new.confirmation_state = 'handoff_claimed')
      or
      (old.confirmation_state = 'handoff_claimed'
        and new.confirmation_state in (
          'authorized_requires_capture', 'failed', 'ambiguous'
        ))
      or
      (old.confirmation_state = 'ambiguous'
        and new.confirmation_state = 'reconciled')
    ) then
    raise exception 'Flight Consumer Live Stripe confirmation transition is invalid';
  end if;
  return new;
end;
$protect_flight_consumer_live_stripe_confirmation_v1$;

create trigger flight_consumer_live_stripe_confirmation_guard
before update or delete
on public.flight_consumer_live_stripe_confirmation_attempts
for each row execute function
  public.protect_flight_consumer_live_stripe_confirmation_v1();

create function public.protect_flight_consumer_live_stripe_confirmation_receipt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_stripe_confirmation_receipt_v1$
begin
  raise exception 'Flight Consumer Live Stripe confirmation receipts are append-only';
end;
$protect_flight_consumer_live_stripe_confirmation_receipt_v1$;

create trigger flight_consumer_live_stripe_confirmation_receipt_guard
before update or delete
on public.flight_consumer_live_stripe_confirmation_receipts
for each row execute function
  public.protect_flight_consumer_live_stripe_confirmation_receipt_v1();

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
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_live_stripe_confirmation_v1$
declare
  v_checkout public.flight_consumer_live_checkout_evidence_aggregates;
  v_execution public.flight_consumer_live_stripe_payment_executions;
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_match_count bigint;
  v_exact_match boolean;
  v_receipt_count bigint;
  v_now timestamptz := clock_timestamp();
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe confirmation preparation is service-role only';
  end if;
  if p_checkout_aggregate_id is null
    or p_stripe_execution_attempt_id is null
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 is null
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_workflow_sha256 is null
    or p_confirmation_workflow_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_prerequisite_sha256 is null
    or p_confirmation_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_state_receipt_sha256 is null
    or p_checkout_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_execution_completed_receipt_sha256 is null
    or p_stripe_execution_completed_receipt_sha256
      !~ '^[0-9a-f]{64}$'
    or p_confirmation_not_after is null
    or p_confirmation_not_after <= v_now
    or p_confirmation_not_after > v_now + interval '10 minutes' then
    raise exception 'Flight Consumer Live Stripe confirmation envelope is invalid';
  end if;
  if (select count(distinct value) from unnest(array[
      p_execution_scope_sha256, p_idempotency_sha256,
      p_confirmation_binding_sha256, p_confirmation_workflow_sha256,
      p_confirmation_prerequisite_sha256,
      p_checkout_state_receipt_sha256,
      p_stripe_execution_completed_receipt_sha256
    ]) as digest_value(value)) <> 7 then
    raise exception 'Flight Consumer Live Stripe confirmation digest domains collide';
  end if;

  -- Resolve exact replay before consulting mutable source state. A terminal
  -- confirmation journal stays replayable, but any changed identity collides.
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
      raise exception 'Flight Consumer Live Stripe confirmation replay collision';
    end if;
    select candidate.* into v_attempt
      from public.flight_consumer_live_stripe_confirmation_attempts as candidate
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

  select aggregate.* into v_checkout
    from public.flight_consumer_live_checkout_evidence_aggregates as aggregate
   where aggregate.id = p_checkout_aggregate_id
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation checkout prerequisite is missing';
  end if;
  select execution.* into v_execution
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_stripe_execution_attempt_id
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation execution prerequisite is missing';
  end if;

  select count(*) into v_receipt_count
    from public.flight_consumer_live_checkout_evidence_receipts as checkout_receipt
    join public.flight_consumer_live_stripe_payment_execution_receipts
      as prepared_receipt
      on prepared_receipt.attempt_id = v_execution.id
     and prepared_receipt.attempt_revision = 0
     and prepared_receipt.receipt_kind = 'prepared'
     and prepared_receipt.attempt_state = 'prepared'
     and prepared_receipt.receipt_sha256 =
       v_checkout.stripe_execution_state_receipt_sha256
    join public.flight_consumer_live_stripe_payment_execution_receipts
      as completed_receipt
      on completed_receipt.attempt_id = v_execution.id
     and completed_receipt.attempt_revision = 2
     and completed_receipt.receipt_kind = 'completed'
     and completed_receipt.attempt_state = 'completed'
     and completed_receipt.receipt_sha256 =
       p_stripe_execution_completed_receipt_sha256
   where checkout_receipt.aggregate_id = v_checkout.id
     and checkout_receipt.checkout_revision = 0
     and checkout_receipt.receipt_kind = 'prepared'
     and checkout_receipt.checkout_state = 'prepared'
     and checkout_receipt.receipt_sha256 =
       p_checkout_state_receipt_sha256;

  if v_receipt_count is distinct from 1
    or v_checkout.checkout_state <> 'prepared'
    or v_checkout.checkout_revision <> 0
    or v_checkout.latest_state_receipt_sha256 is distinct from
      p_checkout_state_receipt_sha256
    or v_checkout.offer_expires_at <= v_now
    or p_confirmation_not_after > v_checkout.offer_expires_at
    or v_checkout.stripe_execution_attempt_id <> v_execution.id
    or v_checkout.stripe_plan_id <> v_execution.plan_id
    or v_checkout.stripe_execution_workflow_sha256 <>
      v_execution.execution_workflow_sha256
    or v_checkout.stripe_execution_prerequisite_sha256 <>
      v_execution.execution_prerequisite_sha256
    or v_checkout.payment_binding_sha256 <>
      v_execution.payment_binding_sha256
    or v_checkout.order_reference_sha256 <>
      v_execution.order_reference_sha256
    or v_checkout.customer_reference_sha256 <>
      v_execution.customer_reference_sha256
    or v_checkout.amount_cents <> v_execution.amount_cents
    or lower(v_checkout.currency) <> v_execution.currency
    or v_execution.attempt_state <> 'completed'
    or v_execution.attempt_revision <> 2
    or v_execution.latest_state_receipt_sha256 <>
      p_stripe_execution_completed_receipt_sha256
    or v_execution.processor_environment <> 'stripe_live'
    or not v_execution.livemode
    or v_execution.capture_method <> 'manual'
    or v_execution.confirmation_method <> 'automatic'
    or v_execution.payment_method_type <> 'card'
    or v_execution.payment_intent_reference_ciphertext is null
    or v_execution.payment_intent_reference_sha256 is null
    or v_execution.terminal_response_sha256 is null
    or v_execution.completion_evidence_sha256 is null
    or v_execution.stripe_request_count <> 1
    or v_execution.stripe_mutation_count <> 1
    or v_execution.payment_intent_create_count <> 1
    or not v_execution.external_request_made
    or v_execution.payment_authorized
    or v_execution.order_authorized
    or v_execution.capture_authorized
    or v_execution.refund_authorized
    or v_execution.settlement_authorized
    or v_execution.ticketing_authorized
    or v_execution.servicing_authorized
    or v_execution.consumer_release_enabled
    or v_execution.blind_retry_authorized
    or v_checkout.provider_dispatch_authorized
    or v_checkout.stripe_dispatch_authorized
    or v_checkout.booking_authorized
    or v_checkout.order_authorized
    or v_checkout.payment_authorized
    or v_checkout.capture_authorized
    or v_checkout.refund_authorized
    or v_checkout.settlement_authorized
    or v_checkout.ticketing_authorized
    or v_checkout.servicing_authorized
    or v_checkout.consumer_release_enabled then
    raise exception 'Flight Consumer Live Stripe confirmation prerequisite changed';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-confirmation-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'checkout_aggregate_id', v_checkout.id,
      'confirmation_binding_sha256', p_confirmation_binding_sha256,
      'confirmation_revision', 0,
      'confirmation_state', 'prepared',
      'execution_scope_sha256', p_execution_scope_sha256,
      'payment_intent_reference_sha256',
        v_execution.payment_intent_reference_sha256,
      'stripe_execution_attempt_id', v_execution.id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_stripe_confirmation_attempts (
    checkout_aggregate_id, stripe_execution_attempt_id,
    customer_id, order_id, execution_scope_sha256, idempotency_sha256,
    confirmation_binding_sha256, confirmation_workflow_sha256,
    confirmation_prerequisite_sha256, checkout_binding_sha256,
    checkout_state_receipt_sha256,
    stripe_execution_workflow_sha256,
    stripe_execution_prerequisite_sha256,
    stripe_execution_prepared_receipt_sha256,
    stripe_execution_completed_receipt_sha256,
    payment_binding_sha256, order_reference_sha256,
    customer_reference_sha256, payment_intent_reference_ciphertext,
    payment_intent_reference_sha256, amount_cents, currency,
    confirmation_not_after, latest_state_receipt_sha256
  ) values (
    v_checkout.id, v_execution.id, v_checkout.customer_id,
    v_checkout.order_id, p_execution_scope_sha256,
    p_idempotency_sha256, p_confirmation_binding_sha256,
    p_confirmation_workflow_sha256, p_confirmation_prerequisite_sha256,
    v_checkout.checkout_binding_sha256,
    p_checkout_state_receipt_sha256,
    v_execution.execution_workflow_sha256,
    v_execution.execution_prerequisite_sha256,
    v_checkout.stripe_execution_state_receipt_sha256,
    p_stripe_execution_completed_receipt_sha256,
    v_checkout.payment_binding_sha256,
    v_checkout.order_reference_sha256,
    v_checkout.customer_reference_sha256,
    v_execution.payment_intent_reference_ciphertext,
    v_execution.payment_intent_reference_sha256,
    v_checkout.amount_cents, v_checkout.currency,
    p_confirmation_not_after, v_receipt
  ) returning * into v_attempt;

  insert into public.flight_consumer_live_stripe_confirmation_receipts (
    attempt_id, confirmation_revision, receipt_kind,
    confirmation_state, previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 0, 'prepared', 'prepared', null, v_receipt
  );

  return query select
    'created'::text, v_attempt.id, v_attempt.confirmation_state,
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
exception
  when unique_violation then
    raise exception 'Flight Consumer Live Stripe confirmation replay collision';
end;
$prepare_flight_consumer_live_stripe_confirmation_v1$;

create function public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_confirmation_binding_sha256 text,
  p_handoff_token_sha256 text,
  p_handoff_seconds integer,
  p_confirmation_request_sha256 text
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
set search_path = pg_catalog, public, extensions
as $claim_flight_consumer_live_stripe_confirmation_handoff_v1$
declare
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_now timestamptz := clock_timestamp();
  v_handoff_expires_at timestamptz;
  v_previous_receipt text;
  v_receipt text;
  v_prerequisite_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe confirmation handoff is service-role only';
  end if;
  if p_attempt_id is null or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 is null
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_handoff_token_sha256 is null
    or p_handoff_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_handoff_seconds is null
    or p_handoff_seconds not between 15 and 300
    or p_confirmation_request_sha256 is null
    or p_confirmation_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_handoff_token_sha256 = p_confirmation_request_sha256 then
    raise exception 'Flight Consumer Live Stripe confirmation handoff is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_confirmation_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.confirmation_binding_sha256 =
       p_confirmation_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation handoff binding is invalid';
  end if;

  if v_attempt.handoff_count = 1 then
    if v_attempt.handoff_token_sha256 <> p_handoff_token_sha256
      or v_attempt.handoff_seconds <> p_handoff_seconds
      or v_attempt.confirmation_request_sha256 <>
        p_confirmation_request_sha256 then
      raise exception 'Flight Consumer Live Stripe confirmation handoff replay collision';
    end if;
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

  if v_attempt.confirmation_state <> 'prepared'
    or v_attempt.confirmation_revision <> p_expected_revision
    or v_now >= v_attempt.confirmation_not_after then
    raise exception 'Flight Consumer Live Stripe confirmation handoff CAS failed';
  end if;
  v_handoff_expires_at := least(
    v_now + make_interval(secs => p_handoff_seconds),
    v_attempt.confirmation_not_after
  );
  if v_handoff_expires_at <= v_now then
    raise exception 'Flight Consumer Live Stripe confirmation handoff window expired';
  end if;

  select count(*) into v_prerequisite_count
    from public.flight_consumer_live_checkout_evidence_aggregates as checkout
    join public.flight_consumer_live_stripe_payment_executions as execution
      on execution.id = checkout.stripe_execution_attempt_id
   where checkout.id = v_attempt.checkout_aggregate_id
     and checkout.checkout_state = 'prepared'
     and checkout.checkout_revision = 0
     and checkout.latest_state_receipt_sha256 =
       v_attempt.checkout_state_receipt_sha256
     and checkout.checkout_binding_sha256 =
       v_attempt.checkout_binding_sha256
     and checkout.customer_id = v_attempt.customer_id
     and checkout.order_id = v_attempt.order_id
     and checkout.offer_expires_at > v_now
     and execution.id = v_attempt.stripe_execution_attempt_id
     and execution.attempt_state = 'completed'
     and execution.attempt_revision = 2
     and execution.latest_state_receipt_sha256 =
       v_attempt.stripe_execution_completed_receipt_sha256
     and execution.payment_intent_reference_sha256 =
       v_attempt.payment_intent_reference_sha256
     and execution.payment_intent_reference_ciphertext =
       v_attempt.payment_intent_reference_ciphertext
     and execution.amount_cents = v_attempt.amount_cents
     and upper(execution.currency) = v_attempt.currency
     and execution.payment_binding_sha256 =
       v_attempt.payment_binding_sha256
     and execution.order_reference_sha256 =
       v_attempt.order_reference_sha256
     and execution.customer_reference_sha256 =
       v_attempt.customer_reference_sha256;
  if v_prerequisite_count is distinct from 1 then
    raise exception 'Flight Consumer Live Stripe confirmation handoff prerequisite changed';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-confirmation-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'confirmation_binding_sha256', v_attempt.confirmation_binding_sha256,
      'confirmation_request_sha256', p_confirmation_request_sha256,
      'confirmation_revision', 1,
      'confirmation_state', 'handoff_claimed',
      'handoff_expires_at', v_handoff_expires_at,
      'handoff_token_sha256', p_handoff_token_sha256,
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_confirmation_attempts as target
     set confirmation_state = 'handoff_claimed',
         confirmation_revision = 1,
         handoff_count = 1,
         handoff_token_sha256 = p_handoff_token_sha256,
         handoff_seconds = p_handoff_seconds,
         handoff_expires_at = v_handoff_expires_at,
         confirmation_request_sha256 = p_confirmation_request_sha256,
         latest_state_receipt_sha256 = v_receipt,
         handoff_claimed_at = v_now,
         updated_at = v_now
   where target.id = v_attempt.id
     and target.confirmation_state = 'prepared'
     and target.confirmation_revision = p_expected_revision
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation handoff CAS failed';
  end if;

  insert into public.flight_consumer_live_stripe_confirmation_receipts (
    attempt_id, confirmation_revision, receipt_kind,
    confirmation_state, previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 1, 'handoff_claimed', 'handoff_claimed',
    v_previous_receipt, v_receipt
  );

  return query select
    'claimed'::text, v_attempt.id, v_attempt.confirmation_state,
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
end;
$claim_flight_consumer_live_stripe_confirmation_handoff_v1$;

create function public.record_flight_consumer_live_stripe_confirmation_terminal_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_confirmation_binding_sha256 text,
  p_handoff_token_sha256 text,
  p_terminal_state text,
  p_observed_payment_intent_status text,
  p_observed_amount_cents bigint,
  p_observed_currency text,
  p_observed_livemode boolean,
  p_observed_payment_intent_reference_sha256 text,
  p_provider_response_sha256 text,
  p_confirmation_evidence_sha256 text,
  p_webhook_event_sha256 text,
  p_retrieval_evidence_sha256 text,
  p_failure_code text,
  p_failure_evidence_sha256 text,
  p_livemode boolean
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
set search_path = pg_catalog, public, extensions
as $record_flight_consumer_live_stripe_confirmation_terminal_v1$
declare
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_now timestamptz := clock_timestamp();
  v_previous_receipt text;
  v_receipt text;
  v_digest_count bigint;
  v_distinct_digest_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe confirmation terminal evidence is service-role only';
  end if;
  if p_attempt_id is null or p_expected_revision is distinct from 1
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 is null
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_handoff_token_sha256 is null
    or p_handoff_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_state is null
    or p_terminal_state not in ('authorized_requires_capture', 'failed')
    or p_observed_payment_intent_status is null
    or p_observed_amount_cents is null
    or p_observed_amount_cents not between 50 and 99999999
    or p_observed_currency is distinct from 'usd'
    or p_observed_livemode is distinct from true
    or p_observed_payment_intent_reference_sha256 is null
    or p_observed_payment_intent_reference_sha256
      !~ '^[0-9a-f]{64}$'
    or p_provider_response_sha256 is null
    or p_provider_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_evidence_sha256 is null
    or p_confirmation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (p_webhook_event_sha256 is not null
      and p_webhook_event_sha256 !~ '^[0-9a-f]{64}$')
    or (p_retrieval_evidence_sha256 is not null
      and p_retrieval_evidence_sha256 !~ '^[0-9a-f]{64}$')
    or (p_failure_evidence_sha256 is not null
      and p_failure_evidence_sha256 !~ '^[0-9a-f]{64}$')
    or p_livemode is distinct from true
    or (p_terminal_state = 'authorized_requires_capture' and (
      p_observed_payment_intent_status is distinct from 'requires_capture'
      or p_observed_amount_cents is null
      or p_observed_payment_intent_reference_sha256 is null
      or
      p_webhook_event_sha256 is null
        and p_retrieval_evidence_sha256 is null
      or p_failure_code is not null
      or p_failure_evidence_sha256 is not null
    ))
    or (p_terminal_state = 'failed' and (
      p_observed_payment_intent_status is null
      or p_observed_payment_intent_status not in (
        'requires_payment_method', 'requires_confirmation',
        'requires_action', 'canceled'
      )
      or p_failure_code is null
      or p_failure_code !~ '^[a-z0-9_]{1,96}$'
      or p_failure_evidence_sha256 is null
    )) then
    raise exception 'Flight Consumer Live Stripe confirmation terminal evidence is invalid';
  end if;

  select count(value), count(distinct value)
    into v_digest_count, v_distinct_digest_count
    from unnest(array[
      p_provider_response_sha256, p_confirmation_evidence_sha256,
      p_webhook_event_sha256, p_retrieval_evidence_sha256,
      p_failure_evidence_sha256
    ]) as digest_value(value)
   where value is not null;
  if v_digest_count <> v_distinct_digest_count then
    raise exception 'Flight Consumer Live Stripe confirmation terminal evidence digests collide';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_confirmation_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.confirmation_binding_sha256 =
       p_confirmation_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation terminal binding is invalid';
  end if;

  if p_observed_amount_cents <> v_attempt.amount_cents
    or p_observed_currency <> lower(v_attempt.currency)
    or p_observed_payment_intent_reference_sha256 <>
      v_attempt.payment_intent_reference_sha256 then
    raise exception 'Flight Consumer Live Stripe confirmation provider facts do not match the frozen payment';
  end if;

  if v_attempt.confirmation_state = p_terminal_state
    and v_attempt.confirmation_revision = 2 then
    if v_attempt.handoff_token_sha256 <> p_handoff_token_sha256
      or v_attempt.provider_response_sha256 <>
        p_provider_response_sha256
      or v_attempt.observed_payment_intent_status <>
        p_observed_payment_intent_status
      or v_attempt.observed_amount_cents <> p_observed_amount_cents
      or v_attempt.observed_currency <> p_observed_currency
      or v_attempt.observed_livemode is distinct from p_observed_livemode
      or v_attempt.observed_payment_intent_reference_sha256 <>
        p_observed_payment_intent_reference_sha256
      or v_attempt.confirmation_evidence_sha256 <>
        p_confirmation_evidence_sha256
      or v_attempt.webhook_event_sha256
        is distinct from p_webhook_event_sha256
      or v_attempt.retrieval_evidence_sha256
        is distinct from p_retrieval_evidence_sha256
      or v_attempt.failure_code is distinct from p_failure_code
      or v_attempt.failure_evidence_sha256
        is distinct from p_failure_evidence_sha256 then
      raise exception 'Flight Consumer Live Stripe confirmation terminal replay collision';
    end if;
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

  if v_attempt.confirmation_state <> 'handoff_claimed'
    or v_attempt.confirmation_revision <> p_expected_revision
    or v_attempt.handoff_token_sha256 <> p_handoff_token_sha256
    or v_now > v_attempt.handoff_expires_at then
    raise exception 'Flight Consumer Live Stripe confirmation terminal CAS failed';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-confirmation-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'confirmation_binding_sha256', v_attempt.confirmation_binding_sha256,
      'confirmation_evidence_sha256', p_confirmation_evidence_sha256,
      'confirmation_revision', 2,
      'confirmation_state', p_terminal_state,
      'failure_code', p_failure_code,
      'failure_evidence_sha256', p_failure_evidence_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'observed_amount_cents', p_observed_amount_cents,
      'observed_currency', p_observed_currency,
      'observed_livemode', p_observed_livemode,
      'observed_payment_intent_reference_sha256',
        p_observed_payment_intent_reference_sha256,
      'observed_payment_intent_status',
        p_observed_payment_intent_status,
      'provider_response_sha256', p_provider_response_sha256,
      'retrieval_evidence_sha256', p_retrieval_evidence_sha256,
      'webhook_event_sha256', p_webhook_event_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_confirmation_attempts as target
     set confirmation_state = p_terminal_state,
         confirmation_revision = 2,
         provider_response_sha256 = p_provider_response_sha256,
         confirmation_evidence_sha256 = p_confirmation_evidence_sha256,
         observed_payment_intent_status =
           p_observed_payment_intent_status,
         observed_amount_cents = p_observed_amount_cents,
         observed_currency = p_observed_currency,
         observed_livemode = p_observed_livemode,
         observed_payment_intent_reference_sha256 =
           p_observed_payment_intent_reference_sha256,
         webhook_event_sha256 = p_webhook_event_sha256,
         retrieval_evidence_sha256 = p_retrieval_evidence_sha256,
         failure_code = p_failure_code,
         failure_evidence_sha256 = p_failure_evidence_sha256,
         stripe_confirmation_request_count = 1,
         external_request_made = true,
         latest_state_receipt_sha256 = v_receipt,
         terminal_at = v_now,
         updated_at = v_now
   where target.id = v_attempt.id
     and target.confirmation_state = 'handoff_claimed'
     and target.confirmation_revision = p_expected_revision
     and target.handoff_token_sha256 = p_handoff_token_sha256
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation terminal CAS failed';
  end if;

  insert into public.flight_consumer_live_stripe_confirmation_receipts (
    attempt_id, confirmation_revision, receipt_kind,
    confirmation_state, previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, p_terminal_state, p_terminal_state,
    v_previous_receipt, v_receipt
  );

  return query select
    'recorded'::text, v_attempt.id, v_attempt.confirmation_state,
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
end;
$record_flight_consumer_live_stripe_confirmation_terminal_v1$;

create function public.mark_flight_consumer_live_stripe_confirmation_ambiguous_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_confirmation_binding_sha256 text,
  p_handoff_token_sha256 text,
  p_ambiguity_code text,
  p_ambiguity_evidence_sha256 text,
  p_livemode boolean
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
set search_path = pg_catalog, public, extensions
as $mark_flight_consumer_live_stripe_confirmation_ambiguous_v1$
declare
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_now timestamptz := clock_timestamp();
  v_previous_receipt text;
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe confirmation ambiguity is service-role only';
  end if;
  if p_attempt_id is null or p_expected_revision is distinct from 1
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 is null
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_handoff_token_sha256 is null
    or p_handoff_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_ambiguity_code is null
    or p_ambiguity_code !~ '^[a-z0-9_]{1,96}$'
    or p_ambiguity_evidence_sha256 is null
    or p_ambiguity_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_livemode is distinct from true then
    raise exception 'Flight Consumer Live Stripe confirmation ambiguity is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_confirmation_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.confirmation_binding_sha256 =
       p_confirmation_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation ambiguity binding is invalid';
  end if;

  if v_attempt.confirmation_state = 'ambiguous'
    and v_attempt.confirmation_revision = 2 then
    if v_attempt.handoff_token_sha256 <> p_handoff_token_sha256
      or v_attempt.ambiguity_code <> p_ambiguity_code
      or v_attempt.ambiguity_evidence_sha256 <>
        p_ambiguity_evidence_sha256 then
      raise exception 'Flight Consumer Live Stripe confirmation ambiguity replay collision';
    end if;
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
  if v_attempt.confirmation_state <> 'handoff_claimed'
    or v_attempt.confirmation_revision <> p_expected_revision
    or v_attempt.handoff_token_sha256 <> p_handoff_token_sha256 then
    raise exception 'Flight Consumer Live Stripe confirmation ambiguity CAS failed';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-confirmation-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'ambiguity_code', p_ambiguity_code,
      'ambiguity_evidence_sha256', p_ambiguity_evidence_sha256,
      'attempt_id', v_attempt.id,
      'confirmation_binding_sha256', v_attempt.confirmation_binding_sha256,
      'confirmation_revision', 2,
      'confirmation_state', 'ambiguous',
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_confirmation_attempts as target
     set confirmation_state = 'ambiguous',
         confirmation_revision = 2,
         ambiguity_code = p_ambiguity_code,
         ambiguity_evidence_sha256 = p_ambiguity_evidence_sha256,
         stripe_confirmation_request_count = 1,
         external_request_made = true,
         latest_state_receipt_sha256 = v_receipt,
         terminal_at = v_now,
         updated_at = v_now
   where target.id = v_attempt.id
     and target.confirmation_state = 'handoff_claimed'
     and target.confirmation_revision = p_expected_revision
     and target.handoff_token_sha256 = p_handoff_token_sha256
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation ambiguity CAS failed';
  end if;

  insert into public.flight_consumer_live_stripe_confirmation_receipts (
    attempt_id, confirmation_revision, receipt_kind,
    confirmation_state, previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, 'ambiguous', 'ambiguous',
    v_previous_receipt, v_receipt
  );

  return query select
    'ambiguous'::text, v_attempt.id, v_attempt.confirmation_state,
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
end;
$mark_flight_consumer_live_stripe_confirmation_ambiguous_v1$;

create function public.reconcile_flight_consumer_live_stripe_confirmation_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_confirmation_binding_sha256 text,
  p_reconciled_outcome text,
  p_observed_payment_intent_status text,
  p_observed_amount_cents bigint,
  p_observed_currency text,
  p_observed_livemode boolean,
  p_observed_payment_intent_reference_sha256 text,
  p_provider_response_sha256 text,
  p_confirmation_evidence_sha256 text,
  p_webhook_event_sha256 text,
  p_retrieval_evidence_sha256 text,
  p_failure_code text,
  p_failure_evidence_sha256 text,
  p_reconciliation_evidence_sha256 text,
  p_livemode boolean
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
set search_path = pg_catalog, public, extensions
as $reconcile_flight_consumer_live_stripe_confirmation_v1$
declare
  v_attempt public.flight_consumer_live_stripe_confirmation_attempts;
  v_now timestamptz := clock_timestamp();
  v_previous_receipt text;
  v_receipt text;
  v_digest_count bigint;
  v_distinct_digest_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation is service-role only';
  end if;
  if p_attempt_id is null or p_expected_revision is distinct from 2
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_confirmation_binding_sha256 is null
    or p_confirmation_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciled_outcome is null
    or p_reconciled_outcome not in (
      'authorized_requires_capture', 'failed', 'unresolved'
    )
    or (p_provider_response_sha256 is not null
      and p_provider_response_sha256 !~ '^[0-9a-f]{64}$')
    or (p_confirmation_evidence_sha256 is not null
      and p_confirmation_evidence_sha256 !~ '^[0-9a-f]{64}$')
    or (p_webhook_event_sha256 is not null
      and p_webhook_event_sha256 !~ '^[0-9a-f]{64}$')
    or (p_retrieval_evidence_sha256 is not null
      and p_retrieval_evidence_sha256 !~ '^[0-9a-f]{64}$')
    or (p_failure_evidence_sha256 is not null
      and p_failure_evidence_sha256 !~ '^[0-9a-f]{64}$')
    or p_reconciliation_evidence_sha256 is null
    or p_reconciliation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (p_webhook_event_sha256 is null
      and p_retrieval_evidence_sha256 is null)
    or p_livemode is distinct from true
    or (p_reconciled_outcome = 'authorized_requires_capture' and (
      p_observed_payment_intent_status is distinct from 'requires_capture'
      or p_observed_amount_cents is null
      or p_observed_currency is distinct from 'usd'
      or p_observed_livemode is distinct from true
      or p_observed_payment_intent_reference_sha256 is null
      or p_observed_payment_intent_reference_sha256
        !~ '^[0-9a-f]{64}$'
      or
      p_provider_response_sha256 is null
      or p_confirmation_evidence_sha256 is null
      or p_failure_code is not null
      or p_failure_evidence_sha256 is not null
    ))
    or (p_reconciled_outcome = 'failed' and (
      p_observed_payment_intent_status is null
      or p_observed_payment_intent_status not in (
        'requires_payment_method', 'requires_confirmation',
        'requires_action', 'canceled'
      )
      or p_observed_amount_cents is null
      or p_observed_currency is distinct from 'usd'
      or p_observed_livemode is distinct from true
      or p_observed_payment_intent_reference_sha256 is null
      or p_observed_payment_intent_reference_sha256
        !~ '^[0-9a-f]{64}$'
      or
      p_provider_response_sha256 is null
      or p_confirmation_evidence_sha256 is null
      or p_failure_code is null
      or p_failure_code !~ '^[a-z0-9_]{1,96}$'
      or p_failure_evidence_sha256 is null
    ))
    or (p_reconciled_outcome = 'unresolved' and (
      p_observed_payment_intent_status is not null
      or p_observed_amount_cents is not null
      or p_observed_currency is not null
      or p_observed_livemode is not null
      or p_observed_payment_intent_reference_sha256 is not null
      or
      p_provider_response_sha256 is not null
      or p_confirmation_evidence_sha256 is not null
      or p_failure_code is not null
      or p_failure_evidence_sha256 is not null
    )) then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation is invalid';
  end if;

  select count(value), count(distinct value)
    into v_digest_count, v_distinct_digest_count
    from unnest(array[
      p_provider_response_sha256, p_confirmation_evidence_sha256,
      p_webhook_event_sha256, p_retrieval_evidence_sha256,
      p_failure_evidence_sha256, p_reconciliation_evidence_sha256
    ]) as digest_value(value)
   where value is not null;
  if v_digest_count <> v_distinct_digest_count then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation digests collide';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_confirmation_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.confirmation_binding_sha256 =
       p_confirmation_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation binding is invalid';
  end if;

  if p_reconciled_outcome <> 'unresolved' and (
    p_observed_amount_cents <> v_attempt.amount_cents
    or p_observed_currency <> lower(v_attempt.currency)
    or p_observed_payment_intent_reference_sha256 <>
      v_attempt.payment_intent_reference_sha256
  ) then
    raise exception 'Flight Consumer Live Stripe confirmation reconciled provider facts do not match the frozen payment';
  end if;

  if v_attempt.confirmation_state = 'reconciled'
    and v_attempt.confirmation_revision = 3 then
    if v_attempt.reconciled_outcome <> p_reconciled_outcome
      or v_attempt.observed_payment_intent_status
        is distinct from p_observed_payment_intent_status
      or v_attempt.observed_amount_cents
        is distinct from p_observed_amount_cents
      or v_attempt.observed_currency
        is distinct from p_observed_currency
      or v_attempt.observed_livemode
        is distinct from p_observed_livemode
      or v_attempt.observed_payment_intent_reference_sha256
        is distinct from p_observed_payment_intent_reference_sha256
      or v_attempt.provider_response_sha256
        is distinct from p_provider_response_sha256
      or v_attempt.confirmation_evidence_sha256
        is distinct from p_confirmation_evidence_sha256
      or v_attempt.webhook_event_sha256
        is distinct from p_webhook_event_sha256
      or v_attempt.retrieval_evidence_sha256
        is distinct from p_retrieval_evidence_sha256
      or v_attempt.failure_code is distinct from p_failure_code
      or v_attempt.failure_evidence_sha256
        is distinct from p_failure_evidence_sha256
      or v_attempt.reconciliation_evidence_sha256 <>
        p_reconciliation_evidence_sha256 then
      raise exception 'Flight Consumer Live Stripe confirmation reconciliation replay collision';
    end if;
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
  if v_attempt.confirmation_state <> 'ambiguous'
    or v_attempt.confirmation_revision <> p_expected_revision then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation CAS failed';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:stripe-confirmation-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'confirmation_binding_sha256', v_attempt.confirmation_binding_sha256,
      'confirmation_evidence_sha256', p_confirmation_evidence_sha256,
      'confirmation_revision', 3,
      'confirmation_state', 'reconciled',
      'failure_code', p_failure_code,
      'failure_evidence_sha256', p_failure_evidence_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'observed_amount_cents', p_observed_amount_cents,
      'observed_currency', p_observed_currency,
      'observed_livemode', p_observed_livemode,
      'observed_payment_intent_reference_sha256',
        p_observed_payment_intent_reference_sha256,
      'observed_payment_intent_status',
        p_observed_payment_intent_status,
      'provider_response_sha256', p_provider_response_sha256,
      'reconciled_outcome', p_reconciled_outcome,
      'reconciliation_evidence_sha256',
        p_reconciliation_evidence_sha256,
      'retrieval_evidence_sha256', p_retrieval_evidence_sha256,
      'webhook_event_sha256', p_webhook_event_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_stripe_confirmation_attempts as target
     set confirmation_state = 'reconciled',
         confirmation_revision = 3,
         provider_response_sha256 = p_provider_response_sha256,
         confirmation_evidence_sha256 = p_confirmation_evidence_sha256,
         observed_payment_intent_status =
           p_observed_payment_intent_status,
         observed_amount_cents = p_observed_amount_cents,
         observed_currency = p_observed_currency,
         observed_livemode = p_observed_livemode,
         observed_payment_intent_reference_sha256 =
           p_observed_payment_intent_reference_sha256,
         webhook_event_sha256 = p_webhook_event_sha256,
         retrieval_evidence_sha256 = p_retrieval_evidence_sha256,
         failure_code = p_failure_code,
         failure_evidence_sha256 = p_failure_evidence_sha256,
         reconciled_outcome = p_reconciled_outcome,
         reconciliation_evidence_sha256 =
           p_reconciliation_evidence_sha256,
         latest_state_receipt_sha256 = v_receipt,
         reconciled_at = v_now,
         updated_at = v_now
   where target.id = v_attempt.id
     and target.confirmation_state = 'ambiguous'
     and target.confirmation_revision = p_expected_revision
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Stripe confirmation reconciliation CAS failed';
  end if;

  insert into public.flight_consumer_live_stripe_confirmation_receipts (
    attempt_id, confirmation_revision, receipt_kind,
    confirmation_state, previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 3, 'reconciled', 'reconciled',
    v_previous_receipt, v_receipt
  );

  return query select
    'reconciled'::text, v_attempt.id, v_attempt.confirmation_state,
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
end;
$reconcile_flight_consumer_live_stripe_confirmation_v1$;

alter function public.protect_flight_consumer_live_stripe_confirmation_v1()
  owner to postgres;
alter function public.protect_flight_consumer_live_stripe_confirmation_receipt_v1()
  owner to postgres;
alter function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz
) owner to postgres;
alter function public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
  uuid, integer, text, text, text, integer, text
) owner to postgres;
alter function public.record_flight_consumer_live_stripe_confirmation_terminal_v1(
  uuid, integer, text, text, text, text, text, bigint, text, boolean,
  text, text, text, text, text, text, text, boolean
) owner to postgres;
alter function public.mark_flight_consumer_live_stripe_confirmation_ambiguous_v1(
  uuid, integer, text, text, text, text, text, boolean
) owner to postgres;
alter function public.reconcile_flight_consumer_live_stripe_confirmation_v1(
  uuid, integer, text, text, text, text, bigint, text, boolean, text,
  text, text, text, text, text, text, text, boolean
) owner to postgres;

revoke all on function
  public.prepare_flight_consumer_live_stripe_confirmation_v1(
    uuid, uuid, text, text, text, text, text, text, text, timestamptz
  ) from public, anon, authenticated;
revoke all on function
  public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
    uuid, integer, text, text, text, integer, text
  ) from public, anon, authenticated;
revoke all on function
  public.record_flight_consumer_live_stripe_confirmation_terminal_v1(
    uuid, integer, text, text, text, text, text, bigint, text, boolean,
    text, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated;
revoke all on function
  public.mark_flight_consumer_live_stripe_confirmation_ambiguous_v1(
    uuid, integer, text, text, text, text, text, boolean
  ) from public, anon, authenticated;
revoke all on function
  public.reconcile_flight_consumer_live_stripe_confirmation_v1(
    uuid, integer, text, text, text, text, bigint, text, boolean, text,
    text, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated;

grant execute on function
  public.prepare_flight_consumer_live_stripe_confirmation_v1(
    uuid, uuid, text, text, text, text, text, text, text, timestamptz
  ) to service_role;
grant execute on function
  public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
    uuid, integer, text, text, text, integer, text
  ) to service_role;
grant execute on function
  public.record_flight_consumer_live_stripe_confirmation_terminal_v1(
    uuid, integer, text, text, text, text, text, bigint, text, boolean,
    text, text, text, text, text, text, text, boolean
  ) to service_role;
grant execute on function
  public.mark_flight_consumer_live_stripe_confirmation_ambiguous_v1(
    uuid, integer, text, text, text, text, text, boolean
  ) to service_role;
grant execute on function
  public.reconcile_flight_consumer_live_stripe_confirmation_v1(
    uuid, integer, text, text, text, text, bigint, text, boolean, text,
    text, text, text, text, text, text, text, boolean
  ) to service_role;

comment on table public.flight_consumer_live_stripe_confirmation_attempts is
  'Production-dark, append-preserving Stripe consumer-confirmation evidence bound to one completed 106 PaymentIntent creation and one prepared 107 checkout; ciphertext is limited to the inherited encrypted PaymentIntent reference and all observation evidence is digest-only.';
comment on function
  public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
    uuid, integer, text, text, text, integer, text
  ) is
  'Claims one bounded evidence handoff only; no Stripe transport, client secret, payment method, provider dispatch, downstream authority, or blind retry is implemented or granted.';

commit;
