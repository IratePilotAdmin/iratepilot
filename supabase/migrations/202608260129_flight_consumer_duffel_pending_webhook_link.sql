begin;

-- A signed TEST order.created event can race the create-order terminal CAS. The
-- original webhook ledger envelope remains immutable; these two append-only
-- tables preserve a candidate association and its later terminal resolution.
-- Nothing in this migration authorizes provider dispatch or live traffic.
do $flight_consumer_preview_090_dependencies$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_offers') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_consumer_webhook_ledger') is null
    or to_regprocedure(
      'public.resolve_flight_consumer_duffel_webhook_replay_v1(text,text,text,text,text,text,timestamptz,text,text)'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(text,text,text,text,text,text,timestamptz,boolean,text,text)'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
    ) is null then
    raise exception 'Flight Consumer Preview pending webhook linkage requires migrations 068 through 089';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview pending webhook linkage requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_090_dependencies$;

do $flight_consumer_preview_090_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 090 requires relock before hardening';
  end if;
end;
$flight_consumer_preview_090_relocked_precondition$;

create table public.flight_consumer_duffel_webhook_pending_links (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null unique
    references public.flight_consumer_webhook_ledger(id) on delete restrict,
  order_id uuid not null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  payment_id uuid not null references public.flight_payments(id) on delete restrict,
  provider_attempt_id uuid not null
    references public.flight_provider_request_attempts(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_offer_ref_sha256 text not null
    check (provider_offer_ref_sha256 ~ '^[0-9a-f]{64}$'),
  provider_order_ref_sha256 text not null
    check (provider_order_ref_sha256 ~ '^[0-9a-f]{64}$'),
  association_receipt_sha256 text not null unique
    check (association_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict
);

create index flight_duffel_pending_link_attempt_idx
  on public.flight_consumer_duffel_webhook_pending_links (
    provider_attempt_id, created_at, id
  );

create table public.flight_consumer_duffel_webhook_pending_link_resolutions (
  id uuid primary key default gen_random_uuid(),
  pending_link_id uuid not null unique
    references public.flight_consumer_duffel_webhook_pending_links(id)
    on delete restrict,
  ledger_id uuid not null unique
    references public.flight_consumer_webhook_ledger(id) on delete restrict,
  outcome text not null check (outcome in ('linked', 'review')),
  attempt_terminal_state text not null
    check (attempt_terminal_state in ('succeeded', 'failed', 'ambiguous')),
  attempt_terminal_revision integer not null check (attempt_terminal_revision = 2),
  attempt_terminal_receipt_sha256 text not null
    check (attempt_terminal_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  resolution_receipt_sha256 text not null unique
    check (resolution_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create function public.reject_flight_consumer_duffel_pending_link_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $reject_flight_consumer_duffel_pending_link_mutation$
begin
  raise exception 'Flight Duffel pending webhook link evidence is append-only';
end;
$reject_flight_consumer_duffel_pending_link_mutation$;

create trigger flight_duffel_pending_links_append_only
before update or delete on public.flight_consumer_duffel_webhook_pending_links
for each row execute function
  public.reject_flight_consumer_duffel_pending_link_mutation_v1();

create trigger flight_duffel_pending_resolutions_append_only
before update or delete
on public.flight_consumer_duffel_webhook_pending_link_resolutions
for each row execute function
  public.reject_flight_consumer_duffel_pending_link_mutation_v1();

alter table public.flight_consumer_duffel_webhook_pending_links
  enable row level security;
alter table public.flight_consumer_duffel_webhook_pending_links
  force row level security;
alter table public.flight_consumer_duffel_webhook_pending_link_resolutions
  enable row level security;
alter table public.flight_consumer_duffel_webhook_pending_link_resolutions
  force row level security;

-- Associate only the single captured-payment TEST create-order attempt whose
-- immutable offer digest matches the signed webhook. Dispatching is admitted
-- as a candidate, never as a resolved link.
create function public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(
  p_ledger_id uuid,
  p_expected_ledger_revision integer,
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  pending_link_id uuid,
  pending_revision integer,
  pending_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $enqueue_flight_consumer_duffel_pending_webhook_link$
#variable_conflict error
declare
  v_ledger public.flight_consumer_webhook_ledger;
  v_pending public.flight_consumer_duffel_webhook_pending_links;
  v_resolution public.flight_consumer_duffel_webhook_pending_link_resolutions;
  v_candidate_count integer;
  v_order_id uuid;
  v_customer_id uuid;
  v_payment_id uuid;
  v_attempt_id uuid;
  v_association_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel pending webhook linkage is service-role only';
  end if;
  if p_ledger_id is null
    or p_expected_ledger_revision not between 0 and 2
    or p_provider_order_ref_sha256 is null
    or p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_offer_ref_sha256 is null
    or p_provider_offer_ref_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Duffel pending webhook association is invalid';
  end if;

  select ledger.* into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id for update;
  if not found
    or v_ledger.revision <> p_expected_ledger_revision
    or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.order_id is not null
    or v_ledger.payment_id is not null
    or v_ledger.provider_attempt_id is not null
    or v_ledger.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_ledger.provider_offer_ref_sha256
      is distinct from p_provider_offer_ref_sha256 then
    raise exception 'Flight Duffel pending webhook ledger identity is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );

  -- Exact replay consults the append-only association before any mutable
  -- order/payment state. A later refund or lifecycle change cannot strand the
  -- signed event after enqueue already certified the captured-payment link.
  select pending.* into v_pending
    from public.flight_consumer_duffel_webhook_pending_links as pending
   where pending.ledger_id = v_ledger.id;
  if found then
    v_association_receipt_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.duffel-webhook-pending-link.v1',
        'ledger_id', v_ledger.id::text,
        'event_id_sha256', v_ledger.event_id_sha256,
        'semantic_sha256', v_ledger.semantic_sha256,
        'verification_receipt_sha256', v_ledger.verification_receipt_sha256,
        'order_id', v_pending.order_id::text,
        'customer_id', v_pending.customer_id::text,
        'payment_id', v_pending.payment_id::text,
        'provider_attempt_id', v_pending.provider_attempt_id::text,
        'execution_scope_sha256', v_ledger.execution_scope_sha256,
        'provider_offer_ref_sha256', p_provider_offer_ref_sha256,
        'provider_order_ref_sha256', p_provider_order_ref_sha256
      )::text, 'UTF8'), 'sha256'), 'hex');
    if v_pending.execution_mode <> 'test'
      or v_pending.execution_scope_sha256 <> v_ledger.execution_scope_sha256
      or v_pending.provider_offer_ref_sha256 <> p_provider_offer_ref_sha256
      or v_pending.provider_order_ref_sha256 <> p_provider_order_ref_sha256
      or v_pending.association_receipt_sha256
        <> v_association_receipt_sha256 then
      raise exception 'Flight Duffel pending webhook association replay collides';
    end if;
    select resolution.* into v_resolution
      from public.flight_consumer_duffel_webhook_pending_link_resolutions
        as resolution
     where resolution.pending_link_id = v_pending.id;
    return query select v_pending.id,
      case when v_resolution.id is null then 0 else 1 end,
      coalesce(v_resolution.outcome, 'pending'::text);
    return;
  end if;

  select count(*)::integer into v_candidate_count
    from public.flight_orders as flight_order
    join public.flight_offers as offer
      on offer.id = flight_order.offer_id
     and offer.search_id = flight_order.search_id
    join public.flight_provider_request_attempts as attempt
      on attempt.order_id = flight_order.id
     and attempt.customer_id = flight_order.customer_id
     and attempt.offer_id = offer.id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
    join public.flight_payments as payment
      on payment.order_id = flight_order.id
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = flight_order.total_cents
     and payment.captured_cents = flight_order.total_cents
     and payment.refunded_cents = 0
   where flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and flight_order.provider_code = 'duffel'
     and flight_order.status in (
       'order_creating', 'requires_review', 'booked',
       'ticketing_pending', 'ticketed'
     )
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and offer.provider_code = 'duffel'
     and offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and attempt.provider_code = 'duffel'
     and not attempt.retry_authorized
     and (
       (attempt.state = 'dispatching' and attempt.revision = 1)
       or (attempt.state in ('succeeded', 'failed', 'ambiguous')
         and attempt.revision = 2)
     )
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and payment.currency = flight_order.currency;
  if v_candidate_count = 0 then return; end if;
  if v_candidate_count <> 1 then
    raise exception 'Flight Duffel pending webhook association is not unique';
  end if;

  select flight_order.id, flight_order.customer_id, payment.id, attempt.id
    into v_order_id, v_customer_id, v_payment_id, v_attempt_id
    from public.flight_orders as flight_order
    join public.flight_offers as offer
      on offer.id = flight_order.offer_id
     and offer.search_id = flight_order.search_id
    join public.flight_provider_request_attempts as attempt
      on attempt.order_id = flight_order.id
     and attempt.customer_id = flight_order.customer_id
     and attempt.offer_id = offer.id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
    join public.flight_payments as payment
      on payment.order_id = flight_order.id
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = flight_order.total_cents
     and payment.captured_cents = flight_order.total_cents
     and payment.refunded_cents = 0
   where flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and flight_order.provider_code = 'duffel'
     and flight_order.status in (
       'order_creating', 'requires_review', 'booked',
       'ticketing_pending', 'ticketed'
     )
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and offer.provider_code = 'duffel'
     and offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and attempt.provider_code = 'duffel'
     and not attempt.retry_authorized
     and (
       (attempt.state = 'dispatching' and attempt.revision = 1)
       or (attempt.state in ('succeeded', 'failed', 'ambiguous')
         and attempt.revision = 2)
     )
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_ledger.execution_scope_sha256
     and payment.currency = flight_order.currency
   for share of flight_order, offer, attempt, payment;

  v_association_receipt_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.duffel-webhook-pending-link.v1',
      'ledger_id', v_ledger.id::text,
      'event_id_sha256', v_ledger.event_id_sha256,
      'semantic_sha256', v_ledger.semantic_sha256,
      'verification_receipt_sha256', v_ledger.verification_receipt_sha256,
      'order_id', v_order_id::text,
      'customer_id', v_customer_id::text,
      'payment_id', v_payment_id::text,
      'provider_attempt_id', v_attempt_id::text,
      'execution_scope_sha256', v_ledger.execution_scope_sha256,
      'provider_offer_ref_sha256', p_provider_offer_ref_sha256,
      'provider_order_ref_sha256', p_provider_order_ref_sha256
    )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.flight_consumer_duffel_webhook_pending_links (
    ledger_id, order_id, customer_id, payment_id, provider_attempt_id,
    execution_mode, execution_scope_sha256, provider_offer_ref_sha256,
    provider_order_ref_sha256, association_receipt_sha256
  ) values (
    v_ledger.id, v_order_id, v_customer_id, v_payment_id, v_attempt_id,
    'test', v_ledger.execution_scope_sha256, p_provider_offer_ref_sha256,
    p_provider_order_ref_sha256, v_association_receipt_sha256
  ) on conflict (ledger_id) do nothing;

  select pending.* into v_pending
    from public.flight_consumer_duffel_webhook_pending_links as pending
   where pending.ledger_id = v_ledger.id;
  if not found
    or v_pending.order_id <> v_order_id
    or v_pending.customer_id <> v_customer_id
    or v_pending.payment_id <> v_payment_id
    or v_pending.provider_attempt_id <> v_attempt_id
    or v_pending.execution_mode <> 'test'
    or v_pending.execution_scope_sha256 <> v_ledger.execution_scope_sha256
    or v_pending.provider_offer_ref_sha256 <> p_provider_offer_ref_sha256
    or v_pending.provider_order_ref_sha256 <> p_provider_order_ref_sha256
    or v_pending.association_receipt_sha256
      <> v_association_receipt_sha256 then
    raise exception 'Flight Duffel pending webhook association replay collides';
  end if;
  select resolution.* into v_resolution
    from public.flight_consumer_duffel_webhook_pending_link_resolutions as resolution
   where resolution.pending_link_id = v_pending.id;
  return query select v_pending.id,
    case when v_resolution.id is null then 0 else 1 end,
    coalesce(v_resolution.outcome, 'pending'::text);
end;
$enqueue_flight_consumer_duffel_pending_webhook_link$;

-- Resolve by exact revision only after the associated provider attempt reaches
-- a terminal state. A successful result exposes the immutable local identity;
-- failure/ambiguity or an order-digest conflict records review evidence.
-- Dispatching and a success not yet durably finalized stay pending.
create function public.resolve_flight_consumer_duffel_pending_webhook_link_v1(
  p_pending_link_id uuid,
  p_expected_pending_revision integer
)
returns table (
  pending_link_id uuid,
  pending_revision integer,
  pending_state text,
  order_id uuid,
  customer_id uuid,
  provider_attempt_id uuid,
  order_status text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $resolve_flight_consumer_duffel_pending_webhook_link$
#variable_conflict error
declare
  v_pending public.flight_consumer_duffel_webhook_pending_links;
  v_resolution public.flight_consumer_duffel_webhook_pending_link_resolutions;
  v_ledger public.flight_consumer_webhook_ledger;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_outcome text;
  v_resolution_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel pending webhook resolution is service-role only';
  end if;
  if p_pending_link_id is null
    or p_expected_pending_revision not in (0, 1) then
    raise exception 'Flight Duffel pending webhook resolution CAS is invalid';
  end if;
  select pending.* into v_pending
    from public.flight_consumer_duffel_webhook_pending_links as pending
   where pending.id = p_pending_link_id for share;
  if not found or v_pending.execution_mode <> 'test' then
    raise exception 'Flight Duffel pending webhook association is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_pending.execution_scope_sha256, 'provider_event'
  );
  select ledger.* into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = v_pending.ledger_id for share;
  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_pending.order_id
     and flight_order.customer_id = v_pending.customer_id for share;
  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = v_pending.provider_attempt_id for share;
  if v_ledger.id is null or v_order.id is null or v_attempt.id is null
    or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.execution_scope_sha256 <> v_pending.execution_scope_sha256
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.order_id is not null
    or v_ledger.payment_id is not null
    or v_ledger.provider_attempt_id is not null
    or v_ledger.provider_offer_ref_sha256
      <> v_pending.provider_offer_ref_sha256
    or v_ledger.provider_order_ref_sha256
      <> v_pending.provider_order_ref_sha256
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.execution_scope_sha256 <> v_pending.execution_scope_sha256
    or v_order.provider_code <> 'duffel'
    or v_attempt.order_id <> v_order.id
    or v_attempt.customer_id <> v_order.customer_id
    or v_attempt.offer_id <> v_order.offer_id
    or v_attempt.operation <> 'create_order'
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256 <> v_pending.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.retry_authorized
    or not exists (
      select 1 from public.flight_offers as offer
       where offer.id = v_order.offer_id
         and offer.search_id = v_order.search_id
         and offer.execution_mode = 'test'
         and offer.execution_scope_sha256 = v_pending.execution_scope_sha256
         and offer.provider_code = 'duffel'
         and offer.provider_offer_ref_sha256
           = v_pending.provider_offer_ref_sha256
    )
    or not exists (
      select 1 from public.flight_payments as payment
       where payment.id = v_pending.payment_id
         and payment.order_id = v_order.id
         and payment.execution_mode = 'test'
         and payment.execution_scope_sha256 = v_pending.execution_scope_sha256
         and payment.processor_code = 'stripe'
         and payment.authorized_cents = v_order.total_cents
         and payment.currency = v_order.currency
    ) then
    raise exception 'Flight Duffel pending webhook association changed';
  end if;

  select resolution.* into v_resolution
    from public.flight_consumer_duffel_webhook_pending_link_resolutions as resolution
   where resolution.pending_link_id = v_pending.id;
  if found then
    if p_expected_pending_revision not in (0, 1)
      or v_resolution.ledger_id <> v_pending.ledger_id
      or v_resolution.attempt_terminal_state <> v_attempt.state
      or v_resolution.attempt_terminal_revision <> v_attempt.revision
      or v_resolution.attempt_terminal_receipt_sha256
        <> v_attempt.terminal_receipt_sha256 then
      raise exception 'Flight Duffel pending webhook resolution replay collides';
    end if;
    return query select v_pending.id, 1, v_resolution.outcome,
      case when v_resolution.outcome = 'linked' then v_order.id end,
      case when v_resolution.outcome = 'linked' then v_order.customer_id end,
      case when v_resolution.outcome = 'linked' then v_attempt.id end,
      case when v_resolution.outcome = 'linked' then v_order.status end,
      case when v_resolution.outcome = 'linked'
        then v_pending.execution_scope_sha256 end;
    return;
  end if;
  if p_expected_pending_revision <> 0 then
    raise exception 'Flight Duffel pending webhook resolution CAS failed';
  end if;
  if v_attempt.state = 'dispatching' and v_attempt.revision = 1 then
    return query select v_pending.id, 0, 'pending'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;
  if v_attempt.state = 'succeeded' and v_attempt.revision = 2
    and v_order.provider_order_ref_sha256 is null then
    return query select v_pending.id, 0, 'pending'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text;
    return;
  elsif v_attempt.state = 'succeeded' and v_attempt.revision = 2
    and v_order.provider_order_ref_sha256
      = v_pending.provider_order_ref_sha256 then
    v_outcome := 'linked';
  elsif v_attempt.state = 'succeeded' and v_attempt.revision = 2 then
    v_outcome := 'review';
  elsif v_attempt.state in ('failed', 'ambiguous') and v_attempt.revision = 2 then
    v_outcome := 'review';
  else
    raise exception 'Flight Duffel pending webhook attempt state is invalid';
  end if;
  if v_attempt.terminal_receipt_sha256 is null then
    raise exception 'Flight Duffel pending webhook terminal evidence is incomplete';
  end if;
  v_resolution_receipt_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.duffel-webhook-pending-resolution.v1',
      'pending_link_id', v_pending.id::text,
      'ledger_id', v_pending.ledger_id::text,
      'association_receipt_sha256', v_pending.association_receipt_sha256,
      'provider_attempt_id', v_attempt.id::text,
      'attempt_terminal_state', v_attempt.state,
      'attempt_terminal_revision', v_attempt.revision,
      'attempt_terminal_receipt_sha256', v_attempt.terminal_receipt_sha256,
      'outcome', v_outcome
    )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.flight_consumer_duffel_webhook_pending_link_resolutions (
    pending_link_id, ledger_id, outcome, attempt_terminal_state,
    attempt_terminal_revision, attempt_terminal_receipt_sha256,
    resolution_receipt_sha256
  ) values (
    v_pending.id, v_pending.ledger_id, v_outcome, v_attempt.state,
    v_attempt.revision, v_attempt.terminal_receipt_sha256,
    v_resolution_receipt_sha256
  ) on conflict (pending_link_id) do nothing;
  select resolution.* into v_resolution
    from public.flight_consumer_duffel_webhook_pending_link_resolutions as resolution
   where resolution.pending_link_id = v_pending.id;
  if not found
    or v_resolution.ledger_id <> v_pending.ledger_id
    or v_resolution.outcome <> v_outcome
    or v_resolution.attempt_terminal_state <> v_attempt.state
    or v_resolution.attempt_terminal_revision <> v_attempt.revision
    or v_resolution.attempt_terminal_receipt_sha256
      <> v_attempt.terminal_receipt_sha256
    or v_resolution.resolution_receipt_sha256
      <> v_resolution_receipt_sha256 then
    raise exception 'Flight Duffel pending webhook resolution CAS collided';
  end if;
  return query select v_pending.id, 1, v_resolution.outcome,
    case when v_resolution.outcome = 'linked' then v_order.id end,
    case when v_resolution.outcome = 'linked' then v_order.customer_id end,
    case when v_resolution.outcome = 'linked' then v_attempt.id end,
    case when v_resolution.outcome = 'linked' then v_order.status end,
    case when v_resolution.outcome = 'linked'
      then v_pending.execution_scope_sha256 end;
