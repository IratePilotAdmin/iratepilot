begin;

-- Production-dark persistence prerequisite only. This journal cannot call
-- Duffel, authorize a booking, move money, issue a ticket, service an order,
-- or expose a consumer booking path. A future separately authorized adapter
-- may record at most one POST /air/orders outcome through these RPCs, but only
-- after it requires the separately frozen 109 authorized-requires-capture
-- evidence gate and rechecks dispatch_not_after plus offer expiry immediately
-- before transport. A successful claim alone grants no dispatch authority.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_duffel_offer_refresh_attempts'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_checkout_evidence_aggregates'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(uuid,integer,text,text,text,text,integer,text,integer,text,text,bigint,timestamp with time zone,timestamp with time zone,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_live_checkout_evidence_v1(uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Duffel order execution requires reviewed 105 refresh, 107 checkout, and SHA-256 prerequisites';
  end if;
end;
$migration$;

create table public.flight_consumer_live_duffel_order_executions (
  id uuid primary key default gen_random_uuid(),
  checkout_evidence_aggregate_id uuid not null unique references
    public.flight_consumer_live_checkout_evidence_aggregates(id)
    on delete restrict,
  checkout_execution_scope_sha256 text not null
    check (checkout_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_binding_sha256 text not null
    check (checkout_binding_sha256 ~ '^[0-9a-f]{64}$'),
  checkout_state_receipt_sha256 text not null
    check (checkout_state_receipt_sha256 ~ '^[0-9a-f]{64}$'),
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
  order_reference_sha256 text not null unique
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  currency text not null default 'USD' check (currency = 'USD'),

  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  order_execution_binding_sha256 text not null unique
    check (order_execution_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_execution_prerequisite_sha256 text not null
    check (order_execution_prerequisite_sha256 ~ '^[0-9a-f]{64}$'),
  order_request_sha256 text not null
    check (order_request_sha256 ~ '^[0-9a-f]{64}$'),
  operation text not null default 'create_air_order'
    check (operation = 'create_air_order'),
  provider_environment text not null default 'duffel_live'
    check (provider_environment = 'duffel_live'),
  livemode boolean not null default true check (livemode),
  dispatch_not_after timestamptz not null,

  attempt_state text not null default 'prepared' check (
    attempt_state in (
      'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous',
      'reconciled'
    )
  ),
  attempt_revision integer not null default 0
    check (attempt_revision between 0 and 3),
  dispatch_token_sha256 text
    check (
      dispatch_token_sha256 is null
      or dispatch_token_sha256 ~ '^[0-9a-f]{64}$'
    ),
  dispatch_started_at timestamptz,

  provider_request_count integer not null default 0
    check (provider_request_count in (0, 1)),
  -- This count is specifically POST /air/orders, not a generic provider call.
  air_orders_post_count integer not null default 0
    check (air_orders_post_count in (0, 1)),
  external_request_made boolean not null default false,
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
  provider_order_reference_ciphertext text check (
    provider_order_reference_ciphertext is null
    or (
      char_length(provider_order_reference_ciphertext) <= 4096
      and provider_order_reference_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
    )
  ),
  provider_order_reference_sha256 text unique check (
    provider_order_reference_sha256 is null
    or provider_order_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  provider_booking_reference_ciphertext text check (
    provider_booking_reference_ciphertext is null
    or (
      char_length(provider_booking_reference_ciphertext) <= 4096
      and provider_booking_reference_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
    )
  ),
  provider_booking_reference_sha256 text check (
    provider_booking_reference_sha256 is null
    or provider_booking_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  completion_evidence_sha256 text check (
    completion_evidence_sha256 is null
    or completion_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ambiguity_evidence_sha256 text check (
    ambiguity_evidence_sha256 is null
    or ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  reconciliation_outcome text check (
    reconciliation_outcome is null
    or reconciliation_outcome in ('succeeded', 'failed')
  ),
  reconciliation_response_sha256 text check (
    reconciliation_response_sha256 is null
    or reconciliation_response_sha256 ~ '^[0-9a-f]{64}$'
  ),
  reconciliation_evidence_sha256 text check (
    reconciliation_evidence_sha256 is null
    or reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),

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
  check (provider_request_count = air_orders_post_count),
  check (dispatch_not_after > prepared_at),
  check (offer_expires_at > dispatch_not_after),
  check (updated_at >= prepared_at),
  check (
    (provider_booking_reference_ciphertext is null) =
      (provider_booking_reference_sha256 is null)
  ),
  check (
    provider_booking_reference_sha256 is null
    or provider_booking_reference_sha256 <>
      provider_order_reference_sha256
  ),
  check (
    (attempt_state = 'prepared'
      and attempt_revision = 0
      and dispatch_token_sha256 is null
      and dispatch_started_at is null
      and provider_request_count = 0
      and not external_request_made
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and provider_order_reference_ciphertext is null
      and provider_order_reference_sha256 is null
      and provider_booking_reference_ciphertext is null
      and provider_booking_reference_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_evidence_sha256 is null
      and reconciliation_outcome is null
      and reconciliation_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'dispatching'
      and attempt_revision = 1
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and provider_request_count = 0
      and not external_request_made
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and provider_order_reference_ciphertext is null
      and provider_order_reference_sha256 is null
      and provider_booking_reference_ciphertext is null
      and provider_booking_reference_sha256 is null
      and completion_evidence_sha256 is null
      and ambiguity_evidence_sha256 is null
      and reconciliation_outcome is null
      and reconciliation_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is null
      and reconciled_at is null)
    or
    (attempt_state = 'succeeded'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and provider_request_count = 1
      and external_request_made
      and terminal_error_code is null
      and terminal_http_status between 200 and 299
      and terminal_response_sha256 is not null
      and provider_order_reference_ciphertext is not null
      and provider_order_reference_sha256 is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is null
      and reconciliation_outcome is null
      and reconciliation_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'failed'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and terminal_error_code is not null
      and provider_order_reference_ciphertext is null
      and provider_order_reference_sha256 is null
      and provider_booking_reference_ciphertext is null
      and provider_booking_reference_sha256 is null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is null
      and reconciliation_outcome is null
      and reconciliation_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null
      and (
        (provider_request_count = 0
          and not external_request_made
          and terminal_http_status is null
          and terminal_response_sha256 is null)
        or
        (provider_request_count = 1
          and external_request_made
          and terminal_http_status between 400 and 499
          and terminal_response_sha256 is not null)
      ))
    or
    (attempt_state = 'ambiguous'
      and attempt_revision = 2
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and provider_request_count = 1
      and external_request_made
      and terminal_error_code is not null
      and provider_order_reference_ciphertext is null
      and provider_order_reference_sha256 is null
      and provider_booking_reference_ciphertext is null
      and provider_booking_reference_sha256 is null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is not null
      and reconciliation_outcome is null
      and reconciliation_response_sha256 is null
      and reconciliation_evidence_sha256 is null
      and completed_at is not null
      and reconciled_at is null)
    or
    (attempt_state = 'reconciled'
      and attempt_revision = 3
      and dispatch_token_sha256 is not null
      and dispatch_started_at is not null
      and provider_request_count = 1
      and external_request_made
      and terminal_error_code is not null
      and completion_evidence_sha256 is not null
      and ambiguity_evidence_sha256 is not null
      and reconciliation_outcome is not null
      and reconciliation_response_sha256 is not null
      and reconciliation_evidence_sha256 is not null
      and completed_at is not null
      and reconciled_at is not null
      and (
        (reconciliation_outcome = 'succeeded'
          and provider_order_reference_ciphertext is not null
          and provider_order_reference_sha256 is not null)
        or
        (reconciliation_outcome = 'failed'
          and provider_order_reference_ciphertext is null
          and provider_order_reference_sha256 is null
          and provider_booking_reference_ciphertext is null
          and provider_booking_reference_sha256 is null)
      ))
  )
);

create index flight_consumer_live_duffel_order_execution_state_idx
  on public.flight_consumer_live_duffel_order_executions (
    attempt_state, updated_at desc
  );

create table public.flight_consumer_live_duffel_order_execution_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references
    public.flight_consumer_live_duffel_order_executions(id)
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

alter table public.flight_consumer_live_duffel_order_executions
  enable row level security;
alter table public.flight_consumer_live_duffel_order_executions
  force row level security;
alter table public.flight_consumer_live_duffel_order_execution_receipts
  enable row level security;
alter table public.flight_consumer_live_duffel_order_execution_receipts
  force row level security;

revoke all on table
  public.flight_consumer_live_duffel_order_executions,
  public.flight_consumer_live_duffel_order_execution_receipts
from public, anon, authenticated, service_role;

create function public.protect_flight_consumer_live_duffel_order_execution_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $protect_flight_consumer_live_duffel_order_execution_v1$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Flight Consumer Live Duffel order execution evidence cannot be deleted';
  end if;

  if row(
    new.id, new.checkout_evidence_aggregate_id,
    new.checkout_execution_scope_sha256, new.checkout_binding_sha256,
    new.checkout_state_receipt_sha256, new.offer_refresh_attempt_id,
    new.offer_refresh_execution_scope_sha256, new.offer_binding_sha256,
    new.normalized_offer_sha256, new.offer_terminal_response_sha256,
    new.offer_expires_at, new.order_reference_sha256,
    new.customer_reference_sha256, new.amount_cents, new.currency,
    new.execution_scope_sha256, new.idempotency_sha256,
    new.order_execution_binding_sha256,
    new.order_execution_prerequisite_sha256, new.order_request_sha256,
    new.operation, new.provider_environment, new.livemode,
    new.dispatch_not_after, new.payment_request_count,
    new.capture_request_count, new.refund_request_count,
    new.settlement_request_count, new.ticket_request_count,
    new.servicing_request_count, new.provider_dispatch_authorized,
    new.booking_authorized, new.order_authorized,
    new.payment_authorized, new.capture_authorized,
    new.refund_authorized, new.settlement_authorized,
    new.ticketing_authorized, new.servicing_authorized,
    new.consumer_release_enabled, new.blind_retry_authorized,
    new.prepared_at
  ) is distinct from row(
    old.id, old.checkout_evidence_aggregate_id,
    old.checkout_execution_scope_sha256, old.checkout_binding_sha256,
    old.checkout_state_receipt_sha256, old.offer_refresh_attempt_id,
    old.offer_refresh_execution_scope_sha256, old.offer_binding_sha256,
    old.normalized_offer_sha256, old.offer_terminal_response_sha256,
    old.offer_expires_at, old.order_reference_sha256,
    old.customer_reference_sha256, old.amount_cents, old.currency,
    old.execution_scope_sha256, old.idempotency_sha256,
    old.order_execution_binding_sha256,
    old.order_execution_prerequisite_sha256, old.order_request_sha256,
    old.operation, old.provider_environment, old.livemode,
    old.dispatch_not_after, old.payment_request_count,
    old.capture_request_count, old.refund_request_count,
    old.settlement_request_count, old.ticket_request_count,
    old.servicing_request_count, old.provider_dispatch_authorized,
    old.booking_authorized, old.order_authorized,
    old.payment_authorized, old.capture_authorized,
    old.refund_authorized, old.settlement_authorized,
    old.ticketing_authorized, old.servicing_authorized,
    old.consumer_release_enabled, old.blind_retry_authorized,
    old.prepared_at
  ) then
    raise exception
      'Flight Consumer Live Duffel order execution binding is immutable';
  end if;

  if new.attempt_revision <> old.attempt_revision + 1
    or new.latest_state_receipt_sha256 = old.latest_state_receipt_sha256
    or new.updated_at <= old.updated_at
    or not (
      (old.attempt_state = 'prepared' and new.attempt_state = 'dispatching')
      or
      (old.attempt_state = 'dispatching'
        and new.attempt_state in ('succeeded', 'failed', 'ambiguous'))
      or
      (old.attempt_state = 'ambiguous'
        and new.attempt_state = 'reconciled')
    ) then
    raise exception
      'Flight Consumer Live Duffel order execution transition is invalid';
  end if;
  return new;
end;
$protect_flight_consumer_live_duffel_order_execution_v1$;

create trigger flight_consumer_live_duffel_order_execution_guard
before update or delete
on public.flight_consumer_live_duffel_order_executions
for each row execute function
  public.protect_flight_consumer_live_duffel_order_execution_v1();

create function public.protect_flight_consumer_live_duffel_order_receipt_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $protect_flight_consumer_live_duffel_order_receipt_v1$
begin
  raise exception
    'Flight Consumer Live Duffel order execution receipts are append-only';
end;
$protect_flight_consumer_live_duffel_order_receipt_v1$;

create trigger flight_consumer_live_duffel_order_execution_receipt_guard
before update or delete
on public.flight_consumer_live_duffel_order_execution_receipts
for each row execute function
  public.protect_flight_consumer_live_duffel_order_receipt_v1();

create function public.prepare_flight_consumer_live_duffel_order_execution_v1(
  p_checkout_evidence_aggregate_id uuid,
  p_checkout_execution_scope_sha256 text,
  p_checkout_binding_sha256 text,
  p_checkout_state_receipt_sha256 text,
  p_offer_refresh_attempt_id uuid,
  p_offer_refresh_execution_scope_sha256 text,
  p_offer_binding_sha256 text,
  p_normalized_offer_sha256 text,
  p_offer_terminal_response_sha256 text,
  p_order_reference_sha256 text,
  p_customer_reference_sha256 text,
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_order_execution_binding_sha256 text,
  p_order_execution_prerequisite_sha256 text,
  p_order_request_sha256 text,
  p_amount_cents bigint,
  p_currency text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
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
as $prepare_flight_consumer_live_duffel_order_execution_v1$
declare
  v_checkout public.flight_consumer_live_checkout_evidence_aggregates;
  v_refresh public.flight_consumer_live_duffel_offer_refresh_attempts;
  v_attempt public.flight_consumer_live_duffel_order_executions;
  v_attempt_id uuid := gen_random_uuid();
  v_match_count bigint;
  v_exact_match boolean;
  v_now timestamptz := clock_timestamp();
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel order execution is service-role only';
  end if;
  if p_checkout_evidence_aggregate_id is null
    or p_offer_refresh_attempt_id is null
    or p_checkout_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_checkout_state_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_refresh_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_normalized_offer_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_terminal_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_customer_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 = p_customer_reference_sha256
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_prerequisite_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_amount_cents not between 50 and 99999999
    or p_currency is distinct from 'USD'
    or p_dispatch_not_after is null
    or p_dispatch_not_after <= v_now + interval '15 seconds'
    or p_dispatch_not_after > v_now + interval '10 minutes' then
    raise exception
      'Flight Consumer Live Duffel order execution preparation is invalid';
  end if;

  -- Exact replay is resolved before freshness checks so a lost RPC response
  -- can be recovered without creating a second execution. Any changed binding
  -- sharing one identity is refused as a collision.
  select count(*) into v_match_count
    from public.flight_consumer_live_duffel_order_executions as candidate
   where candidate.checkout_evidence_aggregate_id =
       p_checkout_evidence_aggregate_id
      or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
      or candidate.order_reference_sha256 = p_order_reference_sha256
      or candidate.order_execution_binding_sha256 =
        p_order_execution_binding_sha256
      or (candidate.execution_scope_sha256 = p_execution_scope_sha256
        and candidate.idempotency_sha256 = p_idempotency_sha256);
  if v_match_count > 0 then
    if v_match_count <> 1 then
      raise exception
        'Flight Consumer Live Duffel order execution identity collision';
    end if;
    select candidate.* into v_attempt
      from public.flight_consumer_live_duffel_order_executions as candidate
     where candidate.checkout_evidence_aggregate_id =
         p_checkout_evidence_aggregate_id
        or candidate.offer_refresh_attempt_id = p_offer_refresh_attempt_id
        or candidate.order_reference_sha256 = p_order_reference_sha256
        or candidate.order_execution_binding_sha256 =
          p_order_execution_binding_sha256
        or (candidate.execution_scope_sha256 = p_execution_scope_sha256
          and candidate.idempotency_sha256 = p_idempotency_sha256)
     for update;
    v_exact_match := row(
      v_attempt.checkout_evidence_aggregate_id,
      v_attempt.checkout_execution_scope_sha256,
      v_attempt.checkout_binding_sha256,
      v_attempt.checkout_state_receipt_sha256,
      v_attempt.offer_refresh_attempt_id,
      v_attempt.offer_refresh_execution_scope_sha256,
      v_attempt.offer_binding_sha256,
      v_attempt.normalized_offer_sha256,
      v_attempt.offer_terminal_response_sha256,
      v_attempt.order_reference_sha256,
      v_attempt.customer_reference_sha256,
      v_attempt.execution_scope_sha256, v_attempt.idempotency_sha256,
      v_attempt.order_execution_binding_sha256,
      v_attempt.order_execution_prerequisite_sha256,
      v_attempt.order_request_sha256, v_attempt.amount_cents,
      v_attempt.currency, v_attempt.dispatch_not_after
    ) is not distinct from row(
      p_checkout_evidence_aggregate_id,
      p_checkout_execution_scope_sha256, p_checkout_binding_sha256,
      p_checkout_state_receipt_sha256, p_offer_refresh_attempt_id,
      p_offer_refresh_execution_scope_sha256, p_offer_binding_sha256,
      p_normalized_offer_sha256, p_offer_terminal_response_sha256,
      p_order_reference_sha256, p_customer_reference_sha256,
      p_execution_scope_sha256, p_idempotency_sha256,
      p_order_execution_binding_sha256,
      p_order_execution_prerequisite_sha256, p_order_request_sha256,
      p_amount_cents, p_currency, p_dispatch_not_after
    );
    if not v_exact_match then
      raise exception
        'Flight Consumer Live Duffel order execution replay collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.provider_order_reference_sha256,
      v_attempt.provider_booking_reference_sha256,
      v_attempt.provider_request_count, v_attempt.air_orders_post_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  select checkout.* into v_checkout
    from public.flight_consumer_live_checkout_evidence_aggregates as checkout
   where checkout.id = p_checkout_evidence_aggregate_id
     and checkout.execution_scope_sha256 =
       p_checkout_execution_scope_sha256
     and checkout.checkout_binding_sha256 = p_checkout_binding_sha256
     and checkout.latest_state_receipt_sha256 =
       p_checkout_state_receipt_sha256
     and checkout.offer_refresh_attempt_id = p_offer_refresh_attempt_id
     and checkout.offer_refresh_execution_scope_sha256 =
       p_offer_refresh_execution_scope_sha256
     and checkout.offer_binding_sha256 = p_offer_binding_sha256
     and checkout.normalized_offer_sha256 = p_normalized_offer_sha256
     and checkout.offer_terminal_response_sha256 =
       p_offer_terminal_response_sha256
     and checkout.order_reference_sha256 = p_order_reference_sha256
     and checkout.customer_reference_sha256 = p_customer_reference_sha256
     and checkout.amount_cents = p_amount_cents
     and checkout.currency = p_currency
     and checkout.checkout_state = 'finalized'
     and checkout.checkout_revision = 1
     and checkout.finalization_evidence_sha256 is not null
     and checkout.offer_expires_at > p_dispatch_not_after
     and checkout.provider_request_count = 0
     and checkout.stripe_request_count = 0
     and checkout.order_request_count = 0
     and checkout.payment_request_count = 0
     and checkout.capture_request_count = 0
     and checkout.refund_request_count = 0
     and checkout.settlement_request_count = 0
     and checkout.ticket_request_count = 0
     and not checkout.provider_dispatch_authorized
     and not checkout.stripe_dispatch_authorized
     and not checkout.booking_authorized
     and not checkout.order_authorized
     and not checkout.payment_authorized
     and not checkout.capture_authorized
     and not checkout.refund_authorized
     and not checkout.settlement_authorized
     and not checkout.ticketing_authorized
     and not checkout.servicing_authorized
     and not checkout.consumer_release_enabled
   for update;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order checkout binding is invalid';
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
     and refresh.price_amount_minor = p_amount_cents
     and refresh.price_currency = p_currency
     and refresh.offer_expires_at = v_checkout.offer_expires_at
     and refresh.offer_expires_at > p_dispatch_not_after
     and refresh.attempt_state = 'succeeded'
     and refresh.attempt_revision = 2
     and refresh.provider_dispatch_count = 1
     and not refresh.order_authorized
     and not refresh.payment_authorized
     and not refresh.settlement_authorized
     and not refresh.ticketing_authorized
     and not refresh.refund_authorized
     and not refresh.servicing_authorized
     and not refresh.consumer_release_enabled
   for update;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order offer refresh binding is invalid';
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live-order-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt_id,
      'attempt_revision', 0,
      'attempt_state', 'prepared',
      'checkout_evidence_aggregate_id', p_checkout_evidence_aggregate_id,
      'checkout_state_receipt_sha256', p_checkout_state_receipt_sha256,
      'order_execution_binding_sha256', p_order_execution_binding_sha256,
      'order_execution_prerequisite_sha256',
        p_order_execution_prerequisite_sha256,
      'order_request_sha256', p_order_request_sha256,
      'provider_environment', 'duffel_live'
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_duffel_order_executions (
    id, checkout_evidence_aggregate_id,
    checkout_execution_scope_sha256, checkout_binding_sha256,
    checkout_state_receipt_sha256, offer_refresh_attempt_id,
    offer_refresh_execution_scope_sha256, offer_binding_sha256,
    normalized_offer_sha256, offer_terminal_response_sha256,
    offer_expires_at, order_reference_sha256,
    customer_reference_sha256, amount_cents, currency,
    execution_scope_sha256, idempotency_sha256,
    order_execution_binding_sha256,
    order_execution_prerequisite_sha256, order_request_sha256,
    dispatch_not_after, latest_state_receipt_sha256
  ) values (
    v_attempt_id, p_checkout_evidence_aggregate_id,
    p_checkout_execution_scope_sha256, p_checkout_binding_sha256,
    p_checkout_state_receipt_sha256, p_offer_refresh_attempt_id,
    p_offer_refresh_execution_scope_sha256, p_offer_binding_sha256,
    p_normalized_offer_sha256, p_offer_terminal_response_sha256,
    v_refresh.offer_expires_at, p_order_reference_sha256,
    p_customer_reference_sha256, p_amount_cents, p_currency,
    p_execution_scope_sha256, p_idempotency_sha256,
    p_order_execution_binding_sha256,
    p_order_execution_prerequisite_sha256, p_order_request_sha256,
    p_dispatch_not_after, v_receipt
  ) returning * into v_attempt;

  insert into public.flight_consumer_live_duffel_order_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 0, 'prepared', 'prepared', null, v_receipt
  );

  return query select
    'created'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.provider_order_reference_sha256,
    v_attempt.provider_booking_reference_sha256,
    v_attempt.provider_request_count, v_attempt.air_orders_post_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$prepare_flight_consumer_live_duffel_order_execution_v1$;

create function public.claim_flight_consumer_live_duffel_order_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_order_execution_binding_sha256 text,
  p_order_request_sha256 text,
  p_dispatch_token_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
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
as $claim_flight_consumer_live_duffel_order_execution_v1$
declare
  v_attempt public.flight_consumer_live_duffel_order_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
  v_prerequisite_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel order execution claim is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception
      'Flight Consumer Live Duffel order execution claim is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_attempt_id
     and execution.execution_scope_sha256 = p_execution_scope_sha256
     and execution.order_execution_binding_sha256 =
       p_order_execution_binding_sha256
     and execution.order_request_sha256 = p_order_request_sha256
   for update;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order execution claim binding is invalid';
  end if;

  if v_attempt.attempt_state = 'dispatching'
    and v_attempt.attempt_revision = 1
    and v_attempt.dispatch_token_sha256 = p_dispatch_token_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.provider_order_reference_sha256,
      v_attempt.provider_booking_reference_sha256,
      v_attempt.provider_request_count, v_attempt.air_orders_post_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'prepared'
    or v_attempt.attempt_revision <> p_expected_revision
    or v_attempt.dispatch_not_after <= v_now then
    raise exception
      'Flight Consumer Live Duffel order execution claim CAS refused';
  end if;

  select count(*) into v_prerequisite_count
    from public.flight_consumer_live_checkout_evidence_aggregates as checkout
    join public.flight_consumer_live_duffel_offer_refresh_attempts as refresh
      on refresh.id = checkout.offer_refresh_attempt_id
   where checkout.id = v_attempt.checkout_evidence_aggregate_id
     and checkout.execution_scope_sha256 =
       v_attempt.checkout_execution_scope_sha256
     and checkout.checkout_binding_sha256 =
       v_attempt.checkout_binding_sha256
     and checkout.latest_state_receipt_sha256 =
       v_attempt.checkout_state_receipt_sha256
     and checkout.checkout_state = 'finalized'
     and checkout.checkout_revision = 1
     and checkout.order_reference_sha256 =
       v_attempt.order_reference_sha256
     and checkout.customer_reference_sha256 =
       v_attempt.customer_reference_sha256
     and checkout.amount_cents = v_attempt.amount_cents
     and checkout.currency = v_attempt.currency
     and refresh.id = v_attempt.offer_refresh_attempt_id
     and refresh.execution_scope_sha256 =
       v_attempt.offer_refresh_execution_scope_sha256
     and refresh.offer_binding_sha256 = v_attempt.offer_binding_sha256
     and refresh.normalized_offer_sha256 =
       v_attempt.normalized_offer_sha256
     and refresh.terminal_response_sha256 =
       v_attempt.offer_terminal_response_sha256
     and refresh.attempt_state = 'succeeded'
     and refresh.attempt_revision = 2
     and refresh.price_amount_minor = v_attempt.amount_cents
     and refresh.price_currency = v_attempt.currency
     and refresh.offer_expires_at = v_attempt.offer_expires_at
     and refresh.offer_expires_at > v_now + interval '15 seconds';
  if v_prerequisite_count is distinct from 1 then
    raise exception
      'Flight Consumer Live Duffel order execution prerequisite changed';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live-order-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 1,
      'attempt_state', 'dispatching',
      'dispatch_token_sha256', p_dispatch_token_sha256,
      'order_request_sha256', v_attempt.order_request_sha256,
      'previous_receipt_sha256', v_previous_receipt
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_duffel_order_executions as execution
     set attempt_state = 'dispatching', attempt_revision = 1,
         dispatch_token_sha256 = p_dispatch_token_sha256,
         dispatch_started_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_state = 'prepared'
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order execution claim CAS refused';
  end if;

  insert into public.flight_consumer_live_duffel_order_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 1, 'dispatching', 'dispatching',
    v_previous_receipt, v_receipt
  );

  return query select
    'claimed'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.provider_order_reference_sha256,
    v_attempt.provider_booking_reference_sha256,
    v_attempt.provider_request_count, v_attempt.air_orders_post_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$claim_flight_consumer_live_duffel_order_execution_v1$;

create function public.complete_flight_consumer_live_duffel_order_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_order_execution_binding_sha256 text,
  p_order_request_sha256 text,
  p_dispatch_token_sha256 text,
  p_terminal_state text,
  p_provider_request_count integer,
  p_air_orders_post_count integer,
  p_terminal_error_code text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_provider_order_reference_ciphertext text,
  p_provider_order_reference_sha256 text,
  p_provider_booking_reference_ciphertext text,
  p_provider_booking_reference_sha256 text,
  p_completion_evidence_sha256 text,
  p_ambiguity_evidence_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
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
as $complete_flight_consumer_live_duffel_order_execution_v1$
declare
  v_attempt public.flight_consumer_live_duffel_order_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel order completion is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 1
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_state is null
    or p_terminal_state not in ('succeeded', 'failed', 'ambiguous')
    or p_provider_request_count not in (0, 1)
    or p_air_orders_post_count is distinct from p_provider_request_count
    or p_completion_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (p_provider_order_reference_ciphertext is null) <>
      (p_provider_order_reference_sha256 is null)
    or (p_provider_booking_reference_ciphertext is null) <>
      (p_provider_booking_reference_sha256 is null)
    or (
      p_provider_order_reference_ciphertext is not null
      and (
        char_length(p_provider_order_reference_ciphertext) > 4096
        or p_provider_order_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_provider_order_reference_sha256 !~ '^[0-9a-f]{64}$'
      )
    )
    or (
      p_provider_booking_reference_ciphertext is not null
      and (
        char_length(p_provider_booking_reference_ciphertext) > 4096
        or p_provider_booking_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_provider_booking_reference_sha256 !~ '^[0-9a-f]{64}$'
        or p_provider_booking_reference_sha256 =
          p_provider_order_reference_sha256
      )
    ) then
    raise exception
      'Flight Consumer Live Duffel order completion is invalid';
  end if;

  if p_terminal_state = 'succeeded' and not coalesce((
    p_provider_request_count = 1
    and p_terminal_error_code is null
    and p_terminal_http_status between 200 and 299
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_provider_order_reference_ciphertext is not null
    and p_provider_order_reference_sha256 ~ '^[0-9a-f]{64}$'
    and p_completion_evidence_sha256 ~ '^[0-9a-f]{64}$'
    and p_ambiguity_evidence_sha256 is null
  ), false) then
    raise exception
      'Flight Consumer Live Duffel order success evidence is invalid';
  elsif p_terminal_state = 'failed' and not coalesce((
    p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and p_provider_order_reference_ciphertext is null
    and p_provider_order_reference_sha256 is null
    and p_provider_booking_reference_ciphertext is null
    and p_provider_booking_reference_sha256 is null
    and p_ambiguity_evidence_sha256 is null
    and (
      (p_provider_request_count = 0
        and p_terminal_http_status is null
        and p_terminal_response_sha256 is null)
      or
      (p_provider_request_count = 1
        and p_terminal_http_status between 400 and 499
        and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$')
    )
  ), false) then
    raise exception
      'Flight Consumer Live Duffel order failure evidence is invalid';
  elsif p_terminal_state = 'ambiguous' and not coalesce((
    p_provider_request_count = 1
    and p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and (
      p_terminal_http_status is null
      or p_terminal_http_status between 100 and 599
    )
    and (
      p_terminal_response_sha256 is null
      or p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    )
    and p_provider_order_reference_ciphertext is null
    and p_provider_order_reference_sha256 is null
    and p_provider_booking_reference_ciphertext is null
    and p_provider_booking_reference_sha256 is null
    and p_ambiguity_evidence_sha256 ~ '^[0-9a-f]{64}$'
    and p_ambiguity_evidence_sha256 <> p_completion_evidence_sha256
  ), false) then
    raise exception
      'Flight Consumer Live Duffel order ambiguity evidence is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_attempt_id
     and execution.execution_scope_sha256 = p_execution_scope_sha256
     and execution.order_execution_binding_sha256 =
       p_order_execution_binding_sha256
     and execution.order_request_sha256 = p_order_request_sha256
     and execution.dispatch_token_sha256 = p_dispatch_token_sha256
   for update;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order completion binding is invalid';
  end if;

  if v_attempt.attempt_state = p_terminal_state
    and v_attempt.attempt_revision = 2
    and v_attempt.provider_request_count = p_provider_request_count
    and v_attempt.air_orders_post_count = p_air_orders_post_count
    and v_attempt.terminal_error_code is not distinct from
      p_terminal_error_code
    and v_attempt.terminal_http_status is not distinct from
      p_terminal_http_status
    and v_attempt.terminal_response_sha256 is not distinct from
      p_terminal_response_sha256
    and v_attempt.provider_order_reference_ciphertext is not distinct from
      p_provider_order_reference_ciphertext
    and v_attempt.provider_order_reference_sha256 is not distinct from
      p_provider_order_reference_sha256
    and v_attempt.provider_booking_reference_ciphertext is not distinct from
      p_provider_booking_reference_ciphertext
    and v_attempt.provider_booking_reference_sha256 is not distinct from
      p_provider_booking_reference_sha256
    and v_attempt.completion_evidence_sha256 =
      p_completion_evidence_sha256
    and v_attempt.ambiguity_evidence_sha256 is not distinct from
      p_ambiguity_evidence_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.provider_order_reference_sha256,
      v_attempt.provider_booking_reference_sha256,
      v_attempt.provider_request_count, v_attempt.air_orders_post_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'dispatching'
    or v_attempt.attempt_revision <> p_expected_revision then
    raise exception
      'Flight Consumer Live Duffel order completion CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live-order-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'air_orders_post_count', p_air_orders_post_count,
      'ambiguity_evidence_sha256', p_ambiguity_evidence_sha256,
      'attempt_id', v_attempt.id,
      'attempt_revision', 2,
      'attempt_state', p_terminal_state,
      'completion_evidence_sha256', p_completion_evidence_sha256,
      'previous_receipt_sha256', v_previous_receipt,
      'provider_order_reference_sha256',
        p_provider_order_reference_sha256,
      'terminal_response_sha256', p_terminal_response_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_duffel_order_executions as execution
     set attempt_state = p_terminal_state, attempt_revision = 2,
         provider_request_count = p_provider_request_count,
         air_orders_post_count = p_air_orders_post_count,
         external_request_made = p_provider_request_count = 1,
         terminal_error_code = p_terminal_error_code,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         provider_order_reference_ciphertext =
           p_provider_order_reference_ciphertext,
         provider_order_reference_sha256 =
           p_provider_order_reference_sha256,
         provider_booking_reference_ciphertext =
           p_provider_booking_reference_ciphertext,
         provider_booking_reference_sha256 =
           p_provider_booking_reference_sha256,
         completion_evidence_sha256 = p_completion_evidence_sha256,
         ambiguity_evidence_sha256 = p_ambiguity_evidence_sha256,
         completed_at = v_now, latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_state = 'dispatching'
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order completion CAS refused';
  end if;

  insert into public.flight_consumer_live_duffel_order_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 2, p_terminal_state, p_terminal_state,
    v_previous_receipt, v_receipt
  );

  return query select
    p_terminal_state, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.provider_order_reference_sha256,
    v_attempt.provider_booking_reference_sha256,
    v_attempt.provider_request_count, v_attempt.air_orders_post_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$complete_flight_consumer_live_duffel_order_execution_v1$;

create function public.reconcile_flight_consumer_live_duffel_order_execution_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_order_execution_binding_sha256 text,
  p_dispatch_token_sha256 text,
  p_reconciliation_outcome text,
  p_reconciliation_response_sha256 text,
  p_reconciliation_evidence_sha256 text,
  p_provider_order_reference_ciphertext text,
  p_provider_order_reference_sha256 text,
  p_provider_booking_reference_ciphertext text,
  p_provider_booking_reference_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
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
as $reconcile_flight_consumer_live_duffel_order_execution_v1$
declare
  v_attempt public.flight_consumer_live_duffel_order_executions;
  v_previous_receipt text;
  v_receipt text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel order reconciliation is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 2
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_outcome is null
    or p_reconciliation_outcome not in ('succeeded', 'failed')
    or p_reconciliation_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_reconciliation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (p_provider_order_reference_ciphertext is null) <>
      (p_provider_order_reference_sha256 is null)
    or (p_provider_booking_reference_ciphertext is null) <>
      (p_provider_booking_reference_sha256 is null)
    or (
      p_provider_order_reference_ciphertext is not null
      and (
        char_length(p_provider_order_reference_ciphertext) > 4096
        or p_provider_order_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_provider_order_reference_sha256 !~ '^[0-9a-f]{64}$'
      )
    )
    or (
      p_provider_booking_reference_ciphertext is not null
      and (
        char_length(p_provider_booking_reference_ciphertext) > 4096
        or p_provider_booking_reference_ciphertext
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$'
        or p_provider_booking_reference_sha256 !~ '^[0-9a-f]{64}$'
        or p_provider_booking_reference_sha256 =
          p_provider_order_reference_sha256
      )
    ) then
    raise exception
      'Flight Consumer Live Duffel order reconciliation is invalid';
  end if;
  if p_reconciliation_outcome = 'succeeded' and (
    p_provider_order_reference_ciphertext is null
    or p_provider_order_reference_sha256 is null
  ) then
    raise exception
      'Flight Consumer Live Duffel order reconciliation success is invalid';
  elsif p_reconciliation_outcome = 'failed' and (
    p_provider_order_reference_ciphertext is not null
    or p_provider_order_reference_sha256 is not null
    or p_provider_booking_reference_ciphertext is not null
    or p_provider_booking_reference_sha256 is not null
  ) then
    raise exception
      'Flight Consumer Live Duffel order reconciliation failure is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_attempt_id
     and execution.execution_scope_sha256 = p_execution_scope_sha256
     and execution.order_execution_binding_sha256 =
       p_order_execution_binding_sha256
     and execution.dispatch_token_sha256 = p_dispatch_token_sha256
   for update;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order reconciliation binding is invalid';
  end if;

  if v_attempt.attempt_state = 'reconciled'
    and v_attempt.attempt_revision = 3
    and v_attempt.reconciliation_outcome = p_reconciliation_outcome
    and v_attempt.reconciliation_response_sha256 =
      p_reconciliation_response_sha256
    and v_attempt.reconciliation_evidence_sha256 =
      p_reconciliation_evidence_sha256
    and v_attempt.provider_order_reference_ciphertext is not distinct from
      p_provider_order_reference_ciphertext
    and v_attempt.provider_order_reference_sha256 is not distinct from
      p_provider_order_reference_sha256
    and v_attempt.provider_booking_reference_ciphertext is not distinct from
      p_provider_booking_reference_ciphertext
    and v_attempt.provider_booking_reference_sha256 is not distinct from
      p_provider_booking_reference_sha256 then
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision,
      v_attempt.provider_order_reference_sha256,
      v_attempt.provider_booking_reference_sha256,
      v_attempt.provider_request_count, v_attempt.air_orders_post_count,
      v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
      v_attempt.provider_dispatch_authorized,
      v_attempt.booking_authorized, v_attempt.order_authorized,
      v_attempt.payment_authorized, v_attempt.capture_authorized,
      v_attempt.refund_authorized, v_attempt.settlement_authorized,
      v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
      v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
    return;
  end if;

  if v_attempt.attempt_state <> 'ambiguous'
    or v_attempt.attempt_revision <> p_expected_revision
    or v_attempt.provider_request_count <> 1
    or v_attempt.air_orders_post_count <> 1
    or not v_attempt.external_request_made then
    raise exception
      'Flight Consumer Live Duffel order reconciliation CAS refused';
  end if;

  v_previous_receipt := v_attempt.latest_state_receipt_sha256;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live-order-execution-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_revision', 3,
      'attempt_state', 'reconciled',
      'previous_receipt_sha256', v_previous_receipt,
      'provider_order_reference_sha256',
        p_provider_order_reference_sha256,
      'reconciliation_evidence_sha256',
        p_reconciliation_evidence_sha256,
      'reconciliation_outcome', p_reconciliation_outcome,
      'reconciliation_response_sha256',
        p_reconciliation_response_sha256
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  update public.flight_consumer_live_duffel_order_executions as execution
     set attempt_state = 'reconciled', attempt_revision = 3,
         reconciliation_outcome = p_reconciliation_outcome,
         reconciliation_response_sha256 =
           p_reconciliation_response_sha256,
         reconciliation_evidence_sha256 =
           p_reconciliation_evidence_sha256,
         provider_order_reference_ciphertext =
           p_provider_order_reference_ciphertext,
         provider_order_reference_sha256 =
           p_provider_order_reference_sha256,
         provider_booking_reference_ciphertext =
           p_provider_booking_reference_ciphertext,
         provider_booking_reference_sha256 =
           p_provider_booking_reference_sha256,
         reconciled_at = v_now,
         latest_state_receipt_sha256 = v_receipt,
         updated_at = v_now
   where execution.id = v_attempt.id
     and execution.attempt_state = 'ambiguous'
     and execution.attempt_revision = p_expected_revision
  returning execution.* into v_attempt;
  if not found then
    raise exception
      'Flight Consumer Live Duffel order reconciliation CAS refused';
  end if;

  insert into public.flight_consumer_live_duffel_order_execution_receipts (
    attempt_id, attempt_revision, receipt_kind, attempt_state,
    previous_receipt_sha256, receipt_sha256
  ) values (
    v_attempt.id, 3, 'reconciled', 'reconciled',
    v_previous_receipt, v_receipt
  );

  return query select
    'reconciled'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.provider_order_reference_sha256,
    v_attempt.provider_booking_reference_sha256,
    v_attempt.provider_request_count, v_attempt.air_orders_post_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized;
end;
$reconcile_flight_consumer_live_duffel_order_execution_v1$;

alter function public.prepare_flight_consumer_live_duffel_order_execution_v1(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, bigint, text, timestamptz
) owner to postgres;
alter function public.claim_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text
) owner to postgres;
alter function public.complete_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text
) owner to postgres;
alter function public.reconcile_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text, text
) owner to postgres;

revoke all on function
  public.prepare_flight_consumer_live_duffel_order_execution_v1(
    uuid, text, text, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, bigint, text, timestamptz
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.complete_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.reconcile_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, text, text, text
  ) from public, anon, authenticated, service_role;

grant execute on function
  public.prepare_flight_consumer_live_duffel_order_execution_v1(
    uuid, text, text, text, uuid, text, text, text, text, text, text, text,
    text, text, text, text, bigint, text, timestamptz
  ) to service_role;
grant execute on function
  public.claim_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text
  ) to service_role;
grant execute on function
  public.complete_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text
  ) to service_role;
grant execute on function
  public.reconcile_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, text, text, text
  ) to service_role;

comment on table public.flight_consumer_live_duffel_order_executions is
  'Production-dark, service-role-only, at-most-once POST /air/orders outcome evidence. Provider identifiers are encrypted plus digest-bound; all money, ticket, servicing, retry, and consumer-release authority remains false.';
comment on function public.claim_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text
) is
  'Claims one immutable token but grants no dispatch authority. A future dispatcher must require the separately frozen 109 authorized-requires-capture evidence gate and immediately recheck dispatch_not_after plus offer expiry; replay never grants redispatch.';
comment on function public.reconcile_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text, text
) is
  'Reconciles terminal ambiguity without incrementing or repeating POST /air/orders.';

commit;
