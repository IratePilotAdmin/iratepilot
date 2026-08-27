begin;

-- Flight-owned Stripe TEST persistence foundation only. This migration does
-- not read credentials, verify webhooks, call Stripe, dispatch a provider
-- request, authorize payment/capture/refund, create an order, issue a ticket,
-- or release the consumer flow. Every external identity and payload accepted
-- here must already be represented by a SHA-256 digest.
create table public.flight_consumer_stripe_test_payment_attempts (
  id uuid primary key default gen_random_uuid(),
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
  workflow_sha256 text not null
    check (workflow_sha256 ~ '^[0-9a-f]{64}$'),
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
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'usd' check (currency = 'usd'),
  processor_environment text not null default 'stripe_test'
    check (processor_environment = 'stripe_test'),
  livemode boolean not null default false check (not livemode),
  capture_method text not null default 'manual'
    check (capture_method = 'manual'),
  confirmation_method text not null default 'automatic'
    check (confirmation_method = 'automatic'),
  payment_method_type text not null default 'card'
    check (payment_method_type = 'card'),
  attempt_state text not null default 'prepared'
    check (attempt_state in (
      'prepared', 'claimed', 'observed', 'reconcile_required'
    )),
  revision integer not null default 0 check (revision >= 0),
  lease_token_sha256 text
    check (
      lease_token_sha256 is null
      or lease_token_sha256 ~ '^[0-9a-f]{64}$'
    ),
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  payment_intent_reference_sha256 text
    check (
      payment_intent_reference_sha256 is null
      or payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'
    ),
  observation_state text not null default 'not_observed'
    check (observation_state in (
      'not_observed', 'requires_payment_method', 'requires_confirmation',
      'requires_action', 'processing', 'requires_capture', 'succeeded',
      'canceled', 'failed', 'ambiguous'
    )),
  capture_state text not null default 'not_requested'
    check (capture_state in (
      'not_requested', 'requires_capture', 'captured', 'failed', 'ambiguous'
    )),
  refund_state text not null default 'not_requested'
    check (refund_state in (
      'not_requested', 'pending', 'succeeded', 'failed', 'ambiguous'
    )),
  amount_capturable_cents bigint not null default 0
    check (amount_capturable_cents between 0 and amount_cents),
  amount_received_cents bigint not null default 0
    check (amount_received_cents between 0 and amount_cents),
  amount_refunded_cents bigint not null default 0
    check (
      amount_refunded_cents >= 0
      and amount_refunded_cents <= amount_received_cents
    ),
  last_observation_sha256 text
    check (
      last_observation_sha256 is null
      or last_observation_sha256 ~ '^[0-9a-f]{64}$'
    ),
  recovery_state text not null default 'none'
    check (recovery_state in (
      'none', 'provider_absence_attested', 'provider_present',
      'unresolved', 'manual_review'
    )),
  reconciliation_evidence_sha256 text
    check (
      reconciliation_evidence_sha256 is null
      or reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  provider_request_count integer not null default 0
    check (provider_request_count = 0),
  provider_mutation_count integer not null default 0
    check (provider_mutation_count = 0),
  payment_intent_create_count integer not null default 0
    check (payment_intent_create_count = 0),
  capture_request_count integer not null default 0
    check (capture_request_count = 0),
  refund_request_count integer not null default 0
    check (refund_request_count = 0),
  external_request_made boolean not null default false
    check (not external_request_made),
  raw_payment_method_accepted boolean not null default false
    check (not raw_payment_method_accepted),
  client_secret_exposed boolean not null default false
    check (not client_secret_exposed),
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
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  observed_at timestamptz,
  unique (execution_scope_sha256, payment_attempt_reference_sha256),
  unique (execution_scope_sha256, idempotency_key_sha256),
  unique (workflow_sha256),
  check (
    order_reference_sha256 <> customer_reference_sha256
    and order_reference_sha256 <> payment_attempt_reference_sha256
    and customer_reference_sha256 <> payment_attempt_reference_sha256
  ),
  check (
    (attempt_state = 'claimed'
      and lease_token_sha256 is not null
      and lease_expires_at is not null
      and claimed_at is not null)
    or
    (attempt_state <> 'claimed'
      and lease_token_sha256 is null
      and lease_expires_at is null)
  ),
  check (
    (observation_state = 'not_observed'
      and last_observation_sha256 is null
      and observed_at is null)
    or
    (observation_state <> 'not_observed'
      and payment_intent_reference_sha256 is not null
      and last_observation_sha256 is not null
      and observed_at is not null)
  ),
  check (
    (recovery_state = 'none' and reconciliation_evidence_sha256 is null)
    or
    (recovery_state <> 'none' and reconciliation_evidence_sha256 is not null)
  ),
  check (
    (observation_state = 'requires_capture'
      and capture_state = 'requires_capture'
      and amount_capturable_cents > 0)
    or observation_state <> 'requires_capture'
  ),
  check (
    (capture_state = 'captured'
      and amount_received_cents = amount_cents
      and amount_capturable_cents = 0)
    or capture_state <> 'captured'
  ),
  check (
    (refund_state = 'succeeded' and amount_refunded_cents > 0)
    or refund_state <> 'succeeded'
  ),
  check (updated_at >= created_at),
  check (observed_at is null or observed_at >= created_at)
);

create unique index flight_consumer_stripe_test_attempts_pi_ref_uidx
  on public.flight_consumer_stripe_test_payment_attempts (
    payment_intent_reference_sha256
  ) where payment_intent_reference_sha256 is not null;

create index flight_consumer_stripe_test_attempts_state_idx
  on public.flight_consumer_stripe_test_payment_attempts (
    attempt_state, lease_expires_at, updated_at
  );

create table public.flight_consumer_stripe_test_webhook_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_stripe_test_payment_attempts(id),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  webhook_event_id_sha256 text not null
    check (webhook_event_id_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'payment_intent.amount_capturable_updated',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'payment_intent.succeeded',
    'charge.refunded',
    'refund.updated'
  )),
  payload_sha256 text not null
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_sha256 text not null
    check (semantic_sha256 ~ '^[0-9a-f]{64}$'),
  verification_receipt_sha256 text not null
    check (verification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  payment_intent_reference_sha256 text not null
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  observation_sha256 text not null
    check (observation_sha256 ~ '^[0-9a-f]{64}$'),
  livemode boolean not null default false check (not livemode),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, webhook_event_id_sha256),
  unique (execution_scope_sha256, idempotency_sha256),
  unique (observation_sha256)
);