end;
$resolve_flight_consumer_duffel_pending_webhook_link$;

-- Bounded post-terminal convergence only resolves local append-only evidence.
-- It never contacts Duffel and cannot dispatch or retry a provider operation.
create function public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_max_links integer default 8
)
returns table (
  pending_link_id uuid,
  pending_revision integer,
  pending_state text,
  order_id uuid,
  customer_id uuid,
  provider_attempt_id uuid,
  order_status text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_duffel_pending_links_for_attempt$
#variable_conflict error
declare
  v_attempt public.flight_provider_request_attempts;
  v_pending record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel bounded pending webhook resolution is service-role only';
  end if;
  if p_attempt_id is null or p_expected_terminal_revision <> 2
    or p_max_links not between 1 and 8 then
    raise exception 'Flight Duffel bounded pending webhook resolution is invalid';
  end if;
  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for share;
  if not found
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.state not in ('succeeded', 'failed', 'ambiguous')
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.retry_authorized then
    raise exception 'Flight Duffel terminal attempt is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_attempt.execution_scope_sha256, 'provider_event'
  );
  for v_pending in
    select pending.id
      from public.flight_consumer_duffel_webhook_pending_links as pending
      left join public.flight_consumer_duffel_webhook_pending_link_resolutions
        as resolution on resolution.pending_link_id = pending.id
     where pending.provider_attempt_id = v_attempt.id
       and pending.execution_mode = 'test'
       and pending.execution_scope_sha256 = v_attempt.execution_scope_sha256
       and resolution.id is null
     order by pending.created_at, pending.id
     limit p_max_links
  loop
    return query select *
      from public.resolve_flight_consumer_duffel_pending_webhook_link_v1(
        v_pending.id, 0
      );
  end loop;
