begin;

-- Production-local persistence prerequisite only. This aggregate records an
-- encrypted checkout/traveler/contact/address envelope and digest-only terms
-- evidence. It cannot dispatch Duffel or Stripe, create an order, accept a
-- payment method, authorize/capture/refund/settle money, issue a ticket, or
-- release a consumer booking path.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_duffel_offer_refresh_attempts'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_intent_plans'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_payment_executions'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'
    ) is null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(text,text,uuid,uuid,text,text,text,text,text,text,timestamp with time zone)'
    ) is null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_stripe_payment_execution_v1(uuid,text,text,text,timestamp with time zone)'
    ) is null
    or to_regclass('public.profiles') is null
    or not exists (
      select 1
        from pg_catalog.pg_attribute as attribute
       where attribute.attrelid = 'public.profiles'::regclass
         and attribute.attname = 'id'
         and attribute.atttypid = 'uuid'::regtype
         and attribute.attnum > 0
         and not attribute.attisdropped
         and attribute.attnotnull
    )
    or not exists (
      select 1
        from pg_catalog.pg_attribute as attribute
        join pg_catalog.pg_constraint as constraint_record
          on constraint_record.conrelid = attribute.attrelid
         and constraint_record.contype in ('p', 'u')
         and constraint_record.conkey =
           array[attribute.attnum]::smallint[]
       where attribute.attrelid = 'public.profiles'::regclass
         and attribute.attname = 'id'
         and attribute.atttypid = 'uuid'::regtype
         and not attribute.attisdropped
    )
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live checkout evidence requires reviewed 105 offer refresh, 103 Stripe plan, 106 Stripe execution, profile, and SHA-256 prerequisites';
  end if;
end;
$migration$;