create index flight_consumer_stripe_test_webhook_attempt_idx
  on public.flight_consumer_stripe_test_webhook_events (
    attempt_id, recorded_at desc
  );

create table public.flight_consumer_stripe_test_payment_observations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_stripe_test_payment_attempts(id),
  source text not null check (source in ('stripe_webhook', 'stripe_retrieve')),
  webhook_event_id_sha256 text
    check (
      webhook_event_id_sha256 is null
      or webhook_event_id_sha256 ~ '^[0-9a-f]{64}$'
    ),
  payment_intent_reference_sha256 text not null
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  observation_sha256 text not null
    check (observation_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text not null
    check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observation_state text not null check (observation_state in (
    'requires_payment_method', 'requires_confirmation', 'requires_action',
    'processing', 'requires_capture', 'succeeded', 'canceled', 'failed',
    'ambiguous'
  )),
  capture_state text not null check (capture_state in (
    'not_requested', 'requires_capture', 'captured', 'failed', 'ambiguous'
  )),
  refund_state text not null check (refund_state in (
    'not_requested', 'pending', 'succeeded', 'failed', 'ambiguous'
  )),
  amount_capturable_cents bigint not null check (amount_capturable_cents >= 0),
  amount_received_cents bigint not null check (amount_received_cents >= 0),
  amount_refunded_cents bigint not null check (amount_refunded_cents >= 0),
  livemode boolean not null default false check (not livemode),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, observation_sha256),
  check (
    (source = 'stripe_webhook' and webhook_event_id_sha256 is not null)
    or
    (source = 'stripe_retrieve' and webhook_event_id_sha256 is null)
  ),
  check (amount_refunded_cents <= amount_received_cents)
);

create index flight_consumer_stripe_test_observations_attempt_idx
  on public.flight_consumer_stripe_test_payment_observations (
    attempt_id, recorded_at desc
  );