end;
$resolve_flight_consumer_duffel_pending_links_for_attempt$;

revoke all on table public.flight_consumer_duffel_webhook_pending_links
  from public, anon, authenticated, service_role;
revoke all on table public.flight_consumer_duffel_webhook_pending_link_resolutions
  from public, anon, authenticated, service_role;
revoke all on function
  public.reject_flight_consumer_duffel_pending_link_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(
    uuid, integer, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(
    uuid, integer, integer
  ) from public, anon, authenticated, service_role;

grant execute on function
  public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(
    uuid, integer, text, text
  ) to service_role;
grant execute on function
  public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer)
  to service_role;
grant execute on function
  public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(
    uuid, integer, integer
  ) to service_role;

comment on table public.flight_consumer_duffel_webhook_pending_links is
  'Append-only candidate association for a verified unlinked Duffel TEST order.created envelope and one immutable local create-order attempt.';
comment on table public.flight_consumer_duffel_webhook_pending_link_resolutions is
  'Append-only terminal linked/review resolution for a Duffel TEST pending webhook association; the original webhook ledger envelope is never rewritten.';
comment on function
  public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(
    uuid, integer, text, text
  ) is 'Enqueues one digest-only TEST order.created association while its exact create-order attempt is dispatching or terminal; it never dispatches a provider request.';