create table public.flight_consumer_live_checkout_evidence_aggregates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  -- Production has no Preview flight_orders table. The service-role caller
  -- attests this immutable order UUID, and 103/106 bind its independent digest.
  order_id uuid not null,
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_binding_sha256 text not null unique
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_prerequisite_sha256 text not null
    check (checkout_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),

  offer_refresh_attempt_id uuid not null unique references
    public.flight_consumer_live_duffel_offer_refresh_attempts(id)
    on delete restrict,
  offer_refresh_execution_scope_sha256 text not null
    check (offer_refresh_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  offer_binding_sha256 text not null
    check (offer_binding_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_offer_sha256 text not null
    check (normalized_offer_sha256 ~ '^[0-9a-f]{64}$'),
  offer_terminal_response_sha256 text not null
    check (offer_terminal_response_sha256 ~ '^[0-9a-f]{64}$'),
  offer_expires_at timestamptz not null,

  stripe_plan_id uuid not null unique references
    public.flight_consumer_live_stripe_payment_intent_plans(id)
    on delete restrict,
  stripe_plan_sha256 text not null
    check (stripe_plan_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_payment_executions(id)
    on delete restrict,
  stripe_execution_workflow_sha256 text not null
    check (stripe_execution_workflow_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_prerequisite_sha256 text not null
    check (stripe_execution_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_execution_state_receipt_sha256 text not null
    check (stripe_execution_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),

  traveler_payload_ciphertext text not null check (
    traveler_payload_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,16320}$'
  ),
  traveler_payload_sha256 text not null
    check (traveler_payload_sha256 ~ '^[0-9a-f]{64}$'),
  traveler_evidence_sha256 text not null
    check (traveler_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  contact_payload_ciphertext text not null check (
    contact_payload_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
  ),
  contact_payload_sha256 text not null
    check (contact_payload_sha256 ~ '^[0-9a-f]{64}$'),
  contact_evidence_sha256 text not null
    check (contact_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  billing_address_payload_ciphertext text not null check (
    billing_address_payload_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
  ),
  billing_address_payload_sha256 text not null
    check (billing_address_payload_sha256 ~ '^[0-9a-f]{64}$'),
  billing_address_evidence_sha256 text not null
    check (billing_address_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  terms_snapshot_sha256 text not null
    check (terms_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  terms_acceptance_sha256 text not null
    check (terms_acceptance_sha256 ~ '^[0-9a-f]{64}$'),
  terms_accepted_at timestamptz not null,

  checkout_state text not null default 'prepared'
    check (checkout_state in ('prepared', 'finalized', 'abandoned')),
  checkout_revision integer not null default 0
    check (checkout_revision in (0, 1)),
  latest_state_receipt_sha256 text not null
    check (latest_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  finalization_evidence_sha256 text
    check (
      finalization_evidence_sha256 is null
      or finalization_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),
  abandonment_code text
    check (
      abandonment_code is null
      or abandonment_code ~ '^[a-z0-9_]{1,96}$'
    ),
  abandonment_evidence_sha256 text
    check (
      abandonment_evidence_sha256 is null
      or abandonment_evidence_sha256 ~ '^[0-9a-f]{64}$'
    ),

  provider_request_count integer not null default 0
    check (provider_request_count = 0),
  stripe_request_count integer not null default 0
    check (stripe_request_count = 0),
  order_request_count integer not null default 0
    check (order_request_count = 0),
  payment_request_count integer not null default 0
    check (payment_request_count = 0),
  capture_request_count integer not null default 0
    check (capture_request_count = 0),
  refund_request_count integer not null default 0
    check (refund_request_count = 0),
  settlement_request_count integer not null default 0
    check (settlement_request_count = 0),
  ticket_request_count integer not null default 0
    check (ticket_request_count = 0),
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

  prepared_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  abandoned_at timestamptz,
  unique (order_id),
  unique (execution_scope_sha256, idempotency_sha256),
  check (order_reference_sha256 <> customer_reference_sha256),
  check (
    traveler_payload_sha256 <> traveler_evidence_sha256
    and contact_payload_sha256 <> contact_evidence_sha256
    and billing_address_payload_sha256 <> billing_address_evidence_sha256
  ),
  check (offer_expires_at > prepared_at),
  check (terms_accepted_at <= prepared_at),
  check (updated_at >= prepared_at),
  check (
    (checkout_state = 'prepared'
      and checkout_revision = 0
      and finalization_evidence_sha256 is null
      and abandonment_code is null
      and abandonment_evidence_sha256 is null
      and finalized_at is null
      and abandoned_at is null)
    or
    (checkout_state = 'finalized'
      and checkout_revision = 1
      and finalization_evidence_sha256 is not null
      and abandonment_code is null
      and abandonment_evidence_sha256 is null
      and finalized_at is not null
      and abandoned_at is null)
    or
    (checkout_state = 'abandoned'
      and checkout_revision = 1
      and finalization_evidence_sha256 is null
      and abandonment_code is not null
      and abandonment_evidence_sha256 is not null
      and finalized_at is null
      and abandoned_at is not null)
  )
);

create index flight_consumer_live_checkout_evidence_state_idx
  on public.flight_consumer_live_checkout_evidence_aggregates (
    checkout_state, updated_at desc
  );

create table public.flight_consumer_live_checkout_evidence_receipts (
  id uuid primary key default gen_random_uuid(),
  aggregate_id uuid not null references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  checkout_revision integer not null check (checkout_revision in (0, 1)),
  receipt_kind text not null
    check (receipt_kind in ('prepared', 'finalized', 'abandoned')),
  checkout_state text not null
    check (checkout_state in ('prepared', 'finalized', 'abandoned')),
  previous_receipt_sha256 text
    check (
      previous_receipt_sha256 is null
      or previous_receipt_sha256 ~ '^[0-9a-f]{64}$'
    ),
  receipt_sha256 text not null unique
    check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (aggregate_id, checkout_revision),
  check (
    (checkout_revision = 0
      and receipt_kind = 'prepared'
      and checkout_state = 'prepared'
      and previous_receipt_sha256 is null)
    or
    (checkout_revision = 1
      and receipt_kind = checkout_state
      and checkout_state in ('finalized', 'abandoned')
      and previous_receipt_sha256 is not null)
  )
);

alter table public.flight_consumer_live_checkout_evidence_aggregates
  enable row level security;
alter table public.flight_consumer_live_checkout_evidence_aggregates
  force row level security;
alter table public.flight_consumer_live_checkout_evidence_receipts
  enable row level security;
alter table public.flight_consumer_live_checkout_evidence_receipts
  force row level security;

revoke all on table
  public.flight_consumer_live_checkout_evidence_aggregates,
  public.flight_consumer_live_checkout_evidence_receipts
from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_checkout_evidence_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $protect_flight_consumer_live_checkout_evidence_v1$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight Consumer Live checkout evidence is immutable';
  end if;

  if row(
    new.customer_id, new.order_id, new.execution_scope_sha256,
    new.idempotency_sha256, new.checkout_binding_sha256,
    new.checkout_prerequisite_sha256, new.offer_refresh_attempt_id,
    new.offer_refresh_execution_scope_sha256, new.offer_binding_sha256,
    new.normalized_offer_sha256, new.offer_terminal_response_sha256,
    new.offer_expires_at, new.stripe_plan_id, new.stripe_plan_sha256,
    new.stripe_execution_attempt_id,
    new.stripe_execution_workflow_sha256,
    new.stripe_execution_prerequisite_sha256,
    new.stripe_execution_state_receipt_sha256,
    new.payment_binding_sha256, new.order_reference_sha256,
    new.customer_reference_sha256, new.amount_cents, new.currency,
    new.traveler_payload_ciphertext, new.traveler_payload_sha256,
    new.traveler_evidence_sha256, new.contact_payload_ciphertext,
    new.contact_payload_sha256, new.contact_evidence_sha256,
    new.billing_address_payload_ciphertext,
    new.billing_address_payload_sha256,
    new.billing_address_evidence_sha256, new.terms_snapshot_sha256,
    new.terms_acceptance_sha256, new.terms_accepted_at,
    new.provider_request_count, new.stripe_request_count,
    new.order_request_count, new.payment_request_count,
    new.capture_request_count, new.refund_request_count,
    new.settlement_request_count, new.ticket_request_count,
    new.provider_dispatch_authorized, new.stripe_dispatch_authorized,
    new.booking_authorized, new.order_authorized,
    new.payment_authorized, new.capture_authorized,
    new.refund_authorized, new.settlement_authorized,
    new.ticketing_authorized, new.servicing_authorized,
    new.consumer_release_enabled, new.prepared_at
  ) is distinct from row(
    old.customer_id, old.order_id, old.execution_scope_sha256,
    old.idempotency_sha256, old.checkout_binding_sha256,
    old.checkout_prerequisite_sha256, old.offer_refresh_attempt_id,
    old.offer_refresh_execution_scope_sha256, old.offer_binding_sha256,
    old.normalized_offer_sha256, old.offer_terminal_response_sha256,
    old.offer_expires_at, old.stripe_plan_id, old.stripe_plan_sha256,
    old.stripe_execution_attempt_id,
    old.stripe_execution_workflow_sha256,
    old.stripe_execution_prerequisite_sha256,
    old.stripe_execution_state_receipt_sha256,
    old.payment_binding_sha256, old.order_reference_sha256,
    old.customer_reference_sha256, old.amount_cents, old.currency,
    old.traveler_payload_ciphertext, old.traveler_payload_sha256,
    old.traveler_evidence_sha256, old.contact_payload_ciphertext,
    old.contact_payload_sha256, old.contact_evidence_sha256,
    old.billing_address_payload_ciphertext,
    old.billing_address_payload_sha256,
    old.billing_address_evidence_sha256, old.terms_snapshot_sha256,
    old.terms_acceptance_sha256, old.terms_accepted_at,
    old.provider_request_count, old.stripe_request_count,
    old.order_request_count, old.payment_request_count,
    old.capture_request_count, old.refund_request_count,
    old.settlement_request_count, old.ticket_request_count,
    old.provider_dispatch_authorized, old.stripe_dispatch_authorized,
    old.booking_authorized, old.order_authorized,
    old.payment_authorized, old.capture_authorized,
    old.refund_authorized, old.settlement_authorized,
    old.ticketing_authorized, old.servicing_authorized,
    old.consumer_release_enabled, old.prepared_at
  ) then
    raise exception 'Flight Consumer Live checkout evidence binding is immutable';
  end if;

  if old.checkout_state <> 'prepared'
    or new.checkout_state not in ('finalized', 'abandoned')
    or new.checkout_revision <> old.checkout_revision + 1
    or new.latest_state_receipt_sha256 = old.latest_state_receipt_sha256
    or new.updated_at <= old.updated_at then
    raise exception 'Flight Consumer Live checkout evidence transition is invalid';
  end if;
  return new;
end;
$protect_flight_consumer_live_checkout_evidence_v1$;

create trigger flight_consumer_live_checkout_evidence_guard
before update or delete
on public.flight_consumer_live_checkout_evidence_aggregates
for each row execute function
  public.protect_flight_consumer_live_checkout_evidence_v1();

create function public.protect_flight_consumer_live_checkout_receipt_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $protect_flight_consumer_live_checkout_receipt_v1$
begin
  raise exception 'Flight Consumer Live checkout evidence receipts are append-only';
end;
$protect_flight_consumer_live_checkout_receipt_v1$;

create trigger flight_consumer_live_checkout_evidence_receipt_guard
before update or delete
on public.flight_consumer_live_checkout_evidence_receipts
for each row execute function
  public.protect_flight_consumer_live_checkout_receipt_v1();

create function public.prepare_flight_consumer_live_checkout_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_checkout_binding_sha256 text,
  p_checkout_prerequisite_sha256 text,
  p_offer_refresh_attempt_id uuid,
  p_offer_refresh_execution_scope_sha256 text,
  p_offer_binding_sha256 text,
  p_normalized_offer_sha256 text,
  p_offer_terminal_response_sha256 text,
  p_stripe_plan_id uuid,
  p_stripe_plan_sha256 text,
  p_stripe_execution_attempt_id uuid,
  p_stripe_execution_workflow_sha256 text,
  p_stripe_execution_prerequisite_sha256 text,
  p_stripe_execution_state_receipt_sha256 text,
  p_payment_binding_sha256 text,
  p_order_reference_sha256 text,
  p_customer_reference_sha256 text,
  p_amount_cents bigint,
  p_currency text,
  p_traveler_payload_ciphertext text,
  p_traveler_evidence_sha256 text,
  p_contact_payload_ciphertext text,
  p_contact_evidence_sha256 text,
  p_billing_address_payload_ciphertext text,
  p_billing_address_evidence_sha256 text,
  p_terms_snapshot_sha256 text,
  p_terms_acceptance_sha256 text,
  p_terms_accepted_at timestamptz
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
as $prepare_flight_consumer_live_checkout_evidence_v1$
declare
  v_refresh public.flight_consumer_live_duffel_offer_refresh_attempts;
  v_plan public.flight_consumer_live_stripe_payment_intent_plans;
  v_execution public.flight_consumer_live_stripe_payment_executions;
  v_aggregate public.flight_consumer_live_checkout_evidence_aggregates;
  v_match_count bigint;
  v_exact_match boolean;
  v_now timestamptz := clock_timestamp();
  v_traveler_payload_sha256 text;
  v_contact_payload_sha256 text;
  v_address_payload_sha256 text;
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live checkout evidence is service-role only';
  end if;
  if p_customer_id is null or p_order_id is null
    or p_offer_refresh_attempt_id is null or p_stripe_plan_id is null
    or p_stripe_execution_attempt_id is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_refresh_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_normalized_offer_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_terminal_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_plan_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_execution_workflow_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_execution_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_execution_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_customer_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 = p_customer_reference_sha256
    or p_amount_cents not between 50 and 99999999
    or p_currency is distinct from 'USD'
    or p_traveler_payload_ciphertext !~
      '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,16320}$'
    or p_contact_payload_ciphertext !~
      '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
    or p_billing_address_payload_ciphertext !~
      '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
    or p_traveler_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_contact_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_billing_address_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_terms_snapshot_sha256 !~ '^[0-9a-f]{64}$'
    or p_terms_acceptance_sha256 !~ '^[0-9a-f]{64}$'
    or p_terms_accepted_at is null
    or p_terms_accepted_at > v_now
    or p_terms_accepted_at < v_now - interval '30 minutes' then
    raise exception 'Flight Consumer Live checkout evidence envelope is invalid';
  end if;

  v_traveler_payload_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout:traveler-ciphertext:v1',
      'UTF8'
    ) || decode('00', 'hex') ||
      convert_to(p_traveler_payload_ciphertext, 'UTF8'),
    'sha256'
  ), 'hex');
  v_contact_payload_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout:contact-ciphertext:v1',
      'UTF8'
    ) || decode('00', 'hex') ||
      convert_to(p_contact_payload_ciphertext, 'UTF8'),
    'sha256'
  ), 'hex');
  v_address_payload_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout:address-ciphertext:v1',
      'UTF8'
    ) || decode('00', 'hex') ||
      convert_to(p_billing_address_payload_ciphertext, 'UTF8'),
    'sha256'
  ), 'hex');

  if (select count(distinct value) from unnest(array[
      v_traveler_payload_sha256, p_traveler_evidence_sha256,
      v_contact_payload_sha256, p_contact_evidence_sha256,
      v_address_payload_sha256, p_billing_address_evidence_sha256,
      p_terms_snapshot_sha256, p_terms_acceptance_sha256
    ]) as digest_value(value)) <> 8 then
    raise exception 'Flight Consumer Live checkout evidence domains collide';
  end if;

  -- Resolve an existing identity before consulting mutable prerequisite state.
  -- This makes an exact replay durable after offer expiry or a later 106 CAS,
  -- while every changed byte/digest is still refused as a collision.
  select count(*), coalesce(bool_and(row(
    candidate.customer_id, candidate.order_id,
    candidate.execution_scope_sha256, candidate.idempotency_sha256,
    candidate.checkout_binding_sha256,
    candidate.checkout_prerequisite_sha256,
    candidate.offer_refresh_attempt_id,
    candidate.offer_refresh_execution_scope_sha256,
    candidate.offer_binding_sha256, candidate.normalized_offer_sha256,
    candidate.offer_terminal_response_sha256,
    candidate.stripe_plan_id, candidate.stripe_plan_sha256,
    candidate.stripe_execution_attempt_id,
    candidate.stripe_execution_workflow_sha256,
    candidate.stripe_execution_prerequisite_sha256,
    candidate.stripe_execution_state_receipt_sha256,
    candidate.payment_binding_sha256, candidate.order_reference_sha256,
    candidate.customer_reference_sha256, candidate.amount_cents,
    candidate.currency, candidate.traveler_payload_ciphertext,
    candidate.traveler_payload_sha256,
    candidate.traveler_evidence_sha256,
    candidate.contact_payload_ciphertext, candidate.contact_payload_sha256,
    candidate.contact_evidence_sha256,
    candidate.billing_address_payload_ciphertext,
    candidate.billing_address_payload_sha256,
    candidate.billing_address_evidence_sha256,
    candidate.terms_snapshot_sha256, candidate.terms_acceptance_sha256,
    candidate.terms_accepted_at
  ) is not distinct from row(
    p_customer_id, p_order_id, p_execution_scope_sha256,
    p_idempotency_sha256, p_checkout_binding_sha256,
    p_checkout_prerequisite_sha256, p_offer_refresh_attempt_id,
    p_offer_refresh_execution_scope_sha256, p_offer_binding_sha256,
    p_normalized_offer_sha256, p_offer_terminal_response_sha256,
    p_stripe_plan_id, p_stripe_plan_sha256,
    p_stripe_execution_attempt_id, p_stripe_execution_workflow_sha256,
    p_stripe_execution_prerequisite_sha256,
    p_stripe_execution_state_receipt_sha256, p_payment_binding_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_amount_cents, p_currency, p_traveler_payload_ciphertext,
    v_traveler_payload_sha256, p_traveler_evidence_sha256,
    p_contact_payload_ciphertext, v_contact_payload_sha256,
    p_contact_evidence_sha256, p_billing_address_payload_ciphertext,
    v_address_payload_sha256, p_billing_address_evidence_sha256,
    p_terms_snapshot_sha256, p_terms_acceptance_sha256,
    p_terms_accepted_at
  )), false)
    into v_match_count, v_exact_match
    from public.flight_consumer_live_checkout_evidence_aggregates as candidate
   where candidate.order_id = p_order_id
      or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
      or candidate.stripe_plan_id = p_stripe_plan_id
      or candidate.stripe_execution_attempt_id = p_stripe_execution_attempt_id
      or candidate.checkout_binding_sha256 = p_checkout_binding_sha256
      or (candidate.execution_scope_sha256 = p_execution_scope_sha256
        and candidate.idempotency_sha256 = p_idempotency_sha256);
  if v_match_count > 0 then
    if v_match_count <> 1 or not v_exact_match then
      raise exception 'Flight Consumer Live checkout evidence replay collision';
    end if;
    select candidate.* into v_aggregate
      from public.flight_consumer_live_checkout_evidence_aggregates as candidate
     where candidate.order_id = p_order_id
        or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
        or candidate.stripe_plan_id = p_stripe_plan_id
        or candidate.stripe_execution_attempt_id =
          p_stripe_execution_attempt_id
        or candidate.checkout_binding_sha256 = p_checkout_binding_sha256
        or (candidate.execution_scope_sha256 = p_execution_scope_sha256
          and candidate.idempotency_sha256 = p_idempotency_sha256)
     for update;
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

  select refresh.* into v_refresh
    from public.flight_consumer_live_duffel_offer_refresh_attempts as refresh
   where refresh.id = p_offer_refresh_attempt_id
     and refresh.execution_scope_sha256 =
       p_offer_refresh_execution_scope_sha256
     and refresh.offer_binding_sha256 = p_offer_binding_sha256
     and refresh.normalized_offer_sha256 = p_normalized_offer_sha256
     and refresh.terminal_response_sha256 =
       p_offer_terminal_response_sha256
     and refresh.attempt_state = 'succeeded'
     and refresh.attempt_revision = 2
     and refresh.provider_dispatch_count = 1
     and refresh.terminal_http_status = 200
     and refresh.price_amount_minor = p_amount_cents
     and refresh.price_currency = p_currency
     and refresh.offer_expires_at > v_now + interval '60 seconds'
     and not refresh.final_checkout_pricing_authorized
     and not refresh.order_authorized
     and not refresh.payment_authorized
     and not refresh.settlement_authorized
     and not refresh.ticketing_authorized
     and not refresh.refund_authorized
     and not refresh.servicing_authorized
     and not refresh.consumer_release_enabled
   for update;
  if not found then
    raise exception 'Flight Consumer Live checkout offer refresh binding is invalid';
  end if;

  select plan.* into v_plan
    from public.flight_consumer_live_stripe_payment_intent_plans as plan
   where plan.id = p_stripe_plan_id
     and plan.plan_sha256 = p_stripe_plan_sha256
     and plan.payment_binding_sha256 = p_payment_binding_sha256
     and plan.order_reference_sha256 = p_order_reference_sha256
     and plan.customer_reference_sha256 = p_customer_reference_sha256
     and plan.amount_cents = p_amount_cents
     and plan.currency = lower(p_currency)
     and plan.plan_mode = 'zero_dispatch'
     and plan.processor_id = 'stripe_live'
     and plan.provider_request_count = 0
     and plan.stripe_request_count = 0
     and plan.stripe_mutation_count = 0
     and plan.payment_intent_count = 0
     and plan.charge_count = 0
     and plan.refund_count = 0
     and not plan.external_request_made
     and not plan.raw_payment_method_accepted
     and not plan.client_secret_exposed
     and not plan.payment_authorized
     and not plan.capture_authorized
     and not plan.refund_authorized
     and not plan.order_authorized
     and not plan.ticketing_authorized
     and not plan.consumer_release_enabled
   for update;
  if not found then
    raise exception 'Flight Consumer Live checkout Stripe plan binding is invalid';
  end if;

  select execution.* into v_execution
    from public.flight_consumer_live_stripe_payment_executions as execution
   where execution.id = p_stripe_execution_attempt_id
     and execution.plan_id = p_stripe_plan_id
     and execution.plan_sha256 = p_stripe_plan_sha256
     and execution.execution_workflow_sha256 =
       p_stripe_execution_workflow_sha256
     and execution.execution_prerequisite_sha256 =
       p_stripe_execution_prerequisite_sha256
     and execution.latest_state_receipt_sha256 =
       p_stripe_execution_state_receipt_sha256
     and execution.payment_binding_sha256 = p_payment_binding_sha256
     and execution.order_reference_sha256 = p_order_reference_sha256
     and execution.customer_reference_sha256 = p_customer_reference_sha256
     and execution.amount_cents = p_amount_cents
     and execution.currency = lower(p_currency)
     and execution.attempt_state = 'prepared'
     and execution.attempt_revision = 0
     and execution.dispatch_not_after > v_now
     and execution.stripe_request_count = 0
     and execution.stripe_mutation_count = 0
     and execution.payment_intent_create_count = 0
     and execution.order_request_count = 0
     and execution.capture_request_count = 0
     and execution.refund_request_count = 0
     and execution.ticket_request_count = 0
     and not execution.external_request_made
     and not execution.stripe_dispatch_authorized
     and not execution.payment_authorized
     and not execution.order_authorized
     and not execution.capture_authorized
     and not execution.refund_authorized
     and not execution.settlement_authorized
     and not execution.ticketing_authorized
     and not execution.servicing_authorized
     and not execution.consumer_release_enabled
     and not execution.blind_retry_authorized
   for update;
  if not found then
    raise exception 'Flight Consumer Live checkout Stripe execution binding is invalid';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'checkout_binding_sha256', p_checkout_binding_sha256,
      'checkout_prerequisite_sha256', p_checkout_prerequisite_sha256,
      'checkout_revision', 0,
      'checkout_state', 'prepared',
      'contact_payload_sha256', v_contact_payload_sha256,
      'customer_id', p_customer_id,
      'offer_refresh_attempt_id', p_offer_refresh_attempt_id,
      'order_id', p_order_id,
      'stripe_execution_attempt_id', p_stripe_execution_attempt_id,
      'terms_acceptance_sha256', p_terms_acceptance_sha256,
      'traveler_payload_sha256', v_traveler_payload_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_checkout_evidence_aggregates (
    customer_id, order_id, execution_scope_sha256, idempotency_sha256,
    checkout_binding_sha256, checkout_prerequisite_sha256,
    offer_refresh_attempt_id, offer_refresh_execution_scope_sha256,
    offer_binding_sha256, normalized_offer_sha256,
    offer_terminal_response_sha256, offer_expires_at,
    stripe_plan_id, stripe_plan_sha256, stripe_execution_attempt_id,
    stripe_execution_workflow_sha256,
    stripe_execution_prerequisite_sha256,
    stripe_execution_state_receipt_sha256, payment_binding_sha256,
    order_reference_sha256, customer_reference_sha256,
    amount_cents, traveler_payload_ciphertext, traveler_payload_sha256,
    traveler_evidence_sha256, contact_payload_ciphertext,
    contact_payload_sha256, contact_evidence_sha256,
    billing_address_payload_ciphertext, billing_address_payload_sha256,
    billing_address_evidence_sha256, terms_snapshot_sha256,
    terms_acceptance_sha256, terms_accepted_at, latest_state_receipt_sha256
  ) values (
    p_customer_id, p_order_id, p_execution_scope_sha256,
    p_idempotency_sha256, p_checkout_binding_sha256,
    p_checkout_prerequisite_sha256, p_offer_refresh_attempt_id,
    p_offer_refresh_execution_scope_sha256, p_offer_binding_sha256,
    p_normalized_offer_sha256, p_offer_terminal_response_sha256,
    v_refresh.offer_expires_at, p_stripe_plan_id, p_stripe_plan_sha256,
    p_stripe_execution_attempt_id, p_stripe_execution_workflow_sha256,
    p_stripe_execution_prerequisite_sha256,
    p_stripe_execution_state_receipt_sha256, p_payment_binding_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_amount_cents, p_traveler_payload_ciphertext,
    v_traveler_payload_sha256, p_traveler_evidence_sha256,
    p_contact_payload_ciphertext, v_contact_payload_sha256,
    p_contact_evidence_sha256, p_billing_address_payload_ciphertext,
    v_address_payload_sha256, p_billing_address_evidence_sha256,
    p_terms_snapshot_sha256, p_terms_acceptance_sha256,
    p_terms_accepted_at, v_receipt
  ) on conflict do nothing
  returning * into v_aggregate;

  if found then
    insert into public.flight_consumer_live_checkout_evidence_receipts (
      aggregate_id, checkout_revision, receipt_kind, checkout_state,
      previous_receipt_sha256, receipt_sha256
    ) values (
      v_aggregate.id, 0, 'prepared', 'prepared', null, v_receipt
    );
    return query select
      'created'::text, v_aggregate.id, v_aggregate.checkout_state,
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

  select count(*) into v_match_count
    from public.flight_consumer_live_checkout_evidence_aggregates as candidate
   where candidate.order_id = p_order_id
      or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
      or candidate.stripe_plan_id = p_stripe_plan_id
      or candidate.stripe_execution_attempt_id = p_stripe_execution_attempt_id
      or candidate.checkout_binding_sha256 = p_checkout_binding_sha256
      or (candidate.execution_scope_sha256 = p_execution_scope_sha256
        and candidate.idempotency_sha256 = p_idempotency_sha256);
  if v_match_count is distinct from 1 then
    raise exception 'Flight Consumer Live checkout evidence identity collision';
  end if;

  select candidate.* into v_aggregate
    from public.flight_consumer_live_checkout_evidence_aggregates as candidate
   where candidate.order_id = p_order_id
      or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
      or candidate.stripe_plan_id = p_stripe_plan_id
      or candidate.stripe_execution_attempt_id = p_stripe_execution_attempt_id
      or candidate.checkout_binding_sha256 = p_checkout_binding_sha256
      or (candidate.execution_scope_sha256 = p_execution_scope_sha256
        and candidate.idempotency_sha256 = p_idempotency_sha256)
   for update;
  if row(
    v_aggregate.customer_id, v_aggregate.order_id,
    v_aggregate.execution_scope_sha256, v_aggregate.idempotency_sha256,
    v_aggregate.checkout_binding_sha256,
    v_aggregate.checkout_prerequisite_sha256,
    v_aggregate.offer_refresh_attempt_id,
    v_aggregate.offer_refresh_execution_scope_sha256,
    v_aggregate.offer_binding_sha256, v_aggregate.normalized_offer_sha256,
    v_aggregate.offer_terminal_response_sha256,
    v_aggregate.stripe_plan_id, v_aggregate.stripe_plan_sha256,
    v_aggregate.stripe_execution_attempt_id,
    v_aggregate.stripe_execution_workflow_sha256,
    v_aggregate.stripe_execution_prerequisite_sha256,
    v_aggregate.stripe_execution_state_receipt_sha256,
    v_aggregate.payment_binding_sha256,
    v_aggregate.order_reference_sha256,
    v_aggregate.customer_reference_sha256, v_aggregate.amount_cents,
    v_aggregate.currency, v_aggregate.traveler_payload_ciphertext,
    v_aggregate.traveler_payload_sha256,
    v_aggregate.traveler_evidence_sha256,
    v_aggregate.contact_payload_ciphertext,
    v_aggregate.contact_payload_sha256,
    v_aggregate.contact_evidence_sha256,
    v_aggregate.billing_address_payload_ciphertext,
    v_aggregate.billing_address_payload_sha256,
    v_aggregate.billing_address_evidence_sha256,
    v_aggregate.terms_snapshot_sha256,
    v_aggregate.terms_acceptance_sha256, v_aggregate.terms_accepted_at
  ) is distinct from row(
    p_customer_id, p_order_id, p_execution_scope_sha256,
    p_idempotency_sha256, p_checkout_binding_sha256,
    p_checkout_prerequisite_sha256, p_offer_refresh_attempt_id,
    p_offer_refresh_execution_scope_sha256, p_offer_binding_sha256,
    p_normalized_offer_sha256, p_offer_terminal_response_sha256,
    p_stripe_plan_id, p_stripe_plan_sha256,
    p_stripe_execution_attempt_id, p_stripe_execution_workflow_sha256,
    p_stripe_execution_prerequisite_sha256,
    p_stripe_execution_state_receipt_sha256, p_payment_binding_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_amount_cents, p_currency, p_traveler_payload_ciphertext,
    v_traveler_payload_sha256, p_traveler_evidence_sha256,
    p_contact_payload_ciphertext, v_contact_payload_sha256,
    p_contact_evidence_sha256, p_billing_address_payload_ciphertext,
    v_address_payload_sha256, p_billing_address_evidence_sha256,
    p_terms_snapshot_sha256, p_terms_acceptance_sha256,
    p_terms_accepted_at
  ) then
    raise exception 'Flight Consumer Live checkout evidence replay collision';
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
end;
$prepare_flight_consumer_live_checkout_evidence_v1$;