create function public.protect_flight_consumer_stripe_test_payment_attempt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_stripe_test_payment_attempt_v1$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight Consumer Stripe TEST attempt evidence is append-preserving';
  end if;

  if new.id is distinct from old.id
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.payment_binding_sha256 is distinct from old.payment_binding_sha256
    or new.order_reference_sha256 is distinct from old.order_reference_sha256
    or new.customer_reference_sha256 is distinct from old.customer_reference_sha256
    or new.payment_attempt_reference_sha256
      is distinct from old.payment_attempt_reference_sha256
    or new.workflow_sha256 is distinct from old.workflow_sha256
    or new.metadata_sha256 is distinct from old.metadata_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.request_envelope_sha256 is distinct from old.request_envelope_sha256
    or new.idempotency_request_sha256
      is distinct from old.idempotency_request_sha256
    or new.idempotency_key_sha256 is distinct from old.idempotency_key_sha256
    or new.amount_cents is distinct from old.amount_cents
    or new.currency is distinct from old.currency
    or new.processor_environment is distinct from old.processor_environment
    or new.livemode is distinct from old.livemode
    or new.capture_method is distinct from old.capture_method
    or new.confirmation_method is distinct from old.confirmation_method
    or new.payment_method_type is distinct from old.payment_method_type
    or new.provider_request_count is distinct from old.provider_request_count
    or new.provider_mutation_count is distinct from old.provider_mutation_count
    or new.payment_intent_create_count
      is distinct from old.payment_intent_create_count
    or new.capture_request_count is distinct from old.capture_request_count
    or new.refund_request_count is distinct from old.refund_request_count
    or new.external_request_made is distinct from old.external_request_made
    or new.raw_payment_method_accepted
      is distinct from old.raw_payment_method_accepted
    or new.client_secret_exposed is distinct from old.client_secret_exposed
    or new.payment_authorized is distinct from old.payment_authorized
    or new.capture_authorized is distinct from old.capture_authorized
    or new.refund_authorized is distinct from old.refund_authorized
    or new.order_authorized is distinct from old.order_authorized
    or new.ticketing_authorized is distinct from old.ticketing_authorized
    or new.consumer_release_enabled is distinct from old.consumer_release_enabled
    or new.created_at is distinct from old.created_at then
    raise exception 'Flight Consumer Stripe TEST attempt identity is immutable';
  end if;

  if old.payment_intent_reference_sha256 is not null
    and new.payment_intent_reference_sha256
      is distinct from old.payment_intent_reference_sha256 then
    raise exception 'Flight Consumer Stripe TEST PaymentIntent binding is immutable';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Flight Consumer Stripe TEST attempt revision must advance by exact CAS';
  end if;

  if old.attempt_state = 'prepared' and new.attempt_state = 'claimed' then
    return new;
  end if;
  if old.attempt_state = 'claimed'
    and new.attempt_state in ('prepared', 'observed', 'reconcile_required') then
    return new;
  end if;
  if old.attempt_state = 'prepared' and new.attempt_state = 'observed' then
    return new;
  end if;
  if old.attempt_state = 'reconcile_required'
    and new.attempt_state = 'observed' then
    return new;
  end if;
  if old.attempt_state = 'observed' and new.attempt_state = 'observed' then
    return new;
  end if;

  raise exception 'Flight Consumer Stripe TEST attempt transition is not authorized';
end;
$protect_flight_consumer_stripe_test_payment_attempt_v1$;

create trigger flight_consumer_stripe_test_attempt_transition_guard
before update or delete on public.flight_consumer_stripe_test_payment_attempts
for each row execute function
  public.protect_flight_consumer_stripe_test_payment_attempt_v1();

create function public.protect_flight_consumer_stripe_test_append_only_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_stripe_test_append_only_v1$
begin
  raise exception 'Flight Consumer Stripe TEST % evidence is append-only', tg_table_name;
end;
$protect_flight_consumer_stripe_test_append_only_v1$;

create trigger flight_consumer_stripe_test_webhook_append_guard
before update or delete on public.flight_consumer_stripe_test_webhook_events
for each row execute function
  public.protect_flight_consumer_stripe_test_append_only_v1();

create trigger flight_consumer_stripe_test_observation_append_guard
before update or delete on public.flight_consumer_stripe_test_payment_observations
for each row execute function
  public.protect_flight_consumer_stripe_test_append_only_v1();