comment on function
  public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer)
  is 'CAS-resolves one append-only pending Duffel TEST webhook association only after exact provider-attempt terminalization.';
comment on function
  public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(
    uuid, integer, integer
  ) is 'Boundedly resolves up to eight pending Duffel TEST webhook associations after exact local attempt terminalization; it performs no provider operation.';

do $flight_consumer_preview_090_postcondition$
declare
  v_safe_count integer;
  v_enqueue_source text;
  v_resolve_source text;
  v_bounded_source text;
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
  select routine.prosrc into v_enqueue_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer,text,text)'
   );
  select routine.prosrc into v_resolve_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer)'
   );
  select routine.prosrc into v_bounded_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(uuid,integer,integer)'
   );
  if v_safe_count <> 1
    or not exists (
      select 1 from pg_catalog.pg_class as relation
       where relation.oid = to_regclass(
         'public.flight_consumer_duffel_webhook_pending_links'
       ) and relation.relrowsecurity and relation.relforcerowsecurity
    )
    or not exists (
      select 1 from pg_catalog.pg_class as relation
       where relation.oid = to_regclass(
         'public.flight_consumer_duffel_webhook_pending_link_resolutions'
       ) and relation.relrowsecurity and relation.relforcerowsecurity
    )
    or v_enqueue_source is null
    or position('v_ledger.provider_live_mode is distinct from false'
      in v_enqueue_source) = 0
    or position('attempt.state = ''dispatching''' in v_enqueue_source) = 0
    or v_resolve_source is null
    or position('v_attempt.state = ''dispatching''' in v_resolve_source) = 0
    or position('v_outcome := ''linked''' in v_resolve_source) = 0
    or v_bounded_source is null
    or position('p_max_links not between 1 and 8' in v_bounded_source) = 0
    or position('limit p_max_links' in v_bounded_source) = 0
    or not has_function_privilege(
      'service_role',
      'public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(uuid,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid,integer)',
      'EXECUTE'
    )
    or has_table_privilege(
      'service_role',
      'public.flight_consumer_duffel_webhook_pending_links',
      'SELECT,INSERT,UPDATE,DELETE'
    ) then
    raise exception 'Flight Consumer Preview migration 090 postcondition failed';
  end if;
end;
$flight_consumer_preview_090_postcondition$;

commit;