create function public.finalize_flight_consumer_live_checkout_evidence_v1(
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
  v_now timestamptz := clock_timestamp();
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

  select count(*) into v_prerequisite_count
    from public.flight_consumer_live_duffel_offer_refresh_attempts as refresh
    join public.flight_consumer_live_stripe_payment_intent_plans as plan
      on plan.id = v_aggregate.stripe_plan_id
    join public.flight_consumer_live_stripe_payment_executions as execution
      on execution.id = v_aggregate.stripe_execution_attempt_id
     and execution.plan_id = plan.id
   where refresh.id = v_aggregate.offer_refresh_attempt_id
     and refresh.attempt_state = 'succeeded'
     and refresh.attempt_revision = 2
     and refresh.offer_binding_sha256 = v_aggregate.offer_binding_sha256
     and refresh.normalized_offer_sha256 =
       v_aggregate.normalized_offer_sha256
     and refresh.terminal_response_sha256 =
       v_aggregate.offer_terminal_response_sha256
     and refresh.price_amount_minor = v_aggregate.amount_cents
     and refresh.price_currency = v_aggregate.currency
     and refresh.offer_expires_at = v_aggregate.offer_expires_at
     and refresh.offer_expires_at > v_now
     and plan.plan_sha256 = v_aggregate.stripe_plan_sha256
     and plan.plan_mode = 'zero_dispatch'
     and plan.amount_cents = v_aggregate.amount_cents
     and plan.currency = lower(v_aggregate.currency)
     and plan.stripe_request_count = 0
     and not plan.external_request_made
     and execution.execution_workflow_sha256 =
       v_aggregate.stripe_execution_workflow_sha256
     and execution.execution_prerequisite_sha256 =
       v_aggregate.stripe_execution_prerequisite_sha256
     and execution.latest_state_receipt_sha256 =
       v_aggregate.stripe_execution_state_receipt_sha256
     and execution.attempt_state = 'prepared'
     and execution.attempt_revision = 0
     and execution.dispatch_not_after > v_now
     and execution.stripe_request_count = 0
     and not execution.external_request_made
     and not execution.stripe_dispatch_authorized
     and not execution.payment_authorized
     and not execution.order_authorized
     and not execution.capture_authorized
     and not execution.refund_authorized
     and not execution.settlement_authorized
     and not execution.ticketing_authorized
     and not execution.consumer_release_enabled;
  if v_prerequisite_count is distinct from 1 then
    raise exception 'Flight Consumer Live checkout finalization prerequisite changed';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'aggregate_id', v_aggregate.id,
      'checkout_binding_sha256', v_aggregate.checkout_binding_sha256,
      'checkout_revision', 1,
      'checkout_state', 'finalized',
      'finalization_evidence_sha256', p_finalization_evidence_sha256,
      'previous_receipt_sha256', v_aggregate.latest_state_receipt_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_checkout_evidence_aggregates
     set checkout_state = 'finalized', checkout_revision = 1,
         finalization_evidence_sha256 = p_finalization_evidence_sha256,
         latest_state_receipt_sha256 = v_receipt,
         finalized_at = v_now, updated_at = v_now
   where id = v_aggregate.id
     and checkout_state = 'prepared'
     and checkout_revision = p_expected_revision
  returning * into v_aggregate;
  if not found then
    raise exception 'Flight Consumer Live checkout finalization CAS failed';
  end if;
  insert into public.flight_consumer_live_checkout_evidence_receipts (
    aggregate_id, checkout_revision, receipt_kind, checkout_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_aggregate.id, 1, 'finalized', 'finalized',
    (select receipt_sha256
       from public.flight_consumer_live_checkout_evidence_receipts
      where aggregate_id = v_aggregate.id and checkout_revision = 0),
    v_receipt
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

create function public.abandon_flight_consumer_live_checkout_evidence_v1(
  p_aggregate_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_checkout_binding_sha256 text,
  p_abandonment_code text,
  p_abandonment_evidence_sha256 text
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
as $abandon_flight_consumer_live_checkout_evidence_v1$
declare
  v_aggregate public.flight_consumer_live_checkout_evidence_aggregates;
  v_now timestamptz := clock_timestamp();
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live checkout evidence is service-role only';
  end if;
  if p_aggregate_id is null or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_abandonment_code !~ '^[a-z0-9_]{1,96}$'
    or p_abandonment_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live checkout abandonment is invalid';
  end if;
  select aggregate.* into v_aggregate
    from public.flight_consumer_live_checkout_evidence_aggregates as aggregate
   where aggregate.id = p_aggregate_id
     and aggregate.execution_scope_sha256 = p_execution_scope_sha256
     and aggregate.checkout_binding_sha256 = p_checkout_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live checkout abandonment binding is invalid';
  end if;
  if v_aggregate.checkout_state = 'abandoned'
    and v_aggregate.checkout_revision = 1
    and v_aggregate.abandonment_code = p_abandonment_code
    and v_aggregate.abandonment_evidence_sha256 =
      p_abandonment_evidence_sha256 then
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
    raise exception 'Flight Consumer Live checkout abandonment CAS failed';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:checkout-state-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'abandonment_code', p_abandonment_code,
      'abandonment_evidence_sha256', p_abandonment_evidence_sha256,
      'aggregate_id', v_aggregate.id,
      'checkout_binding_sha256', v_aggregate.checkout_binding_sha256,
      'checkout_revision', 1,
      'checkout_state', 'abandoned',
      'previous_receipt_sha256', v_aggregate.latest_state_receipt_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_checkout_evidence_aggregates
     set checkout_state = 'abandoned', checkout_revision = 1,
         abandonment_code = p_abandonment_code,
         abandonment_evidence_sha256 = p_abandonment_evidence_sha256,
         latest_state_receipt_sha256 = v_receipt,
         abandoned_at = v_now, updated_at = v_now
   where id = v_aggregate.id
     and checkout_state = 'prepared'
     and checkout_revision = p_expected_revision
  returning * into v_aggregate;
  if not found then
    raise exception 'Flight Consumer Live checkout abandonment CAS failed';
  end if;
  insert into public.flight_consumer_live_checkout_evidence_receipts (
    aggregate_id, checkout_revision, receipt_kind, checkout_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_aggregate.id, 1, 'abandoned', 'abandoned',
    (select receipt_sha256
       from public.flight_consumer_live_checkout_evidence_receipts
      where aggregate_id = v_aggregate.id and checkout_revision = 0),
    v_receipt
  );
  return query select
    'abandoned'::text, v_aggregate.id, v_aggregate.checkout_state,
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
$abandon_flight_consumer_live_checkout_evidence_v1$;

alter function public.protect_flight_consumer_live_checkout_evidence_v1()
  owner to postgres;
alter function public.protect_flight_consumer_live_checkout_receipt_v1()
  owner to postgres;
alter function public.prepare_flight_consumer_live_checkout_evidence_v1(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  uuid, text, uuid, text, text, text, text, text, text, bigint, text,
  text, text, text, text, text, text, text, text, timestamptz
) owner to postgres;
alter function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) owner to postgres;
alter function public.abandon_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text, text
) owner to postgres;

revoke all on function
  public.prepare_flight_consumer_live_checkout_evidence_v1(
    uuid, uuid, text, text, text, text, uuid, text, text, text, text,
    uuid, text, uuid, text, text, text, text, text, text, bigint, text,
    text, text, text, text, text, text, text, text, timestamptz
  ) from public, anon, authenticated;
revoke all on function
  public.finalize_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text
  ) from public, anon, authenticated;
revoke all on function
  public.abandon_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text, text
  ) from public, anon, authenticated;

grant execute on function
  public.prepare_flight_consumer_live_checkout_evidence_v1(
    uuid, uuid, text, text, text, text, uuid, text, text, text, text,
    uuid, text, uuid, text, text, text, text, text, text, bigint, text,
    text, text, text, text, text, text, text, text, timestamptz
  ) to service_role;
grant execute on function
  public.finalize_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text
  ) to service_role;
grant execute on function
  public.abandon_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text, text
  ) to service_role;

comment on table public.flight_consumer_live_checkout_evidence_aggregates is
  'Immutable encrypted checkout/traveler/contact/address and digest-only terms evidence bound to one succeeded 105 refresh and one still-prepared 106 Stripe execution; grants no booking or payment authority.';
comment on function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) is
  'Finalizes evidence only while the exact refreshed offer and zero-dispatch Stripe prerequisite remain valid; it grants no dispatch, booking, payment, settlement, ticketing, or release authority.';

commit;