create function public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
  p_execution_scope_sha256 text,
  p_payment_binding_sha256 text,
  p_order_reference_sha256 text,
  p_customer_reference_sha256 text,
  p_payment_attempt_reference_sha256 text,
  p_workflow_sha256 text,
  p_metadata_sha256 text,
  p_request_body_sha256 text,
  p_request_envelope_sha256 text,
  p_idempotency_request_sha256 text,
  p_idempotency_key_sha256 text,
  p_amount_cents bigint
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_stripe_test_payment_attempt_v1$
declare
  v_attempt public.flight_consumer_stripe_test_payment_attempts;
  v_match_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Stripe TEST attempt preparation is service-role only';
  end if;
  if p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_binding_sha256 is null
    or p_payment_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 is null
    or p_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_customer_reference_sha256 is null
    or p_customer_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_attempt_reference_sha256 is null
    or p_payment_attempt_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_workflow_sha256 is null
    or p_workflow_sha256 !~ '^[0-9a-f]{64}$'
    or p_metadata_sha256 is null
    or p_metadata_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_body_sha256 is null
    or p_request_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_envelope_sha256 is null
    or p_request_envelope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_request_sha256 is null
    or p_idempotency_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_key_sha256 is null
    or p_idempotency_key_sha256 !~ '^[0-9a-f]{64}$'
    or p_amount_cents is null
    or p_amount_cents < 50
    or p_amount_cents > 99999999
    or p_order_reference_sha256 = p_customer_reference_sha256
    or p_order_reference_sha256 = p_payment_attempt_reference_sha256
    or p_customer_reference_sha256 = p_payment_attempt_reference_sha256 then
    raise exception 'Flight Consumer Stripe TEST attempt evidence is invalid';
  end if;

  select count(*)
    into v_match_count
    from public.flight_consumer_stripe_test_payment_attempts as candidate
   where (
       candidate.execution_scope_sha256 = p_execution_scope_sha256
       and candidate.payment_attempt_reference_sha256 =
         p_payment_attempt_reference_sha256
     )
      or (
       candidate.execution_scope_sha256 = p_execution_scope_sha256
       and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
     )
      or candidate.workflow_sha256 = p_workflow_sha256;

  if v_match_count > 1 then
    raise exception 'Flight Consumer Stripe TEST attempt identity is ambiguous';
  elsif v_match_count = 1 then
    select candidate.*
      into v_attempt
      from public.flight_consumer_stripe_test_payment_attempts as candidate
     where (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.payment_attempt_reference_sha256 =
           p_payment_attempt_reference_sha256
       )
        or (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
       )
        or candidate.workflow_sha256 = p_workflow_sha256
     for update;
    if row(
      v_attempt.execution_scope_sha256,
      v_attempt.payment_binding_sha256,
      v_attempt.order_reference_sha256,
      v_attempt.customer_reference_sha256,
      v_attempt.payment_attempt_reference_sha256,
      v_attempt.workflow_sha256,
      v_attempt.metadata_sha256,
      v_attempt.request_body_sha256,
      v_attempt.request_envelope_sha256,
      v_attempt.idempotency_request_sha256,
      v_attempt.idempotency_key_sha256,
      v_attempt.amount_cents
    ) is distinct from row(
      p_execution_scope_sha256,
      p_payment_binding_sha256,
      p_order_reference_sha256,
      p_customer_reference_sha256,
      p_payment_attempt_reference_sha256,
      p_workflow_sha256,
      p_metadata_sha256,
      p_request_body_sha256,
      p_request_envelope_sha256,
      p_idempotency_request_sha256,
      p_idempotency_key_sha256,
      p_amount_cents
    ) then
      raise exception 'Flight Consumer Stripe TEST attempt idempotency collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.revision,
      v_attempt.attempt_state;
    return;
  end if;

  insert into public.flight_consumer_stripe_test_payment_attempts (
    execution_scope_sha256, payment_binding_sha256, order_reference_sha256,
    customer_reference_sha256, payment_attempt_reference_sha256,
    workflow_sha256, metadata_sha256, request_body_sha256,
    request_envelope_sha256, idempotency_request_sha256,
    idempotency_key_sha256, amount_cents
  ) values (
    p_execution_scope_sha256, p_payment_binding_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_payment_attempt_reference_sha256, p_workflow_sha256,
    p_metadata_sha256, p_request_body_sha256, p_request_envelope_sha256,
    p_idempotency_request_sha256, p_idempotency_key_sha256, p_amount_cents
  ) returning * into v_attempt;

  return query select
    'created'::text, v_attempt.id, v_attempt.revision,
    v_attempt.attempt_state;
exception
  when unique_violation then
    raise exception 'Flight Consumer Stripe TEST attempt concurrency collision';
end;
$prepare_flight_consumer_stripe_test_payment_attempt_v1$;

