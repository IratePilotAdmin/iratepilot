begin;

-- Production-dark settlement evidence only. This migration cannot contact
-- Duffel or Stripe, create/capture/refund a payment, create or service an
-- order, issue a ticket, or release a consumer path. It binds an already
-- successful (or successfully reconciled) 108 order to an already successful
-- (or successfully reconciled) 111 capture through the exact immutable 110
-- checkout authorization bridge. "booked" below is an evidence aggregation
-- state, not provider dispatch authority and not proof that a ticket exists.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_checkout_authorization_bridges'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_executions'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_execution_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_capture_attempts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_capture_receipts'
    ) is null
    or to_regprocedure(
      'public.reconcile_flight_consumer_live_duffel_order_execution_v1(uuid,integer,text,text,text,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.reconcile_flight_consumer_live_stripe_capture_v1(uuid,integer,text,text,text,text,integer,text,text,text,text,bigint,text,boolean,text,text,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live booking settlement requires frozen 108, 110, 111, and SHA-256 prerequisites';
  end if;

  if to_regclass(
    'public.flight_consumer_live_booking_settlements'
  ) is not null
    or to_regclass(
      'public.flight_consumer_live_booking_settlement_receipts'
    ) is not null
    or to_regprocedure(
      'public.prepare_flight_consumer_live_booking_settlement_v1(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text)'
    ) is not null
    or to_regprocedure(
      'public.finalize_flight_consumer_live_booking_settlement_v1(uuid,integer,text,text,text)'
    ) is not null then
    raise exception
      'Flight Consumer Live booking settlement object collision refused';
  end if;
end;
$migration$;

create table public.flight_consumer_live_booking_settlements (
  id uuid primary key default gen_random_uuid(),
  checkout_aggregate_id uuid not null unique references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  authorization_bridge_receipt_sha256 text not null unique
    check (authorization_bridge_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  duffel_order_execution_id uuid not null unique references
    public.flight_consumer_live_duffel_order_executions(id)
    on delete restrict,
  duffel_order_state_receipt_sha256 text not null unique
    check (duffel_order_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_capture_attempt_id uuid not null unique references
    public.flight_consumer_live_stripe_capture_attempts(id)
    on delete restrict,
  stripe_capture_state_receipt_sha256 text not null unique
    check (stripe_capture_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),

  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique,
  checkout_binding_sha256 text not null unique
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  offer_binding_sha256 text not null
    check (offer_binding_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_offer_sha256 text not null
    check (normalized_offer_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  duffel_order_execution_binding_sha256 text not null
    check (duffel_order_execution_binding_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_capture_binding_sha256 text not null
    check (stripe_capture_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null unique
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_intent_reference_sha256 text not null unique
    check (payment_intent_reference_sha256 ~ '^[0-9a-f]{64}$'),
  provider_order_reference_sha256 text not null unique
    check (provider_order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  -- Airline PNRs/record locators are support references, not globally unique
  -- Duffel resource identities. Bind them to the exact order envelope without
  -- using them as standalone settlement identity.
  provider_booking_reference_sha256 text not null
    check (provider_booking_reference_sha256 ~ '^[0-9a-f]{64}$'),
  charge_reference_sha256 text not null unique
    check (charge_reference_sha256 ~ '^[0-9a-f]{64}$'),

  captured_amount_cents bigint not null
    check (captured_amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),
  duffel_livemode boolean not null default true check (duffel_livemode),
  stripe_livemode boolean not null default true check (stripe_livemode),
  order_source_state text not null
    check (order_source_state in ('succeeded', 'reconciled')),
  order_source_revision integer not null check (order_source_revision in (2, 3)),
  order_reconciled_outcome text check (
    order_reconciled_outcome is null or order_reconciled_outcome = 'succeeded'
  ),
  capture_source_state text not null
    check (capture_source_state in ('succeeded', 'reconciled')),
  capture_source_revision integer not null
    check (capture_source_revision in (2, 3)),
  capture_reconciled_outcome text check (
    capture_reconciled_outcome is null
    or capture_reconciled_outcome = 'succeeded'
  ),
  order_terminal_at timestamptz not null,
  capture_terminal_at timestamptz not null,

  booking_binding_sha256 text not null unique
    check (booking_binding_sha256 ~ '^[0-9a-f]{64}$'),
  booking_prerequisite_sha256 text not null
    check (booking_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  settlement_evidence_sha256 text not null unique
    check (settlement_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  final_booking_evidence_sha256 text unique check (
    final_booking_evidence_sha256 is null
    or final_booking_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  booking_state text not null default 'prepared'
    check (booking_state in ('prepared', 'booked')),
  booking_revision integer not null default 0
    check (booking_revision in (0, 1)),

  -- Ticketing is deliberately separate. Neither order creation nor payment
  -- capture proves issuance. A future reviewed ticket-evidence migration must
  -- own any transition away from pending.
  ticketing_state text not null default 'pending'
    check (ticketing_state = 'pending'),
  ticket_evidence_sha256 text check (ticket_evidence_sha256 is null),
  ticket_issued_at timestamptz check (ticket_issued_at is null),
  ticket_count integer not null default 0 check (ticket_count = 0),

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
  servicing_request_count integer not null default 0
    check (servicing_request_count = 0),
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
  booked_at timestamptz,
  check (order_reference_sha256 <> customer_reference_sha256),
  check (
    provider_order_reference_sha256 <> provider_booking_reference_sha256
  ),
  check (
    charge_reference_sha256 not in (
      payment_intent_reference_sha256,
      provider_order_reference_sha256,
      provider_booking_reference_sha256
    )
  ),
  check (
    booking_binding_sha256 not in (
      booking_prerequisite_sha256,
      settlement_evidence_sha256
    )
  ),
  check (booking_prerequisite_sha256 <> settlement_evidence_sha256),
  check (order_terminal_at <= prepared_at),
  check (capture_terminal_at <= prepared_at),
  check (updated_at >= prepared_at),
  check (
    (order_source_state = 'succeeded'
      and order_source_revision = 2
      and order_reconciled_outcome is null)
    or
    (order_source_state = 'reconciled'
      and order_source_revision = 3
      and order_reconciled_outcome = 'succeeded')
  ),
  check (
    (capture_source_state = 'succeeded'
      and capture_source_revision = 2
      and capture_reconciled_outcome is null)
    or
    (capture_source_state = 'reconciled'
      and capture_source_revision = 3
      and capture_reconciled_outcome = 'succeeded')
  ),
  check (
    (booking_state = 'prepared'
      and booking_revision = 0
      and final_booking_evidence_sha256 is null
      and booked_at is null)
    or
    (booking_state = 'booked'
      and booking_revision = 1
      and final_booking_evidence_sha256 is not null
      and booked_at is not null
      and booked_at >= prepared_at)
  )
);

create table public.flight_consumer_live_booking_settlement_receipts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references
    public.flight_consumer_live_booking_settlements(id)
    on delete restrict,
  booking_revision integer not null check (booking_revision in (0, 1)),
  receipt_kind text not null check (receipt_kind in ('prepared', 'booked')),
  booking_state text not null check (booking_state = receipt_kind),
  previous_receipt_sha256 text check (
    previous_receipt_sha256 is null
    or previous_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  receipt_sha256 text not null unique
    check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (settlement_id, booking_revision),
  check (
    (booking_revision = 0
      and receipt_kind = 'prepared'
      and previous_receipt_sha256 is null)
    or
    (booking_revision = 1
      and receipt_kind = 'booked'
      and previous_receipt_sha256 is not null)
  )
);

alter table public.flight_consumer_live_booking_settlements
  enable row level security;
alter table public.flight_consumer_live_booking_settlements
  force row level security;
alter table public.flight_consumer_live_booking_settlement_receipts
  enable row level security;
alter table public.flight_consumer_live_booking_settlement_receipts
  force row level security;

revoke all on table
  public.flight_consumer_live_booking_settlements,
  public.flight_consumer_live_booking_settlement_receipts
from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_booking_settlement_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_booking_settlement_v1$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight Consumer Live booking settlement is immutable';
  end if;

  if (
    to_jsonb(new)
      - 'booking_state' - 'booking_revision'
      - 'final_booking_evidence_sha256'
      - 'latest_state_receipt_sha256' - 'updated_at' - 'booked_at'
  ) is distinct from (
    to_jsonb(old)
      - 'booking_state' - 'booking_revision'
      - 'final_booking_evidence_sha256'
      - 'latest_state_receipt_sha256' - 'updated_at' - 'booked_at'
  ) then
    raise exception 'Flight Consumer Live booking settlement binding is immutable';
  end if;

  if not (
    old.booking_state = 'prepared'
    and old.booking_revision = 0
    and new.booking_state = 'booked'
    and new.booking_revision = 1
  ) then
    raise exception 'Flight Consumer Live booking settlement transition refused';
  end if;
  return new;
end;
$protect_flight_consumer_live_booking_settlement_v1$;

create trigger flight_consumer_live_booking_settlement_transition_guard
before update or delete
on public.flight_consumer_live_booking_settlements
for each row execute function
  public.protect_flight_consumer_live_booking_settlement_v1();

create function public.protect_flight_consumer_live_booking_settlement_receipt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_live_booking_settlement_receipt_v1$
begin
  raise exception 'Flight Consumer Live booking settlement receipts are append-only';
end;
$protect_flight_consumer_live_booking_settlement_receipt_v1$;

create trigger flight_consumer_live_booking_settlement_receipt_guard
before update or delete
on public.flight_consumer_live_booking_settlement_receipts
for each row execute function
  public.protect_flight_consumer_live_booking_settlement_receipt_v1();

create function public.prepare_flight_consumer_live_booking_settlement_v1(
  p_checkout_aggregate_id uuid,
  p_authorization_bridge_receipt_sha256 text,
  p_duffel_order_execution_id uuid,
  p_duffel_order_state_receipt_sha256 text,
  p_stripe_capture_attempt_id uuid,
  p_stripe_capture_state_receipt_sha256 text,
  p_checkout_binding_sha256 text,
  p_offer_binding_sha256 text,
  p_normalized_offer_sha256 text,
  p_payment_binding_sha256 text,
  p_payment_intent_reference_sha256 text,
  p_provider_order_reference_sha256 text,
  p_provider_booking_reference_sha256 text,
  p_charge_reference_sha256 text,
  p_order_reference_sha256 text,
  p_customer_reference_sha256 text,
  p_booking_binding_sha256 text,
  p_booking_prerequisite_sha256 text,
  p_settlement_evidence_sha256 text,
  p_captured_amount_cents bigint,
  p_currency text
)
returns table (
  decision text,
  settlement_id uuid,
  booking_state text,
  booking_revision integer,
  ticketing_state text,
  checkout_binding_sha256 text,
  offer_binding_sha256 text,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  charge_reference_sha256 text,
  captured_amount_cents bigint,
  currency text,
  duffel_livemode boolean,
  stripe_livemode boolean,
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
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_live_booking_settlement_v1$
declare
  v_bridge public.flight_consumer_live_checkout_authorization_bridges;
  v_order public.flight_consumer_live_duffel_order_executions;
  v_capture public.flight_consumer_live_stripe_capture_attempts;
  v_settlement public.flight_consumer_live_booking_settlements;
  v_settlement_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_receipt text;
  v_match_count bigint;
  v_exact_match boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live booking settlement is service-role only';
  end if;
  if p_checkout_aggregate_id is null
    or p_duffel_order_execution_id is null
    or p_stripe_capture_attempt_id is null
    or p_authorization_bridge_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_duffel_order_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_capture_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_normalized_offer_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_intent_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_booking_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_charge_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_customer_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_booking_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_booking_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_settlement_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_captured_amount_cents not between 50 and 99999999
    or p_currency is distinct from 'USD'
    or p_order_reference_sha256 = p_customer_reference_sha256
    or p_provider_order_reference_sha256 =
      p_provider_booking_reference_sha256
    or p_charge_reference_sha256 in (
      p_payment_intent_reference_sha256,
      p_provider_order_reference_sha256,
      p_provider_booking_reference_sha256
    )
    or p_booking_binding_sha256 in (
      p_booking_prerequisite_sha256,
      p_settlement_evidence_sha256
    )
    or p_booking_prerequisite_sha256 = p_settlement_evidence_sha256 then
    raise exception 'Flight Consumer Live booking settlement envelope is invalid';
  end if;

  -- Resolve durable identity first. Exact replays remain observable without
  -- synthesizing another aggregate; any overlap with different bytes fails.
  select count(*), coalesce(bool_and(row(
    settlement.checkout_aggregate_id,
    settlement.authorization_bridge_receipt_sha256,
    settlement.duffel_order_execution_id,
    settlement.duffel_order_state_receipt_sha256,
    settlement.stripe_capture_attempt_id,
    settlement.stripe_capture_state_receipt_sha256,
    settlement.checkout_binding_sha256,
    settlement.offer_binding_sha256,
    settlement.normalized_offer_sha256,
    settlement.payment_binding_sha256,
    settlement.payment_intent_reference_sha256,
    settlement.provider_order_reference_sha256,
    settlement.provider_booking_reference_sha256,
    settlement.charge_reference_sha256,
    settlement.order_reference_sha256,
    settlement.customer_reference_sha256,
    settlement.booking_binding_sha256,
    settlement.booking_prerequisite_sha256,
    settlement.settlement_evidence_sha256,
    settlement.captured_amount_cents,
    settlement.currency
  ) = row(
    p_checkout_aggregate_id, p_authorization_bridge_receipt_sha256,
    p_duffel_order_execution_id, p_duffel_order_state_receipt_sha256,
    p_stripe_capture_attempt_id, p_stripe_capture_state_receipt_sha256,
    p_checkout_binding_sha256, p_offer_binding_sha256,
    p_normalized_offer_sha256, p_payment_binding_sha256,
    p_payment_intent_reference_sha256,
    p_provider_order_reference_sha256,
    p_provider_booking_reference_sha256, p_charge_reference_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_booking_binding_sha256, p_booking_prerequisite_sha256,
    p_settlement_evidence_sha256, p_captured_amount_cents, p_currency
  )), false)
    into v_match_count, v_exact_match
    from public.flight_consumer_live_booking_settlements as settlement
   where settlement.checkout_aggregate_id = p_checkout_aggregate_id
      or settlement.duffel_order_execution_id = p_duffel_order_execution_id
      or settlement.stripe_capture_attempt_id = p_stripe_capture_attempt_id
      or settlement.checkout_binding_sha256 = p_checkout_binding_sha256
      or settlement.payment_intent_reference_sha256 =
        p_payment_intent_reference_sha256
      or settlement.provider_order_reference_sha256 =
        p_provider_order_reference_sha256
      or settlement.charge_reference_sha256 = p_charge_reference_sha256
      or settlement.order_reference_sha256 = p_order_reference_sha256
      or settlement.booking_binding_sha256 = p_booking_binding_sha256
      or settlement.settlement_evidence_sha256 =
        p_settlement_evidence_sha256;
  if v_match_count > 0 then
    if v_match_count <> 1 or not v_exact_match then
      raise exception 'Flight Consumer Live booking settlement collision refused';
    end if;
    select settlement.* into v_settlement
      from public.flight_consumer_live_booking_settlements as settlement
     where settlement.checkout_aggregate_id = p_checkout_aggregate_id;
    return query select
      'replay'::text, v_settlement.id, v_settlement.booking_state,
      v_settlement.booking_revision, v_settlement.ticketing_state,
      v_settlement.checkout_binding_sha256,
      v_settlement.offer_binding_sha256,
      v_settlement.payment_intent_reference_sha256,
      v_settlement.provider_order_reference_sha256,
      v_settlement.provider_booking_reference_sha256,
      v_settlement.charge_reference_sha256,
      v_settlement.captured_amount_cents, v_settlement.currency,
      v_settlement.duffel_livemode, v_settlement.stripe_livemode,
      v_settlement.latest_state_receipt_sha256,
      v_settlement.provider_dispatch_authorized,
      v_settlement.stripe_dispatch_authorized,
      v_settlement.booking_authorized, v_settlement.order_authorized,
      v_settlement.payment_authorized, v_settlement.capture_authorized,
      v_settlement.refund_authorized,
      v_settlement.settlement_authorized,
      v_settlement.ticketing_authorized,
      v_settlement.servicing_authorized,
      v_settlement.consumer_release_enabled,
      v_settlement.blind_retry_authorized;
    return;
  end if;

  select bridge.* into v_bridge
    from public.flight_consumer_live_checkout_authorization_bridges as bridge
   where bridge.checkout_aggregate_id = p_checkout_aggregate_id
     and bridge.authorization_bridge_receipt_sha256 =
       p_authorization_bridge_receipt_sha256
     and bridge.checkout_binding_sha256 = p_checkout_binding_sha256
     and bridge.payment_binding_sha256 = p_payment_binding_sha256
     and bridge.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     and bridge.order_reference_sha256 = p_order_reference_sha256
     and bridge.customer_reference_sha256 = p_customer_reference_sha256
     and bridge.amount_cents = p_captured_amount_cents
     and bridge.currency = p_currency;
  if not found then
    raise exception 'Flight Consumer Live booking settlement bridge is invalid';
  end if;

  select execution.* into v_order
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_duffel_order_execution_id
     and execution.checkout_evidence_aggregate_id = p_checkout_aggregate_id
     and execution.checkout_binding_sha256 = p_checkout_binding_sha256
     and execution.offer_binding_sha256 = p_offer_binding_sha256
     and execution.normalized_offer_sha256 = p_normalized_offer_sha256
     and execution.latest_state_receipt_sha256 =
       p_duffel_order_state_receipt_sha256
     and execution.provider_order_reference_sha256 =
       p_provider_order_reference_sha256
     and execution.provider_booking_reference_sha256 =
       p_provider_booking_reference_sha256
     and execution.provider_order_reference_ciphertext is not null
     and execution.provider_booking_reference_ciphertext is not null
     and execution.order_reference_sha256 = p_order_reference_sha256
     and execution.customer_reference_sha256 = p_customer_reference_sha256
     and execution.amount_cents = p_captured_amount_cents
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
     )
   for key share;
  if not found or not exists (
    select 1
      from public.flight_consumer_live_duffel_order_execution_receipts
        as receipt
     where receipt.attempt_id = v_order.id
       and receipt.attempt_revision = v_order.attempt_revision
       and receipt.attempt_state = v_order.attempt_state
       and receipt.receipt_sha256 = p_duffel_order_state_receipt_sha256
  ) then
    raise exception 'Flight Consumer Live booking settlement order evidence is invalid';
  end if;

  select capture.* into v_capture
    from public.flight_consumer_live_stripe_capture_attempts as capture
   where capture.id = p_stripe_capture_attempt_id
     and capture.checkout_aggregate_id = p_checkout_aggregate_id
     and capture.authorization_bridge_receipt_sha256 =
       p_authorization_bridge_receipt_sha256
     and capture.duffel_order_execution_id = p_duffel_order_execution_id
     and capture.duffel_order_state_receipt_sha256 =
       p_duffel_order_state_receipt_sha256
     and capture.checkout_binding_sha256 = p_checkout_binding_sha256
     and capture.payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     and capture.provider_order_reference_sha256 =
       p_provider_order_reference_sha256
     and capture.charge_reference_sha256 = p_charge_reference_sha256
     and capture.latest_state_receipt_sha256 =
       p_stripe_capture_state_receipt_sha256
     and capture.order_reference_sha256 = p_order_reference_sha256
     and capture.customer_reference_sha256 = p_customer_reference_sha256
     and capture.amount_cents = p_captured_amount_cents
     and capture.currency = p_currency
     and capture.livemode
     and capture.observed_payment_intent_status = 'succeeded'
     and capture.observed_payment_intent_reference_sha256 =
       p_payment_intent_reference_sha256
     and capture.observed_amount_received_cents = p_captured_amount_cents
     and capture.observed_currency = lower(p_currency)
     and capture.observed_livemode
     and capture.observed_capture_method = 'manual'
     and capture.stripe_capture_request_count = 1
     and capture.stripe_mutation_count = 1
     and capture.external_capture_request_made
     and (
       (capture.attempt_state = 'succeeded'
         and capture.attempt_revision = 2
         and capture.reconciliation_outcome is null)
       or
       (capture.attempt_state = 'reconciled'
         and capture.attempt_revision = 3
         and capture.reconciliation_outcome = 'succeeded'
         and capture.stripe_retrieval_request_count = 1)
     )
   for key share;
  if not found or not exists (
    select 1
      from public.flight_consumer_live_stripe_capture_receipts as receipt
     where receipt.attempt_id = v_capture.id
       and receipt.attempt_revision = v_capture.attempt_revision
       and receipt.attempt_state = v_capture.attempt_state
       and receipt.receipt_sha256 = p_stripe_capture_state_receipt_sha256
  ) then
    raise exception 'Flight Consumer Live booking settlement capture evidence is invalid';
  end if;

  -- Refresh trusted time after both terminal source locks and their receipt
  -- reads. Neither source may appear to complete in the future, and the
  -- aggregate cannot predate either terminal outcome.
  v_now := clock_timestamp();
  if coalesce(v_order.reconciled_at, v_order.completed_at) is null
    or coalesce(v_capture.reconciled_at, v_capture.completed_at) is null
    or coalesce(v_order.reconciled_at, v_order.completed_at) > v_now
    or coalesce(v_capture.reconciled_at, v_capture.completed_at) > v_now
    or v_bridge.finalized_at > v_now then
    raise exception 'Flight Consumer Live booking settlement chronology refused';
  end if;

  -- Recheck collision under the source locks before the unique insert.
  perform 1
    from public.flight_consumer_live_booking_settlements as settlement
   where settlement.checkout_aggregate_id = p_checkout_aggregate_id
      or settlement.duffel_order_execution_id = p_duffel_order_execution_id
      or settlement.stripe_capture_attempt_id = p_stripe_capture_attempt_id
      or settlement.booking_binding_sha256 = p_booking_binding_sha256;
  if found then
    raise exception 'Flight Consumer Live booking settlement concurrent collision refused';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:booking-settlement-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'booking_binding_sha256', p_booking_binding_sha256,
      'booking_revision', 0,
      'booking_state', 'prepared',
      'charge_reference_sha256', p_charge_reference_sha256,
      'duffel_order_state_receipt_sha256',
        p_duffel_order_state_receipt_sha256,
      'payment_intent_reference_sha256',
        p_payment_intent_reference_sha256,
      'previous_receipt_sha256', null,
      'provider_booking_reference_sha256',
        p_provider_booking_reference_sha256,
      'provider_order_reference_sha256',
        p_provider_order_reference_sha256,
      'settlement_evidence_sha256', p_settlement_evidence_sha256,
      'settlement_id', v_settlement_id,
      'stripe_capture_state_receipt_sha256',
        p_stripe_capture_state_receipt_sha256,
      'ticketing_state', 'pending'
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_booking_settlements (
    id, checkout_aggregate_id, authorization_bridge_receipt_sha256,
    duffel_order_execution_id, duffel_order_state_receipt_sha256,
    stripe_capture_attempt_id, stripe_capture_state_receipt_sha256,
    customer_id, order_id, checkout_binding_sha256,
    offer_binding_sha256, normalized_offer_sha256,
    payment_binding_sha256, duffel_order_execution_binding_sha256,
    stripe_capture_binding_sha256,
    order_reference_sha256, customer_reference_sha256,
    payment_intent_reference_sha256,
    provider_order_reference_sha256,
    provider_booking_reference_sha256, charge_reference_sha256,
    captured_amount_cents, currency,
    order_source_state, order_source_revision, order_reconciled_outcome,
    capture_source_state, capture_source_revision,
    capture_reconciled_outcome, order_terminal_at, capture_terminal_at,
    booking_binding_sha256, booking_prerequisite_sha256,
    settlement_evidence_sha256, latest_state_receipt_sha256,
    prepared_at, updated_at
  ) values (
    v_settlement_id, p_checkout_aggregate_id,
    p_authorization_bridge_receipt_sha256,
    p_duffel_order_execution_id, p_duffel_order_state_receipt_sha256,
    p_stripe_capture_attempt_id, p_stripe_capture_state_receipt_sha256,
    v_bridge.customer_id, v_bridge.order_id, p_checkout_binding_sha256,
    p_offer_binding_sha256, p_normalized_offer_sha256,
    p_payment_binding_sha256, v_order.order_execution_binding_sha256,
    v_capture.capture_binding_sha256,
    p_order_reference_sha256, p_customer_reference_sha256,
    p_payment_intent_reference_sha256,
    p_provider_order_reference_sha256,
    p_provider_booking_reference_sha256, p_charge_reference_sha256,
    p_captured_amount_cents, p_currency,
    v_order.attempt_state, v_order.attempt_revision,
    v_order.reconciliation_outcome,
    v_capture.attempt_state, v_capture.attempt_revision,
    v_capture.reconciliation_outcome,
    coalesce(v_order.reconciled_at, v_order.completed_at),
    coalesce(v_capture.reconciled_at, v_capture.completed_at),
    p_booking_binding_sha256, p_booking_prerequisite_sha256,
    p_settlement_evidence_sha256, v_receipt, v_now, v_now
  ) returning * into v_settlement;

  insert into public.flight_consumer_live_booking_settlement_receipts (
    settlement_id, booking_revision, receipt_kind, booking_state,
    previous_receipt_sha256, receipt_sha256, recorded_at
  ) values (
    v_settlement.id, 0, 'prepared', 'prepared', null, v_receipt, v_now
  );

  return query select
    'created'::text, v_settlement.id, v_settlement.booking_state,
    v_settlement.booking_revision, v_settlement.ticketing_state,
    v_settlement.checkout_binding_sha256,
    v_settlement.offer_binding_sha256,
    v_settlement.payment_intent_reference_sha256,
    v_settlement.provider_order_reference_sha256,
    v_settlement.provider_booking_reference_sha256,
    v_settlement.charge_reference_sha256,
    v_settlement.captured_amount_cents, v_settlement.currency,
    v_settlement.duffel_livemode, v_settlement.stripe_livemode,
    v_settlement.latest_state_receipt_sha256,
    v_settlement.provider_dispatch_authorized,
    v_settlement.stripe_dispatch_authorized,
    v_settlement.booking_authorized, v_settlement.order_authorized,
    v_settlement.payment_authorized, v_settlement.capture_authorized,
    v_settlement.refund_authorized,
    v_settlement.settlement_authorized,
    v_settlement.ticketing_authorized,
    v_settlement.servicing_authorized,
    v_settlement.consumer_release_enabled,
    v_settlement.blind_retry_authorized;
end;
$prepare_flight_consumer_live_booking_settlement_v1$;

create function public.finalize_flight_consumer_live_booking_settlement_v1(
  p_settlement_id uuid,
  p_expected_revision integer,
  p_booking_binding_sha256 text,
  p_prepared_receipt_sha256 text,
  p_final_booking_evidence_sha256 text
)
returns table (
  decision text,
  settlement_id uuid,
  booking_state text,
  booking_revision integer,
  ticketing_state text,
  checkout_binding_sha256 text,
  offer_binding_sha256 text,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  charge_reference_sha256 text,
  captured_amount_cents bigint,
  currency text,
  duffel_livemode boolean,
  stripe_livemode boolean,
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
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $finalize_flight_consumer_live_booking_settlement_v1$
declare
  v_settlement public.flight_consumer_live_booking_settlements;
  v_order public.flight_consumer_live_duffel_order_executions;
  v_capture public.flight_consumer_live_stripe_capture_attempts;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live booking settlement finalization is service-role only';
  end if;
  if p_settlement_id is null
    or p_expected_revision is distinct from 0
    or p_booking_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_prepared_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_final_booking_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_final_booking_evidence_sha256 = p_prepared_receipt_sha256 then
    raise exception 'Flight Consumer Live booking settlement finalization is invalid';
  end if;

  select settlement.* into v_settlement
    from public.flight_consumer_live_booking_settlements as settlement
   where settlement.id = p_settlement_id
     and settlement.booking_binding_sha256 = p_booking_binding_sha256
   for update;
  if not found then
    raise exception 'Flight Consumer Live booking settlement binding is invalid';
  end if;

  if p_final_booking_evidence_sha256 in (
    v_settlement.booking_binding_sha256,
    v_settlement.booking_prerequisite_sha256,
    v_settlement.settlement_evidence_sha256
  ) then
    raise exception 'Flight Consumer Live booking settlement final evidence domain is invalid';
  end if;

  if v_settlement.booking_state = 'booked'
    and v_settlement.booking_revision = 1
    and v_settlement.final_booking_evidence_sha256 =
      p_final_booking_evidence_sha256
    and exists (
      select 1
        from public.flight_consumer_live_booking_settlement_receipts
          as receipt
       where receipt.settlement_id = v_settlement.id
         and receipt.booking_revision = 0
         and receipt.booking_state = 'prepared'
         and receipt.receipt_sha256 = p_prepared_receipt_sha256
    ) then
    return query select
      'replay'::text, v_settlement.id, v_settlement.booking_state,
      v_settlement.booking_revision, v_settlement.ticketing_state,
      v_settlement.checkout_binding_sha256,
      v_settlement.offer_binding_sha256,
      v_settlement.payment_intent_reference_sha256,
      v_settlement.provider_order_reference_sha256,
      v_settlement.provider_booking_reference_sha256,
      v_settlement.charge_reference_sha256,
      v_settlement.captured_amount_cents, v_settlement.currency,
      v_settlement.duffel_livemode, v_settlement.stripe_livemode,
      v_settlement.latest_state_receipt_sha256,
      v_settlement.provider_dispatch_authorized,
      v_settlement.stripe_dispatch_authorized,
      v_settlement.booking_authorized, v_settlement.order_authorized,
      v_settlement.payment_authorized, v_settlement.capture_authorized,
      v_settlement.refund_authorized,
      v_settlement.settlement_authorized,
      v_settlement.ticketing_authorized,
      v_settlement.servicing_authorized,
      v_settlement.consumer_release_enabled,
      v_settlement.blind_retry_authorized;
    return;
  end if;

  if v_settlement.booking_state <> 'prepared'
    or v_settlement.booking_revision <> p_expected_revision
    or v_settlement.latest_state_receipt_sha256 <>
      p_prepared_receipt_sha256
    or not exists (
      select 1
        from public.flight_consumer_live_booking_settlement_receipts
          as receipt
       where receipt.settlement_id = v_settlement.id
         and receipt.booking_revision = 0
         and receipt.booking_state = 'prepared'
         and receipt.receipt_sha256 = p_prepared_receipt_sha256
    ) then
    raise exception 'Flight Consumer Live booking settlement finalization CAS refused';
  end if;

  select execution.* into v_order
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = v_settlement.duffel_order_execution_id
     and execution.latest_state_receipt_sha256 =
       v_settlement.duffel_order_state_receipt_sha256
     and execution.provider_order_reference_sha256 =
       v_settlement.provider_order_reference_sha256
     and execution.provider_booking_reference_sha256 =
       v_settlement.provider_booking_reference_sha256
     and execution.order_execution_binding_sha256 =
       v_settlement.duffel_order_execution_binding_sha256
     and execution.attempt_state = v_settlement.order_source_state
     and execution.attempt_revision = v_settlement.order_source_revision
     and execution.reconciliation_outcome is not distinct from
       v_settlement.order_reconciled_outcome
   for key share;
  if not found or not exists (
    select 1
      from public.flight_consumer_live_duffel_order_execution_receipts
        as receipt
     where receipt.attempt_id = v_order.id
       and receipt.attempt_revision = v_order.attempt_revision
       and receipt.receipt_sha256 =
         v_settlement.duffel_order_state_receipt_sha256
  ) then
    raise exception 'Flight Consumer Live booking settlement order recheck refused';
  end if;

  select capture.* into v_capture
    from public.flight_consumer_live_stripe_capture_attempts as capture
   where capture.id = v_settlement.stripe_capture_attempt_id
     and capture.latest_state_receipt_sha256 =
       v_settlement.stripe_capture_state_receipt_sha256
     and capture.capture_binding_sha256 =
       v_settlement.stripe_capture_binding_sha256
     and capture.payment_intent_reference_sha256 =
       v_settlement.payment_intent_reference_sha256
     and capture.charge_reference_sha256 =
       v_settlement.charge_reference_sha256
     and capture.attempt_state = v_settlement.capture_source_state
     and capture.attempt_revision = v_settlement.capture_source_revision
     and capture.reconciliation_outcome is not distinct from
       v_settlement.capture_reconciled_outcome
   for key share;
  if not found or not exists (
    select 1
      from public.flight_consumer_live_stripe_capture_receipts as receipt
     where receipt.attempt_id = v_capture.id
       and receipt.attempt_revision = v_capture.attempt_revision
       and receipt.receipt_sha256 =
         v_settlement.stripe_capture_state_receipt_sha256
  ) then
    raise exception 'Flight Consumer Live booking settlement capture recheck refused';
  end if;

  -- The aggregate/source locks may block. Timestamp only after every CAS and
  -- exact source recheck so booked_at cannot predate prepared or terminal data.
  v_now := clock_timestamp();
  if v_now < v_settlement.prepared_at
    or v_now < v_settlement.order_terminal_at
    or v_now < v_settlement.capture_terminal_at then
    raise exception 'Flight Consumer Live booking settlement finalization chronology refused';
  end if;

  v_previous_receipt := v_settlement.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:booking-settlement-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'booking_binding_sha256', v_settlement.booking_binding_sha256,
      'booking_revision', 1,
      'booking_state', 'booked',
      'charge_reference_sha256', v_settlement.charge_reference_sha256,
      'final_booking_evidence_sha256', p_final_booking_evidence_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'provider_booking_reference_sha256',
        v_settlement.provider_booking_reference_sha256,
      'provider_order_reference_sha256',
        v_settlement.provider_order_reference_sha256,
      'settlement_id', v_settlement.id,
      'ticketing_state', 'pending'
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_booking_settlements as settlement
     set booking_state = 'booked', booking_revision = 1,
         final_booking_evidence_sha256 = p_final_booking_evidence_sha256,
         latest_state_receipt_sha256 = v_receipt,
         booked_at = v_now, updated_at = v_now
   where settlement.id = v_settlement.id
     and settlement.booking_state = 'prepared'
     and settlement.booking_revision = p_expected_revision
     and settlement.latest_state_receipt_sha256 = p_prepared_receipt_sha256
  returning settlement.* into v_settlement;
  if not found then
    raise exception 'Flight Consumer Live booking settlement finalization CAS refused';
  end if;

  insert into public.flight_consumer_live_booking_settlement_receipts (
    settlement_id, booking_revision, receipt_kind, booking_state,
    previous_receipt_sha256, receipt_sha256, recorded_at
  ) values (
    v_settlement.id, 1, 'booked', 'booked',
    v_previous_receipt, v_receipt, v_now
  );

  return query select
    'booked'::text, v_settlement.id, v_settlement.booking_state,
    v_settlement.booking_revision, v_settlement.ticketing_state,
    v_settlement.checkout_binding_sha256,
    v_settlement.offer_binding_sha256,
    v_settlement.payment_intent_reference_sha256,
    v_settlement.provider_order_reference_sha256,
    v_settlement.provider_booking_reference_sha256,
    v_settlement.charge_reference_sha256,
    v_settlement.captured_amount_cents, v_settlement.currency,
    v_settlement.duffel_livemode, v_settlement.stripe_livemode,
    v_settlement.latest_state_receipt_sha256,
    v_settlement.provider_dispatch_authorized,
    v_settlement.stripe_dispatch_authorized,
    v_settlement.booking_authorized, v_settlement.order_authorized,
    v_settlement.payment_authorized, v_settlement.capture_authorized,
    v_settlement.refund_authorized,
    v_settlement.settlement_authorized,
    v_settlement.ticketing_authorized,
    v_settlement.servicing_authorized,
    v_settlement.consumer_release_enabled,
    v_settlement.blind_retry_authorized;
end;
$finalize_flight_consumer_live_booking_settlement_v1$;

alter function public.protect_flight_consumer_live_booking_settlement_v1()
  owner to postgres;
alter function public.protect_flight_consumer_live_booking_settlement_receipt_v1()
  owner to postgres;
alter function public.prepare_flight_consumer_live_booking_settlement_v1(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, bigint, text
) owner to postgres;
alter function public.finalize_flight_consumer_live_booking_settlement_v1(
  uuid, integer, text, text, text
) owner to postgres;

revoke all on function
  public.protect_flight_consumer_live_booking_settlement_v1()
from public, anon, authenticated, service_role;
revoke all on function
  public.protect_flight_consumer_live_booking_settlement_receipt_v1()
from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_live_booking_settlement_v1(
    uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, text, text, text, bigint, text
  )
from public, anon, authenticated, service_role;
revoke all on function
  public.finalize_flight_consumer_live_booking_settlement_v1(
    uuid, integer, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.prepare_flight_consumer_live_booking_settlement_v1(
    uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, text, text, text, bigint, text
  )
to service_role;
grant execute on function
  public.finalize_flight_consumer_live_booking_settlement_v1(
    uuid, integer, text, text, text
  )
to service_role;

comment on table public.flight_consumer_live_booking_settlements is
  'Dark immutable binding of exact 108 order and exact 111 captured-payment evidence; booked is evidence-only and ticketing stays pending.';
comment on function public.prepare_flight_consumer_live_booking_settlement_v1(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, bigint, text
) is
  'Creates or replays one zero-authority booking settlement aggregate from exact terminal 108/110/111 evidence.';
comment on function public.finalize_flight_consumer_live_booking_settlement_v1(
  uuid, integer, text, text, text
) is
  'CAS-finalizes evidence state to booked while leaving ticketing pending and granting no operational authority.';

commit;