create function public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_lease_seconds integer
)
returns table (
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_stripe_test_payment_attempt_v1$
declare
  v_attempt public.flight_consumer_stripe_test_payment_attempts;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Stripe TEST attempt claim is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_seconds is null
    or p_lease_seconds not between 15 and 120 then
    raise exception 'Flight Consumer Stripe TEST claim evidence is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_stripe_test_payment_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256
    or v_attempt.attempt_state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight Consumer Stripe TEST claim CAS failed';
  end if;

  v_now := clock_timestamp();
  update public.flight_consumer_stripe_test_payment_attempts as target
     set attempt_state = 'claimed',
         revision = revision + 1,
         lease_token_sha256 = p_lease_token_sha256,
         lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
         claimed_at = v_now,
         updated_at = v_now
   where target.id = p_attempt_id
     and target.attempt_state = 'prepared'
     and target.revision = p_expected_revision
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Stripe TEST claim CAS failed';
  end if;

  return query select
    v_attempt.id, v_attempt.revision, v_attempt.attempt_state,
    v_attempt.lease_expires_at;
end;
$claim_flight_consumer_stripe_test_payment_attempt_v1$;

create function public.record_flight_consumer_stripe_test_payment_observation_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_source text,
  p_webhook_event_id_sha256 text,
  p_webhook_idempotency_sha256 text,
  p_webhook_event_type text,
  p_webhook_payload_sha256 text,
  p_webhook_semantic_sha256 text,
  p_webhook_verification_receipt_sha256 text,
  p_payment_intent_reference_sha256 text,
  p_observation_sha256 text,
  p_observation_evidence_sha256 text,
  p_observation_state text,
  p_capture_state text,
  p_refund_state text,
  p_amount_capturable_cents bigint,
  p_amount_received_cents bigint,
  p_amount_refunded_cents bigint,
  p_livemode boolean
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  observation_state text,
  capture_state text,
  refund_state text,
  payment_intent_reference_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_stripe_test_payment_observation_v1$
declare
  v_attempt public.flight_consumer_stripe_test_payment_attempts;
  v_existing_observation
    public.flight_consumer_stripe_test_payment_observations;
  v_existing_event public.flight_consumer_stripe_test_webhook_events;
  v_event public.flight_consumer_stripe_test_webhook_events;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Stripe TEST observation is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_intent_reference_sha256 is null
    or p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_observation_sha256 is null
    or p_observation_sha256 !~ '^[0-9a-f]{64}$'
    or p_observation_evidence_sha256 is null
    or p_observation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_livemode is null
    or p_livemode
    or p_observation_state not in (
      'requires_payment_method', 'requires_confirmation', 'requires_action',
      'processing', 'requires_capture', 'succeeded', 'canceled', 'failed',
      'ambiguous'
    )
    or p_capture_state not in (
      'not_requested', 'requires_capture', 'captured', 'failed', 'ambiguous'
    )
    or p_refund_state not in (
      'not_requested', 'pending', 'succeeded', 'failed', 'ambiguous'
    ) then
    raise exception 'Flight Consumer Stripe TEST observation evidence is invalid';
  end if;
  if p_source = 'stripe_webhook' then
    if p_lease_token_sha256 is not null
      or p_webhook_event_id_sha256 is null
      or p_webhook_event_id_sha256 !~ '^[0-9a-f]{64}$'
      or p_webhook_idempotency_sha256 is null
      or p_webhook_idempotency_sha256 !~ '^[0-9a-f]{64}$'
      or p_webhook_event_type not in (
        'payment_intent.amount_capturable_updated',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'payment_intent.succeeded',
        'charge.refunded',
        'refund.updated'
      )
      or p_webhook_payload_sha256 is null
      or p_webhook_payload_sha256 !~ '^[0-9a-f]{64}$'
      or p_webhook_semantic_sha256 is null
      or p_webhook_semantic_sha256 !~ '^[0-9a-f]{64}$'
      or p_webhook_verification_receipt_sha256 is null
      or p_webhook_verification_receipt_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight Consumer Stripe TEST webhook evidence is invalid';
    end if;
  elsif p_source = 'stripe_retrieve' then
    if p_webhook_event_id_sha256 is not null
      or p_webhook_idempotency_sha256 is not null
      or p_webhook_event_type is not null
      or p_webhook_payload_sha256 is not null
      or p_webhook_semantic_sha256 is not null
      or p_webhook_verification_receipt_sha256 is not null then
      raise exception 'Flight Consumer Stripe TEST retrieve evidence contains webhook fields';
    end if;
  else
    raise exception 'Flight Consumer Stripe TEST observation source is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_stripe_test_payment_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256 then
    raise exception 'Flight Consumer Stripe TEST observation attempt binding failed';
  end if;

  select candidate.* into v_existing_observation
    from public.flight_consumer_stripe_test_payment_observations as candidate
   where candidate.attempt_id = p_attempt_id
     and candidate.observation_sha256 = p_observation_sha256;
  if found then
    if row(
      v_existing_observation.source,
      v_existing_observation.webhook_event_id_sha256,
      v_existing_observation.payment_intent_reference_sha256,
      v_existing_observation.evidence_sha256,
      v_existing_observation.observation_state,
      v_existing_observation.capture_state,
      v_existing_observation.refund_state,
      v_existing_observation.amount_capturable_cents,
      v_existing_observation.amount_received_cents,
      v_existing_observation.amount_refunded_cents,
      v_existing_observation.livemode
    ) is distinct from row(
      p_source,
      p_webhook_event_id_sha256,
      p_payment_intent_reference_sha256,
      p_observation_evidence_sha256,
      p_observation_state,
      p_capture_state,
      p_refund_state,
      p_amount_capturable_cents,
      p_amount_received_cents,
      p_amount_refunded_cents,
      p_livemode
    ) then
      raise exception 'Flight Consumer Stripe TEST observation digest collision';
    end if;
    if p_source = 'stripe_webhook' then
      select candidate.* into v_existing_event
        from public.flight_consumer_stripe_test_webhook_events as candidate
       where candidate.execution_scope_sha256 = p_execution_scope_sha256
         and (
           candidate.webhook_event_id_sha256 = p_webhook_event_id_sha256
           or candidate.idempotency_sha256 = p_webhook_idempotency_sha256
         );
      if not found
        or row(
          v_existing_event.webhook_event_id_sha256,
          v_existing_event.idempotency_sha256,
          v_existing_event.event_type,
          v_existing_event.payload_sha256,
          v_existing_event.semantic_sha256,
          v_existing_event.verification_receipt_sha256,
          v_existing_event.payment_intent_reference_sha256,
          v_existing_event.observation_sha256,
          v_existing_event.livemode
        ) is distinct from row(
          p_webhook_event_id_sha256,
          p_webhook_idempotency_sha256,
          p_webhook_event_type,
          p_webhook_payload_sha256,
          p_webhook_semantic_sha256,
          p_webhook_verification_receipt_sha256,
          p_payment_intent_reference_sha256,
          p_observation_sha256,
          p_livemode
        ) then
        raise exception 'Flight Consumer Stripe TEST webhook replay collision';
      end if;
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.revision,
      v_attempt.attempt_state, v_attempt.observation_state,
      v_attempt.capture_state, v_attempt.refund_state,
      v_attempt.payment_intent_reference_sha256;
    return;
  end if;

  if v_attempt.revision <> p_expected_revision
    or v_attempt.attempt_state not in (
      'prepared', 'claimed', 'observed', 'reconcile_required'
    ) then
    raise exception 'Flight Consumer Stripe TEST observation CAS failed';
  end if;
  v_now := clock_timestamp();
  if v_attempt.attempt_state = 'claimed' then
    -- A synchronous retrieve must prove ownership of the live worker lease.
    -- A separately signature-verified webhook is asynchronous and intentionally
    -- carries no worker lease; its exact revision CAS supersedes the worker.
    if p_source = 'stripe_retrieve' and (
      p_lease_token_sha256 is null
      or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
      or v_attempt.lease_token_sha256 <> p_lease_token_sha256
      or v_attempt.lease_expires_at < v_now
    ) then
      raise exception 'Flight Consumer Stripe TEST observation lease is invalid';
    end if;
  elsif p_lease_token_sha256 is not null then
    raise exception 'Flight Consumer Stripe TEST observation has an unexpected lease';
  end if;
  if v_attempt.payment_intent_reference_sha256 is not null
    and v_attempt.payment_intent_reference_sha256 <>
      p_payment_intent_reference_sha256 then
    raise exception 'Flight Consumer Stripe TEST PaymentIntent binding collision';
  end if;
  if p_amount_capturable_cents is null
    or p_amount_received_cents is null
    or p_amount_refunded_cents is null
    or p_amount_capturable_cents < 0
    or p_amount_received_cents < 0
    or p_amount_refunded_cents < 0
    or p_amount_capturable_cents > v_attempt.amount_cents
    or p_amount_received_cents > v_attempt.amount_cents
    or p_amount_refunded_cents > p_amount_received_cents
    or (p_observation_state = 'requires_capture'
      and (p_capture_state <> 'requires_capture'
        or p_amount_capturable_cents <= 0))
    or (p_capture_state = 'captured'
      and (p_amount_received_cents <> v_attempt.amount_cents
        or p_amount_capturable_cents <> 0))
    or (p_refund_state = 'succeeded' and p_amount_refunded_cents <= 0) then
    raise exception 'Flight Consumer Stripe TEST lifecycle observation is inconsistent';
  end if;

  if p_source = 'stripe_webhook' then
    select candidate.* into v_existing_event
      from public.flight_consumer_stripe_test_webhook_events as candidate
     where candidate.execution_scope_sha256 = p_execution_scope_sha256
       and (
         candidate.webhook_event_id_sha256 = p_webhook_event_id_sha256
         or candidate.idempotency_sha256 = p_webhook_idempotency_sha256
       );
    if found then
      raise exception 'Flight Consumer Stripe TEST webhook identity conflict';
    end if;
    insert into public.flight_consumer_stripe_test_webhook_events (
      attempt_id, execution_scope_sha256, webhook_event_id_sha256,
      idempotency_sha256, event_type, payload_sha256, semantic_sha256,
      verification_receipt_sha256, payment_intent_reference_sha256,
      observation_sha256, livemode
    ) values (
      p_attempt_id, p_execution_scope_sha256, p_webhook_event_id_sha256,
      p_webhook_idempotency_sha256, p_webhook_event_type,
      p_webhook_payload_sha256, p_webhook_semantic_sha256,
      p_webhook_verification_receipt_sha256,
      p_payment_intent_reference_sha256, p_observation_sha256, false
    ) returning * into v_event;
  end if;

  insert into public.flight_consumer_stripe_test_payment_observations (
    attempt_id, source, webhook_event_id_sha256,
    payment_intent_reference_sha256, observation_sha256, evidence_sha256,
    observation_state, capture_state, refund_state,
    amount_capturable_cents, amount_received_cents, amount_refunded_cents,
    livemode
  ) values (
    p_attempt_id, p_source, p_webhook_event_id_sha256,
    p_payment_intent_reference_sha256, p_observation_sha256,
    p_observation_evidence_sha256, p_observation_state, p_capture_state,
    p_refund_state, p_amount_capturable_cents, p_amount_received_cents,
    p_amount_refunded_cents, false
  );

  update public.flight_consumer_stripe_test_payment_attempts as target
     set attempt_state = 'observed',
         revision = revision + 1,
         lease_token_sha256 = null,
         lease_expires_at = null,
         payment_intent_reference_sha256 =
           p_payment_intent_reference_sha256,
         observation_state = p_observation_state,
         capture_state = p_capture_state,
         refund_state = p_refund_state,
         amount_capturable_cents = p_amount_capturable_cents,
         amount_received_cents = p_amount_received_cents,
         amount_refunded_cents = p_amount_refunded_cents,
         last_observation_sha256 = p_observation_sha256,
         recovery_state = 'none',
         reconciliation_evidence_sha256 = null,
         updated_at = v_now,
         observed_at = v_now
   where target.id = p_attempt_id
     and target.revision = p_expected_revision
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Stripe TEST observation CAS failed';
  end if;

  return query select
    'recorded'::text, v_attempt.id, v_attempt.revision,
    v_attempt.attempt_state, v_attempt.observation_state,
    v_attempt.capture_state, v_attempt.refund_state,
    v_attempt.payment_intent_reference_sha256;
exception
  when unique_violation then
    raise exception 'Flight Consumer Stripe TEST observation identity collision';
end;
$record_flight_consumer_stripe_test_payment_observation_v1$;

create function public.recover_flight_consumer_stripe_test_payment_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_reconciliation_state text,
  p_reconciliation_evidence_sha256 text,
  p_payment_intent_reference_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  recovery_state text,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $recover_flight_consumer_stripe_test_payment_attempt_v1$
declare
  v_attempt public.flight_consumer_stripe_test_payment_attempts;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Stripe TEST recovery is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_state not in (
      'provider_absence_attested', 'provider_present', 'unresolved'
    )
    or p_reconciliation_evidence_sha256 is null
    or p_reconciliation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (
      p_payment_intent_reference_sha256 is not null
      and p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'Flight Consumer Stripe TEST recovery evidence is invalid';
  end if;
  if (p_reconciliation_state = 'provider_present')
      <> (p_payment_intent_reference_sha256 is not null) then
    raise exception 'Flight Consumer Stripe TEST recovery binding is incomplete';
  end if;

  select * into v_attempt
    from public.flight_consumer_stripe_test_payment_attempts
   where id = p_attempt_id
   for update;
  v_now := clock_timestamp();
  if not found
    or v_attempt.execution_scope_sha256 <> p_execution_scope_sha256
    or v_attempt.attempt_state <> 'claimed'
    or v_attempt.revision <> p_expected_revision
    or v_attempt.lease_token_sha256 <> p_lease_token_sha256
    or v_attempt.lease_expires_at >= v_now then
    raise exception 'Flight Consumer Stripe TEST recovery requires an expired exact lease';
  end if;

  update public.flight_consumer_stripe_test_payment_attempts as target
     set attempt_state = case p_reconciliation_state
           when 'provider_absence_attested' then 'prepared'
           else 'reconcile_required'
         end,
         revision = revision + 1,
         lease_token_sha256 = null,
         lease_expires_at = null,
         payment_intent_reference_sha256 = coalesce(
           target.payment_intent_reference_sha256,
           p_payment_intent_reference_sha256
         ),
         recovery_state = p_reconciliation_state,
         reconciliation_evidence_sha256 =
           p_reconciliation_evidence_sha256,
         updated_at = v_now
   where target.id = p_attempt_id
     and target.attempt_state = 'claimed'
     and target.revision = p_expected_revision
  returning target.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Stripe TEST recovery CAS failed';
  end if;

  return query select
    case
      when p_reconciliation_state = 'provider_absence_attested'
        then 'retry_prepared'
      else 'reconcile_required'
    end,
    v_attempt.id, v_attempt.revision, v_attempt.attempt_state,
    v_attempt.recovery_state, false;
exception
  when unique_violation then
    raise exception 'Flight Consumer Stripe TEST recovery PaymentIntent collision';
end;
$recover_flight_consumer_stripe_test_payment_attempt_v1$;

alter function public.protect_flight_consumer_stripe_test_payment_attempt_v1()
  owner to postgres;
alter function public.protect_flight_consumer_stripe_test_append_only_v1()
  owner to postgres;
alter function public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) owner to postgres;
alter function public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, integer
) owner to postgres;
alter function public.record_flight_consumer_stripe_test_payment_observation_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, bigint, bigint, bigint, boolean
) owner to postgres;
alter function public.recover_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, text, text, text
) owner to postgres;

alter table public.flight_consumer_stripe_test_payment_attempts
  enable row level security;
alter table public.flight_consumer_stripe_test_payment_attempts
  force row level security;
alter table public.flight_consumer_stripe_test_webhook_events
  enable row level security;
alter table public.flight_consumer_stripe_test_webhook_events
  force row level security;
alter table public.flight_consumer_stripe_test_payment_observations
  enable row level security;
alter table public.flight_consumer_stripe_test_payment_observations
  force row level security;

revoke all on table public.flight_consumer_stripe_test_payment_attempts
  from public, anon, authenticated, service_role;
revoke all on table public.flight_consumer_stripe_test_webhook_events
  from public, anon, authenticated, service_role;
revoke all on table public.flight_consumer_stripe_test_payment_observations
  from public, anon, authenticated, service_role;

revoke all on function
  public.protect_flight_consumer_stripe_test_payment_attempt_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.protect_flight_consumer_stripe_test_append_only_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
    text, text, text, text, text, text, text, text, text, text, text, bigint
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, integer
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.record_flight_consumer_stripe_test_payment_observation_v1(
    uuid, integer, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, bigint, bigint, bigint, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.recover_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, text, text, text
  ) from public, anon, authenticated, service_role;

grant execute on function
  public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
    text, text, text, text, text, text, text, text, text, text, text, bigint
  ) to service_role;
grant execute on function
  public.claim_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, integer
  ) to service_role;
grant execute on function
  public.record_flight_consumer_stripe_test_payment_observation_v1(
    uuid, integer, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, bigint, bigint, bigint, boolean
  ) to service_role;
grant execute on function
  public.recover_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, text, text, text
  ) to service_role;

comment on table public.flight_consumer_stripe_test_payment_attempts is
  'Digest-only Stripe TEST attempt, lease, observation, and recovery journal. No raw provider identifiers, payloads, credentials, PII, payment methods, client secrets, orders, or tickets.';
comment on table public.flight_consumer_stripe_test_webhook_events is
  'Digest-only Stripe TEST webhook deduplication evidence. The verification receipt is opaque and must be produced by a separately trusted signature verifier.';
comment on table public.flight_consumer_stripe_test_payment_observations is
  'Append-only digest and numeric Stripe TEST observation evidence. It grants no provider mutation or commercial authority.';
comment on function public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) is
  'Prepares or exactly replays a Stripe TEST persistence attempt. It cannot call Stripe or authorize a provider request.';
comment on function public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, integer
) is
  'Claims an exact bounded database lease only. No provider dispatch is implemented or authorized by this function.';
comment on function public.record_flight_consumer_stripe_test_payment_observation_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, bigint, bigint, bigint, boolean
) is
  'Atomically deduplicates digest-only Stripe TEST webhook evidence and records a bound observation. Opaque caller evidence is not authenticated by this database function.';
comment on function public.recover_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, text, text, text
) is
  'Recovers only an expired exact lease after a digest-bound reconciliation classification. It implements no blind retry or provider dispatch.';

commit;
