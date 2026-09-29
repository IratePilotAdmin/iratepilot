begin;

-- Turn verified adverse Preview webhook signals into one durable, locally
-- reviewable reconciliation case. This migration never changes an order or
-- payment lifecycle, enables provider servicing, dispatches provider traffic,
-- sends a customer notification, moves money, or authorizes Production.
do $flight_consumer_preview_081_dependencies$
begin
  if to_regclass('public.flight_consumer_webhook_ledger') is null
    or to_regclass('public.flight_reconciliation_cases') is null
    or to_regprocedure(
      'public.resolve_flight_consumer_duffel_webhook_link_v1(text,text)'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_verified_duffel_order_webhook_v1(text,text,text,text,text,text,timestamptz,boolean,text,text)'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_preview_activation_preflight_v1(text)'
    ) is null
    or to_regprocedure(
      'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.flight_consumer_preview_activation_manifest_sha256_v2()'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_async_duffel_convergence_v1(uuid,uuid,uuid)'
    ) is null then
    raise exception 'Flight webhook operational escalation requires migrations 068 through 080';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight webhook operational escalation requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_081_dependencies$;

-- An incremental 080 -> 081 install must never inherit an already-active v2
-- runtime receipt. Require the exact fail-closed relocked posture before any
-- 081 objects are installed; the next activation must traverse the v3 wrapper.
do $flight_consumer_preview_081_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 081 requires relock before migration';
  end if;
end;
$flight_consumer_preview_081_relocked_precondition$;

-- Link the operational case to the exact verified webhook ledger row. The
-- nullable column preserves all earlier reconciliation evidence, while the
-- partial unique index makes adverse-webhook escalation exactly-once.
alter table public.flight_reconciliation_cases
  add column source_webhook_ledger_id uuid
    references public.flight_consumer_webhook_ledger(id) on delete restrict;

create unique index flight_reconciliation_source_webhook_ledger_uidx
  on public.flight_reconciliation_cases (source_webhook_ledger_id)
  where source_webhook_ledger_id is not null;

-- The 076 resolver required both an order and offer digest and only admitted
-- pre-ticket states. Creation-failed events can contain only an offer, while
-- schedule-change events can contain only the provider order. Admit either
-- exact identity without weakening the test-scope, payment, attempt, or
-- execution-binding requirements.
create or replace function public.resolve_flight_consumer_duffel_webhook_link_v1(
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  order_id uuid,
  customer_id uuid,
  provider_attempt_id uuid,
  order_status text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_duffel_webhook_link_081$
declare
  v_count integer;
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel webhook linkage is service-role only';
  end if;
  if (p_provider_order_ref_sha256 is null
      and p_provider_offer_ref_sha256 is null)
    or (p_provider_order_ref_sha256 is not null
      and p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$')
    or (p_provider_offer_ref_sha256 is not null
      and p_provider_offer_ref_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'Flight Duffel webhook provider identity is invalid';
  end if;
  select bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_scope, 'provider_event'
  );

  select count(*)::integer into v_count
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
     and flight_order.execution_scope_sha256 = v_scope
     and flight_order.provider_code = 'duffel'
     and flight_order.status in (
       'order_creating', 'booked', 'ticketing_pending', 'ticketed',
       'servicing', 'cancellation_pending', 'cancelled',
       'refund_pending', 'requires_review'
     )
     and (
       p_provider_order_ref_sha256 is null
       or flight_order.provider_order_ref_sha256 = p_provider_order_ref_sha256
       or (
         flight_order.status in ('order_creating', 'requires_review')
         and flight_order.provider_order_ref_sha256 is null
         and p_provider_offer_ref_sha256 is not null
       )
     )
     and (
       p_provider_offer_ref_sha256 is null
       or offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     )
     and (
       p_provider_order_ref_sha256 is not null
       or flight_order.status in ('order_creating', 'requires_review')
     )
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_scope
     and offer.provider_code = 'duffel'
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_scope
     and attempt.provider_code = 'duffel'
     and attempt.state = 'succeeded'
     and attempt.revision = 2
     and not attempt.retry_authorized
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_scope
     and payment.currency = flight_order.currency;
  if v_count = 0 then return; end if;
  if v_count <> 1 then
    raise exception 'Flight Duffel webhook identity does not resolve uniquely';
  end if;

  return query
  select flight_order.id, flight_order.customer_id, attempt.id,
    flight_order.status, flight_order.execution_scope_sha256
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
     and flight_order.execution_scope_sha256 = v_scope
     and flight_order.provider_code = 'duffel'
     and flight_order.status in (
       'order_creating', 'booked', 'ticketing_pending', 'ticketed',
       'servicing', 'cancellation_pending', 'cancelled',
       'refund_pending', 'requires_review'
     )
     and (
       p_provider_order_ref_sha256 is null
       or flight_order.provider_order_ref_sha256 = p_provider_order_ref_sha256
       or (
         flight_order.status in ('order_creating', 'requires_review')
         and flight_order.provider_order_ref_sha256 is null
         and p_provider_offer_ref_sha256 is not null
       )
     )
     and (
       p_provider_offer_ref_sha256 is null
       or offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     )
     and (
       p_provider_order_ref_sha256 is not null
       or flight_order.status in ('order_creating', 'requires_review')
     )
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_scope
     and offer.provider_code = 'duffel'
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_scope
     and attempt.provider_code = 'duffel'
     and attempt.state = 'succeeded'
     and attempt.revision = 2
     and not attempt.retry_authorized
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_scope
     and payment.currency = flight_order.currency;
end;
$resolve_flight_consumer_duffel_webhook_link_081$;

-- Exact retries must recover their original ledger linkage before consulting
-- mutable order/payment state. This returns either the immutable stored link
-- or an explicit historical-unlinked marker and rejects any envelope drift.
create function public.resolve_flight_consumer_duffel_webhook_replay_v1(
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  replay_found boolean,
  order_id uuid,
  customer_id uuid,
  provider_attempt_id uuid,
  order_status text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_duffel_webhook_replay$
declare
  v_scope text;
  v_existing public.flight_consumer_webhook_ledger;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel webhook replay linkage is service-role only';
  end if;
  if p_event_type not in (
      'order.created', 'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected'
    )
    or p_event_id_sha256 is null
    or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null
    or (p_provider_order_ref_sha256 is not null
      and p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$')
    or (p_provider_offer_ref_sha256 is not null
      and p_provider_offer_ref_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'Flight Duffel webhook replay envelope is invalid';
  end if;
  select bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_scope, 'provider_event'
  );
  select * into v_existing
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_scope
     and ledger.source = 'duffel'
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for share;
  if not found then return; end if;
  if v_existing.event_id_sha256 <> p_event_id_sha256
    or v_existing.idempotency_sha256 <> p_idempotency_sha256
    or v_existing.event_type <> p_event_type
    or v_existing.payload_sha256 <> p_payload_sha256
    or v_existing.semantic_sha256 <> p_semantic_sha256
    or v_existing.verification_receipt_sha256
      <> p_verification_receipt_sha256
    or v_existing.occurred_at <> p_occurred_at then
    raise exception 'Flight Duffel webhook replay envelope collides';
  end if;
  if v_existing.order_id is null then
    if v_existing.payment_id is not null
      or v_existing.provider_attempt_id is not null
      or v_existing.provider_live_mode not in (false)
      or (v_existing.provider_order_ref_sha256 is not null
        and v_existing.provider_order_ref_sha256
          is distinct from p_provider_order_ref_sha256)
      or (v_existing.provider_offer_ref_sha256 is not null
        and v_existing.provider_offer_ref_sha256
          is distinct from p_provider_offer_ref_sha256) then
      raise exception 'Flight Duffel webhook historical unlink is invalid';
    end if;
    return query select true, null::uuid, null::uuid, null::uuid,
      null::text, v_existing.execution_scope_sha256;
    return;
  end if;
  if v_existing.payment_id is null or v_existing.provider_attempt_id is null then
    raise exception 'Flight Duffel webhook historical link is incomplete';
  end if;
  if v_existing.provider_live_mode is distinct from false
    or v_existing.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_existing.provider_offer_ref_sha256
      is distinct from p_provider_offer_ref_sha256 then
    raise exception 'Flight Duffel webhook historical provider identity collides';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_existing.order_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = v_existing.execution_scope_sha256
     and flight_order.provider_code = 'duffel';
  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = v_existing.provider_attempt_id
     and attempt.order_id = v_existing.order_id
     and attempt.customer_id = v_order.customer_id
     and attempt.consumer_flow_version = 1
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_existing.execution_scope_sha256
     and attempt.provider_code = 'duffel'
     and attempt.operation = 'create_order';
  if v_order.id is null or v_attempt.id is null
    or not exists (
      select 1 from public.flight_payments as payment
       where payment.id = v_existing.payment_id
         and payment.order_id = v_order.id
         and payment.execution_mode = 'test'
         and payment.execution_scope_sha256 = v_order.execution_scope_sha256
         and payment.processor_code = 'stripe'
    ) then
    raise exception 'Flight Duffel webhook historical link is unavailable';
  end if;
  return query select true, v_order.id, v_order.customer_id, v_attempt.id,
    v_order.status, v_order.execution_scope_sha256;
end;
$resolve_flight_consumer_duffel_webhook_replay$;

-- Dedicated unlinked Duffel ingress admits the reviewed adverse event names
-- and persists their canonical provider-reference digests for future replay.
-- Historical pre-081 unlinked order.created rows may have NULL reference
-- columns; their exact immutable envelope remains replayable.
create function public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_live_mode boolean,
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  decision text,
  ledger_id uuid,
  ledger_revision integer,
  ledger_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_verified_unlinked_duffel_webhook$
declare
  v_scope text;
  v_existing public.flight_consumer_webhook_ledger;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight unlinked Duffel webhook ingress is service-role only';
  end if;
  if p_live_mode is distinct from false
    or p_event_type not in (
      'order.created', 'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected'
    )
    or p_event_id_sha256 is null
    or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null
    or (p_event_type = 'order.created' and (
      p_provider_order_ref_sha256 is null
      or p_provider_offer_ref_sha256 is null
    ))
    or (p_event_type = 'order.creation_failed'
      and p_provider_offer_ref_sha256 is null)
    or (p_event_type in (
      'air.order.changed', 'order.airline_initiated_change_detected'
    ) and p_provider_order_ref_sha256 is null)
    or (p_provider_order_ref_sha256 is not null
      and p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$')
    or (p_provider_offer_ref_sha256 is not null
      and p_provider_offer_ref_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'Flight unlinked Duffel webhook envelope is invalid';
  end if;
  select bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_scope, 'provider_event'
  );
  select * into v_existing
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_scope
     and ledger.source = 'duffel'
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for update;
  if found then
    if v_existing.event_id_sha256 <> p_event_id_sha256
      or v_existing.idempotency_sha256 <> p_idempotency_sha256
      or v_existing.event_type <> p_event_type
      or v_existing.payload_sha256 <> p_payload_sha256
      or v_existing.semantic_sha256 <> p_semantic_sha256
      or v_existing.verification_receipt_sha256
        <> p_verification_receipt_sha256
      or v_existing.occurred_at <> p_occurred_at
      or v_existing.order_id is not null
      or v_existing.payment_id is not null
      or v_existing.provider_attempt_id is not null
      or v_existing.provider_live_mode not in (false)
      or (v_existing.provider_order_ref_sha256 is not null
        and v_existing.provider_order_ref_sha256
          is distinct from p_provider_order_ref_sha256)
      or (v_existing.provider_offer_ref_sha256 is not null
        and v_existing.provider_offer_ref_sha256
          is distinct from p_provider_offer_ref_sha256) then
      raise exception 'Flight unlinked Duffel webhook replay collides';
    end if;
    return query select
      case when v_existing.event_id_sha256 = p_event_id_sha256
        then 'replay'::text else 'duplicate'::text end,
      v_existing.id, v_existing.revision, v_existing.state;
    return;
  end if;
  insert into public.flight_consumer_webhook_ledger (
    source, execution_mode, execution_scope_sha256, event_id_sha256,
    idempotency_sha256, event_type, payload_sha256, semantic_sha256,
    verification_receipt_sha256, order_id, payment_id, provider_attempt_id,
    provider_offer_ref_sha256, provider_order_ref_sha256,
    provider_live_mode, state, revision, occurred_at
  ) values (
    'duffel', 'test', v_scope, p_event_id_sha256, p_idempotency_sha256,
    p_event_type, p_payload_sha256, p_semantic_sha256,
    p_verification_receipt_sha256, null, null, null,
    p_provider_offer_ref_sha256, p_provider_order_ref_sha256,
    false, 'verified', 0, p_occurred_at
  ) returning * into v_ledger;
  return query select
    'created'::text, v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$record_flight_consumer_verified_unlinked_duffel_webhook$;

create or replace function public.record_flight_consumer_verified_duffel_order_webhook_v1(
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_live_mode boolean,
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  decision text,
  ledger_id uuid,
  ledger_revision integer,
  ledger_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_verified_duffel_order_webhook_081$
declare
  v_link record;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_payment public.flight_payments;
  v_existing public.flight_consumer_webhook_ledger;
  v_ledger public.flight_consumer_webhook_ledger;
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight verified Duffel order webhook ingress is service-role only';
  end if;
  if p_live_mode is distinct from false
    or p_event_type not in (
      'order.created', 'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected'
    )
    or p_event_id_sha256 is null
    or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null
    or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or (p_event_type = 'order.created' and (
      p_provider_order_ref_sha256 is null
      or p_provider_offer_ref_sha256 is null
    ))
    or (p_event_type = 'order.creation_failed'
      and p_provider_offer_ref_sha256 is null)
    or (p_event_type in (
      'air.order.changed', 'order.airline_initiated_change_detected'
    ) and p_provider_order_ref_sha256 is null) then
    raise exception 'Flight verified Duffel order webhook envelope is invalid';
  end if;

  select bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_scope, 'provider_event'
  );
  select * into v_existing
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_scope
     and ledger.source = 'duffel'
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for update;
  if found then
    if v_existing.event_id_sha256 <> p_event_id_sha256
      or v_existing.idempotency_sha256 <> p_idempotency_sha256
      or v_existing.event_type <> p_event_type
      or v_existing.payload_sha256 <> p_payload_sha256
      or v_existing.semantic_sha256 <> p_semantic_sha256
      or v_existing.verification_receipt_sha256
        <> p_verification_receipt_sha256
      or v_existing.occurred_at <> p_occurred_at
      or v_existing.order_id is null
      or v_existing.payment_id is null
      or v_existing.provider_attempt_id is null
      or v_existing.provider_live_mode is distinct from false
      or v_existing.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_existing.provider_offer_ref_sha256
        is distinct from p_provider_offer_ref_sha256 then
      raise exception 'Flight Duffel webhook event or idempotency digest collision';
    end if;
    return query select
      case when v_existing.event_id_sha256 = p_event_id_sha256
        then 'replay'::text else 'duplicate'::text end,
      v_existing.id, v_existing.revision, v_existing.state;
    return;
  end if;

  select * into v_link
    from public.resolve_flight_consumer_duffel_webhook_link_v1(
      p_provider_order_ref_sha256, p_provider_offer_ref_sha256
    );
  if not found then return; end if;
  select * into v_order from public.flight_orders
   where id = v_link.order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = v_link.provider_attempt_id for share;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  if v_order.id is null or v_attempt.id is null or v_payment.id is null
    or (p_event_type = 'order.creation_failed'
      and v_order.status not in ('order_creating', 'requires_review'))
    or (p_event_type in (
      'air.order.changed', 'order.airline_initiated_change_detected'
    ) and v_order.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256) then
    raise exception 'Flight verified Duffel order webhook link changed';
  end if;

  insert into public.flight_consumer_webhook_ledger (
    source, execution_mode, execution_scope_sha256, event_id_sha256,
    idempotency_sha256, event_type, payload_sha256, semantic_sha256,
    verification_receipt_sha256, order_id, payment_id, provider_attempt_id,
    provider_offer_ref_sha256, provider_order_ref_sha256,
    provider_live_mode, state, revision, occurred_at
  ) values (
    'duffel', 'test', v_order.execution_scope_sha256, p_event_id_sha256,
    p_idempotency_sha256, p_event_type, p_payload_sha256, p_semantic_sha256,
    p_verification_receipt_sha256, v_order.id, v_payment.id, v_attempt.id,
    p_provider_offer_ref_sha256, p_provider_order_ref_sha256,
    false, 'verified', 0, p_occurred_at
  ) returning * into v_ledger;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select
    'created'::text, v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$record_flight_consumer_verified_duffel_order_webhook_081$;

-- Bind the convergence projection to the exact current webhook lease without
-- exposing the lease digest. A delayed order.created delivery can therefore
-- prove an already-ticketed order is authoritative and let the caller close
-- only its own processing lease without any provider recovery request.
create function public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_expected_lease_token_sha256 text
)
returns table (
  order_id uuid,
  customer_id uuid,
  order_status text,
  execution_scope_sha256 text,
  provider_attempt_id uuid,
  provider_attempt_state text,
  provider_attempt_revision integer,
  ledger_id uuid,
  ledger_state text,
  ledger_revision integer,
  provider_offer_ref_sha256 text,
  provider_order_ref_sha256 text,
  recovery_evidence_receipt_sha256 text,
  recovery_retention_expires_at timestamptz,
  reconciliation_case_id uuid,
  reconciliation_case_status text,
  reconciliation_resolution_code text,
  reconciliation_resolution_actor_type text,
  reconciliation_system_receipt_sha256 text,
  reconciliation_updated_at timestamptz,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_async_duffel_convergence_lease_bound$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight async Duffel convergence lease binding is service-role only';
  end if;
  if p_expected_lease_token_sha256 is not null
    and p_expected_lease_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight async Duffel convergence lease binding is invalid';
  end if;
  return query
  select convergence.order_id, convergence.customer_id,
    convergence.order_status, convergence.execution_scope_sha256,
    convergence.provider_attempt_id, convergence.provider_attempt_state,
    convergence.provider_attempt_revision, convergence.ledger_id,
    convergence.ledger_state, convergence.ledger_revision,
    convergence.provider_offer_ref_sha256,
    convergence.provider_order_ref_sha256,
    convergence.recovery_evidence_receipt_sha256,
    convergence.recovery_retention_expires_at,
    convergence.reconciliation_case_id,
    convergence.reconciliation_case_status,
    convergence.reconciliation_resolution_code,
    convergence.reconciliation_resolution_actor_type,
    convergence.reconciliation_system_receipt_sha256,
    convergence.reconciliation_updated_at,
    convergence.issued_ticket_count
    from public.get_flight_consumer_async_duffel_convergence_v1(
      p_customer_id, p_order_id, p_ledger_id
    ) as convergence
    join public.flight_consumer_webhook_ledger as ledger
      on ledger.id = convergence.ledger_id
   where (
      convergence.ledger_state = 'processing'
      and convergence.ledger_revision = 1
      and p_expected_lease_token_sha256 is not null
      and ledger.processing_lease_token_sha256
        = p_expected_lease_token_sha256
    ) or (
      convergence.ledger_state = 'processed'
      and convergence.ledger_revision = 2
      and p_expected_lease_token_sha256 is null
      and ledger.state = 'processed'
      and ledger.revision = 2
      and ledger.completed_at is not null
      and ledger.outcome_sha256 is not null
      and (
        (
          ledger.processing_attempt_count = 0
          and ledger.processing_lease_token_sha256 is null
          and ledger.processing_lease_acquired_at is null
          and ledger.processing_lease_expires_at is null
          and ledger.last_recovery_receipt_sha256 is null
        )
        or (
          ledger.processing_attempt_count >= 1
          and ledger.processing_lease_token_sha256 is not null
          and ledger.processing_lease_token_sha256 ~ '^[0-9a-f]{64}$'
          and ledger.processing_lease_acquired_at is not null
          and ledger.processing_lease_expires_at
            > ledger.processing_lease_acquired_at
          and (
            (ledger.processing_attempt_count = 1
              and ledger.last_recovery_receipt_sha256 is null)
            or (ledger.processing_attempt_count > 1
              and ledger.last_recovery_receipt_sha256 is not null)
          )
        )
      )
    );
end;
$get_flight_consumer_async_duffel_convergence_lease_bound$;

-- One service-role-only RPC converts an exact linked adverse signal into an
-- open provider-event-gap case. The case targets the current state, so it
-- cannot authorize a lifecycle transition or provider dispatch. Locking the
-- ledger row serializes retries with terminal webhook completion.
create function public.record_flight_consumer_webhook_operational_escalation_v1(
  p_ledger_id uuid,
  p_expected_event_type text,
  p_expected_semantic_sha256 text,
  p_expected_lease_token_sha256 text default null
)
returns table (
  decision text,
  reconciliation_case_id uuid,
  order_id uuid,
  event_type text,
  case_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $record_flight_consumer_webhook_operational_escalation$
declare
  v_ledger public.flight_consumer_webhook_ledger;
  v_order public.flight_orders;
  v_payment public.flight_payments;
  v_case public.flight_reconciliation_cases;
  v_subject_type text;
  v_subject_id uuid;
  v_source_status text;
  v_source_revision_at timestamptz;
  v_expected_state_sha256 text;
  v_observed_state_sha256 text;
  v_target_state_sha256 text;
  v_target_authorized_cents bigint;
  v_target_captured_cents bigint;
  v_target_refunded_cents bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook operational escalation is service-role only';
  end if;
  if p_ledger_id is null
    or p_expected_event_type not in (
      'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected',
      'payment_intent.payment_failed', 'charge.refunded'
    )
    or p_expected_semantic_sha256 is null
    or p_expected_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or (p_expected_lease_token_sha256 is not null
      and p_expected_lease_token_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'Flight webhook operational escalation envelope is invalid';
  end if;

  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id
   for update;
  if not found
    or v_ledger.execution_mode <> 'test'
    or v_ledger.order_id is null
    or v_ledger.event_type <> p_expected_event_type
    or v_ledger.semantic_sha256 <> p_expected_semantic_sha256
    or not (
      (
        v_ledger.revision = 1
        and v_ledger.state = 'processing'
        and p_expected_lease_token_sha256 is not null
        and v_ledger.processing_lease_token_sha256
          = p_expected_lease_token_sha256
      )
      or (
        v_ledger.revision = 2
        and v_ledger.state in ('processed', 'duplicate', 'blocked')
        and p_expected_lease_token_sha256 is null
      )
    )
    or not (
      (v_ledger.source = 'duffel' and v_ledger.event_type in (
        'order.creation_failed', 'air.order.changed',
        'order.airline_initiated_change_detected'
      ))
      or (v_ledger.source = 'stripe' and v_ledger.event_type in (
        'payment_intent.payment_failed', 'charge.refunded'
      ))
    ) then
    raise exception 'Flight webhook operational escalation evidence does not match';
  end if;

  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_ledger.order_id;
  if not found
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.execution_scope_sha256 <> v_ledger.execution_scope_sha256
    or v_order.provider_code <> 'duffel' then
    raise exception 'Flight webhook operational escalation order is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'provider_event'
  );
  if not public.flight_consumer_preview_control_is_bound_v1(
    v_order.execution_scope_sha256
  ) then
    raise exception 'Flight webhook operational escalation scope is not bound';
  end if;

  if v_ledger.source = 'duffel' then
    if v_ledger.payment_id is null
      or v_ledger.provider_attempt_id is null
      or not exists (
        select 1 from public.flight_provider_request_attempts as attempt
         where attempt.id = v_ledger.provider_attempt_id
           and attempt.order_id = v_order.id
           and attempt.customer_id = v_order.customer_id
           and attempt.consumer_flow_version = 1
           and attempt.execution_mode = 'test'
           and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
           and attempt.provider_code = 'duffel'
           and attempt.operation = 'create_order'
      ) then
      raise exception 'Flight Duffel operational escalation link is invalid';
    end if;
    v_subject_type := 'flight_order';
    v_subject_id := v_order.id;
  else
    if v_ledger.payment_id is null or v_ledger.provider_attempt_id is not null then
      raise exception 'Flight Stripe operational escalation link is invalid';
    end if;
    v_subject_type := 'flight_payment';
    v_subject_id := v_ledger.payment_id;
  end if;

  v_observed_state_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.webhook-operational.observed.v1',
      'ledger_id', v_ledger.id::text,
      'source', v_ledger.source,
      'event_type', v_ledger.event_type,
      'event_id_sha256', v_ledger.event_id_sha256,
      'semantic_sha256', v_ledger.semantic_sha256,
      'payload_sha256', v_ledger.payload_sha256,
      'verification_receipt_sha256', v_ledger.verification_receipt_sha256,
      'occurred_at', v_ledger.occurred_at,
      'execution_mode', v_ledger.execution_mode,
      'execution_scope_sha256', v_ledger.execution_scope_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  -- A replay is bound to immutable verified-webhook identity. Do not compare
  -- the case's original source snapshot with current mutable order/payment
  -- state: webhook completion and later legitimate lifecycle work can advance
  -- those revisions without changing the already-open operational case.
  select * into v_case
    from public.flight_reconciliation_cases as reconciliation
   where reconciliation.source_webhook_ledger_id = v_ledger.id
   for update;
  if found then
    if v_case.order_id is distinct from v_order.id
      or v_case.provider_code <> 'duffel'
      or v_case.execution_mode <> 'test'
      or v_case.execution_scope_sha256 <> v_order.execution_scope_sha256
      or v_case.case_type <> 'provider_event_gap'
      or v_case.subject_type <> v_subject_type
      or v_case.subject_id <> v_subject_id
      or v_case.observed_state_sha256 <> v_observed_state_sha256 then
      raise exception 'Flight webhook operational escalation replay collides';
    end if;
    return query select
      'replay'::text, v_case.id, v_order.id, v_ledger.event_type, v_case.status;
    return;
  end if;

  if v_ledger.source = 'duffel' then
    v_source_status := v_order.status;
    v_source_revision_at := v_order.updated_at;
    v_expected_state_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.webhook-operational.expected.v1',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id::text,
        'source_status', v_source_status,
        'source_revision_at', v_source_revision_at,
        'execution_mode', v_order.execution_mode,
        'execution_scope_sha256', v_order.execution_scope_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');
    v_target_state_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.reconciliation.target.v1',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id::text,
        'target_status', v_source_status,
        'execution_mode', v_order.execution_mode,
        'execution_scope_sha256', v_order.execution_scope_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');
  else
    select * into v_payment from public.flight_payments as payment
     where payment.id = v_ledger.payment_id
       and payment.order_id = v_order.id
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_order.execution_scope_sha256
       and payment.processor_code = 'stripe';
    if not found then
      raise exception 'Flight Stripe operational escalation link is invalid';
    end if;
    v_source_status := v_payment.status;
    v_source_revision_at := v_payment.updated_at;
    v_target_authorized_cents := v_payment.authorized_cents;
    v_target_captured_cents := v_payment.captured_cents;
    v_target_refunded_cents := v_payment.refunded_cents;
    v_expected_state_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.webhook-operational.expected.v1',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id::text,
        'source_status', v_source_status,
        'source_revision_at', v_source_revision_at,
        'target_authorized_cents', v_target_authorized_cents,
        'target_captured_cents', v_target_captured_cents,
        'target_refunded_cents', v_target_refunded_cents,
        'execution_mode', v_order.execution_mode,
        'execution_scope_sha256', v_order.execution_scope_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');
    v_target_state_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.reconciliation.target.v1',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id::text,
        'target_status', v_source_status,
        'target_authorized_cents', v_target_authorized_cents,
        'target_captured_cents', v_target_captured_cents,
        'target_refunded_cents', v_target_refunded_cents,
        'execution_mode', v_order.execution_mode,
        'execution_scope_sha256', v_order.execution_scope_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');
  end if;

  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status,
    source_revision_at, expected_state_sha256, observed_state_sha256,
    target_status, target_authorized_cents, target_captured_cents,
    target_refunded_cents, target_state_sha256, status,
    source_webhook_ledger_id
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'provider_event_gap', v_subject_type, v_subject_id, v_source_status,
    v_source_revision_at, v_expected_state_sha256, v_observed_state_sha256,
    v_source_status, v_target_authorized_cents, v_target_captured_cents,
    v_target_refunded_cents, v_target_state_sha256, 'open', v_ledger.id
  ) returning * into v_case;
  return query select
    'created'::text, v_case.id, v_order.id, v_ledger.event_type, v_case.status;
end;
$record_flight_consumer_webhook_operational_escalation$;

-- The generic reconciliation child validator intentionally binds a case to the
-- subject's exact updated_at. Completing the verified Duffel ledger advances
-- flight_orders.updated_at after this case is inserted, even though it changes
-- no commerce lifecycle or money state. Route only the authenticated-admin,
-- CAS-authorized resolution of this exact immutable ledger-backed case through
-- a validator that re-proves the ledger, case snapshot, current target, paid
-- liability, and provider identities. The ordinary immutable-evidence trigger
-- remains installed and independently limits the update to resolution fields.
create function public.validate_flight_consumer_webhook_case_resolution_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $validate_flight_consumer_webhook_case_resolution$
declare
  v_ledger public.flight_consumer_webhook_ledger;
  v_order public.flight_orders;
  v_expected_state_sha256 text;
  v_observed_state_sha256 text;
  v_target_state_sha256 text;
begin
  if tg_op <> 'UPDATE'
    or current_setting(
      'app.flight_consumer_webhook_case_resolution_expected_updated_at', true
    ) is distinct from old.updated_at::text
    or coalesce(auth.role(), '') <> 'authenticated'
    or auth.uid() is null
    or new.resolved_by is distinct from auth.uid()
    or not exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
    or old.source_webhook_ledger_id is null
    or new.source_webhook_ledger_id
      is distinct from old.source_webhook_ledger_id
    or old.case_type <> 'provider_event_gap'
    or old.subject_type <> 'flight_order'
    or old.subject_id is distinct from old.order_id
    or old.status not in ('open', 'investigating', 'blocked')
    or new.status <> 'resolved'
    or new.resolution_actor_type <> 'administrator'
    or new.system_resolution_receipt_sha256 is not null
    or new.resolution_code not in (
      'local_state_corrected', 'provider_state_confirmed',
      'payment_reversed', 'ticket_reissued',
      'duplicate_suppressed', 'manual_followup_required'
    )
    or new.resolution_evidence_sha256 is null
    or new.resolution_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or new.resolved_at is null
    or to_jsonb(new) - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] then
    raise exception 'Flight webhook operational-case resolution is unavailable';
  end if;

  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = old.source_webhook_ledger_id
     and ledger.source = 'duffel'
     and ledger.event_type in (
       'order.creation_failed', 'air.order.changed',
       'order.airline_initiated_change_detected'
     )
     and ledger.execution_mode = 'test'
     and ledger.execution_scope_sha256 = old.execution_scope_sha256
     and ledger.order_id = old.order_id
     and ledger.payment_id is not null
     and ledger.provider_attempt_id is not null
     and ledger.provider_live_mode is false
     and ledger.state in ('processed', 'duplicate', 'blocked')
     and ledger.revision = 2
     and ledger.completed_at is not null
     and ledger.outcome_sha256 is not null
     and (
       (
         ledger.processing_attempt_count = 0
         and ledger.processing_lease_token_sha256 is null
         and ledger.processing_lease_acquired_at is null
         and ledger.processing_lease_expires_at is null
         and ledger.last_recovery_receipt_sha256 is null
       )
       or (
         ledger.processing_attempt_count >= 1
         and ledger.processing_lease_token_sha256 is not null
         and ledger.processing_lease_token_sha256 ~ '^[0-9a-f]{64}$'
         and ledger.processing_lease_acquired_at is not null
         and ledger.processing_lease_expires_at
           > ledger.processing_lease_acquired_at
         and (
           (ledger.processing_attempt_count = 1
             and ledger.last_recovery_receipt_sha256 is null)
           or (ledger.processing_attempt_count > 1
             and ledger.last_recovery_receipt_sha256 is not null)
         )
       )
     );
  if not found then
    raise exception 'Flight webhook operational-case ledger is unavailable';
  end if;

  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = old.order_id
     and flight_order.id = old.subject_id
     and flight_order.consumer_flow_version = 1
     and flight_order.provider_code = old.provider_code
     and flight_order.provider_code = 'duffel'
     and flight_order.execution_mode = old.execution_mode
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = old.execution_scope_sha256
     and flight_order.status = old.source_status
     and flight_order.status = old.target_status
     and flight_order.updated_at >= old.source_revision_at;
  if not found then
    raise exception 'Flight webhook operational-case order target changed';
  end if;

  if not exists (
    select 1
      from public.flight_provider_request_attempts as attempt
      join public.flight_offers as offer
        on offer.id = v_order.offer_id
       and offer.search_id = v_order.search_id
       and offer.execution_mode = 'test'
       and offer.execution_scope_sha256 = v_order.execution_scope_sha256
       and offer.provider_code = 'duffel'
      join public.flight_payments as payment
        on payment.id = v_ledger.payment_id
       and payment.order_id = v_order.id
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_order.execution_scope_sha256
       and payment.processor_code = 'stripe'
       and payment.currency = v_order.currency
       and payment.status = 'captured'
       and payment.authorized_cents = v_order.total_cents
       and payment.captured_cents = v_order.total_cents
       and payment.refunded_cents = 0
     where attempt.id = v_ledger.provider_attempt_id
       and attempt.order_id = v_order.id
       and attempt.customer_id = v_order.customer_id
       and attempt.search_id = v_order.search_id
       and attempt.offer_id = v_order.offer_id
       and attempt.consumer_flow_version = 1
       and attempt.provider_code = 'duffel'
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
       and attempt.operation = 'create_order'
       and attempt.state = 'succeeded'
       and attempt.revision = 2
       and not attempt.retry_authorized
       and (
         (v_ledger.event_type = 'order.creation_failed'
           and v_ledger.provider_offer_ref_sha256
             = offer.provider_offer_ref_sha256)
         or (v_ledger.event_type in (
             'air.order.changed', 'order.airline_initiated_change_detected'
           )
           and v_ledger.provider_order_ref_sha256
             = v_order.provider_order_ref_sha256)
       )
  ) then
    raise exception 'Flight webhook operational-case liability changed';
  end if;

  v_expected_state_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.webhook-operational.expected.v1',
      'subject_type', old.subject_type,
      'subject_id', old.subject_id::text,
      'source_status', old.source_status,
      'source_revision_at', old.source_revision_at,
      'execution_mode', old.execution_mode,
      'execution_scope_sha256', old.execution_scope_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  v_observed_state_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.webhook-operational.observed.v1',
      'ledger_id', v_ledger.id::text,
      'source', v_ledger.source,
      'event_type', v_ledger.event_type,
      'event_id_sha256', v_ledger.event_id_sha256,
      'semantic_sha256', v_ledger.semantic_sha256,
      'payload_sha256', v_ledger.payload_sha256,
      'verification_receipt_sha256', v_ledger.verification_receipt_sha256,
      'occurred_at', v_ledger.occurred_at,
      'execution_mode', v_ledger.execution_mode,
      'execution_scope_sha256', v_ledger.execution_scope_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  v_target_state_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.reconciliation.target.v1',
      'subject_type', old.subject_type,
      'subject_id', old.subject_id::text,
      'target_status', v_order.status,
      'execution_mode', v_order.execution_mode,
      'execution_scope_sha256', v_order.execution_scope_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  if old.expected_state_sha256 <> v_expected_state_sha256
    or old.observed_state_sha256 <> v_observed_state_sha256
    or old.target_state_sha256 <> v_target_state_sha256
    or old.target_authorized_cents is not null
    or old.target_captured_cents is not null
    or old.target_refunded_cents is not null then
    raise exception 'Flight webhook operational-case evidence changed';
  end if;
  return new;
end;
$validate_flight_consumer_webhook_case_resolution$;

-- Retain the 077 system-convergence exception and add only the exact
-- ledger-backed administrator resolution exception above.
drop trigger flight_reconciliation_cases_order_mode_guard
  on public.flight_reconciliation_cases;

create trigger flight_reconciliation_cases_order_mode_guard
before update on public.flight_reconciliation_cases
for each row when (
  not (
    old.status in ('open', 'investigating', 'blocked')
    and new.status = 'resolved'
    and old.case_type = 'ambiguous_order'
    and old.subject_type = 'flight_order'
    and old.source_status = 'requires_review'
    and old.target_status = 'order_creating'
    and current_setting(
      'app.flight_consumer_async_system_resolution_authorized', true
    ) = 'true'
  )
  and not (
    old.status in ('open', 'investigating', 'blocked')
    and new.status = 'resolved'
    and old.case_type = 'provider_event_gap'
    and old.subject_type = 'flight_order'
    and old.source_webhook_ledger_id is not null
    and current_setting(
      'app.flight_consumer_webhook_case_resolution_expected_updated_at', true
    ) = old.updated_at::text
  )
) execute function public.validate_flight_order_child_mode();

create trigger flight_reconciliation_cases_webhook_resolution_guard
before update of status, resolution_code, resolution_evidence_sha256,
  resolved_by, resolved_at
on public.flight_reconciliation_cases
for each row when (
  old.status in ('open', 'investigating', 'blocked')
  and new.status = 'resolved'
  and old.case_type = 'provider_event_gap'
  and old.subject_type = 'flight_order'
  and old.source_webhook_ledger_id is not null
  and current_setting(
    'app.flight_consumer_webhook_case_resolution_expected_updated_at', true
  ) = old.updated_at::text
) execute function public.validate_flight_consumer_webhook_case_resolution_v1();

-- Preserve the reviewed 076 administrator resolver behind a private name. The
-- wrapper only supplies the exact expected case revision to the trigger above;
-- the inherited function still performs authentication, row locking, runtime
-- authority, allowed-code validation, CAS, and the resolution update.
alter function public.resolve_flight_consumer_admin_reconciliation_v1(
  uuid, timestamptz, text, text
) rename to resolve_flight_consumer_admin_reconciliation_080_v1;
revoke all on function
  public.resolve_flight_consumer_admin_reconciliation_080_v1(
    uuid, timestamptz, text, text
  )
from public, anon, authenticated, service_role;

create function public.resolve_flight_consumer_admin_reconciliation_v1(
  p_case_id uuid,
  p_expected_updated_at timestamptz,
  p_resolution_code text,
  p_resolution_evidence_sha256 text
)
returns table (
  decision text,
  case_id uuid,
  case_status text,
  resolution_code text,
  resolution_evidence_sha256 text,
  resolved_by uuid,
  resolved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_admin_reconciliation_081$
declare
  v_case public.flight_reconciliation_cases;
begin
  if p_expected_updated_at is not null then
    select * into v_case
      from public.flight_reconciliation_cases as reconciliation
     where reconciliation.id = p_case_id;
    if v_case.id is not null
      and v_case.case_type = 'provider_event_gap'
      and v_case.subject_type = 'flight_order'
      and v_case.source_webhook_ledger_id is not null then
      perform set_config(
        'app.flight_consumer_webhook_case_resolution_expected_updated_at',
        p_expected_updated_at::text,
        true
      );
    end if;
  end if;
  return query
  select *
    from public.resolve_flight_consumer_admin_reconciliation_080_v1(
      p_case_id,
      p_expected_updated_at,
      p_resolution_code,
      p_resolution_evidence_sha256
    );
end;
$resolve_flight_consumer_admin_reconciliation_081$;

-- Private contract identity for the 081 operational gate. Migration 081's
-- exact bytes are pinned by the guarded installer; the self migration is named
-- by version here to avoid a self-referential file hash.
create function public.flight_consumer_preview_operational_escalation_contract_sha256_v1()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_operational_escalation_contract$
  select encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.webhook-operational-escalation.v1'
      || chr(10)
      || jsonb_build_object(
        'migration', '202608260120',
        'source_column', 'flight_reconciliation_cases.source_webhook_ledger_id',
        'case_type', 'provider_event_gap',
        'rpc', 'record_flight_consumer_webhook_operational_escalation_v1',
        'immutable_replay_rpc',
          'resolve_flight_consumer_duffel_webhook_replay_v1',
        'unlinked_ingress_rpc',
          'record_flight_consumer_verified_unlinked_duffel_webhook_v1',
        'operational_case_resolution_validator',
          'validate_flight_consumer_webhook_case_resolution_v1',
        'operational_case_resolution_rpc',
          'resolve_flight_consumer_admin_reconciliation_v1',
        'lease_bound_convergence_rpc',
          'get_flight_consumer_async_duffel_convergence_lease_bound_v1',
        'events', jsonb_build_array(
          'order.creation_failed', 'air.order.changed',
          'order.airline_initiated_change_detected',
          'payment_intent.payment_failed', 'charge.refunded'
        ),
        'direct_lifecycle_mutation', false,
        'provider_dispatch', false,
        'production_authorized', false
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
$flight_consumer_preview_operational_escalation_contract$;

create function public.assert_flight_consumer_preview_operational_escalation_contract_v1()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $assert_flight_consumer_preview_operational_escalation_contract$
begin
  if to_regprocedure(
      'public.record_flight_consumer_webhook_operational_escalation_v1(uuid,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.flight_consumer_preview_operational_escalation_contract_sha256_v1()'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(uuid,uuid,uuid,text)'
    ) is null
    or to_regprocedure(
      'public.resolve_flight_consumer_duffel_webhook_replay_v1(text,text,text,text,text,text,timestamptz,text,text)'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(text,text,text,text,text,text,timestamptz,boolean,text,text)'
    ) is null
    or to_regprocedure(
      'public.validate_flight_consumer_webhook_case_resolution_v1()'
    ) is null
    or to_regprocedure(
      'public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)'
    ) is null
    or not exists (
      select 1 from pg_catalog.pg_trigger as installed_trigger
       where installed_trigger.tgrelid =
           'public.flight_reconciliation_cases'::regclass
         and installed_trigger.tgname =
           'flight_reconciliation_cases_webhook_resolution_guard'
         and installed_trigger.tgenabled <> 'D'
    )
    or not exists (
      select 1 from pg_catalog.pg_attribute
       where attrelid = 'public.flight_reconciliation_cases'::regclass
         and attname = 'source_webhook_ledger_id'
         and not attisdropped
    )
    or not has_function_privilege(
      'service_role',
      'public.record_flight_consumer_webhook_operational_escalation_v1(uuid,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_flight_consumer_webhook_operational_escalation_v1(uuid,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.resolve_flight_consumer_duffel_webhook_replay_v1(text,text,text,text,text,text,timestamptz,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.resolve_flight_consumer_duffel_webhook_replay_v1(text,text,text,text,text,text,timestamptz,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(text,text,text,text,text,text,timestamptz,boolean,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(text,text,text,text,text,text,timestamptz,boolean,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.validate_flight_consumer_webhook_case_resolution_v1()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview operational escalation contract is unavailable';
  end if;
end;
$assert_flight_consumer_preview_operational_escalation_contract$;

-- Add a database-level fence to the locked -> active transition. The 080
-- activation implementation is made private below; only the 081 wrapper sets
-- this transaction-local authorization after verifying the operational gate.
create function public.enforce_flight_consumer_preview_081_activation_gate_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $enforce_flight_consumer_preview_081_activation_gate$
begin
  if old.execution_kill_switch_engaged
    and not new.execution_kill_switch_engaged
    and current_setting(
      'app.flight_consumer_preview_081_activation_contract', true
    ) is distinct from
      public.flight_consumer_preview_operational_escalation_contract_sha256_v1()
  then
    raise exception 'Flight Consumer Preview activation requires migration 081';
  end if;
  return new;
end;
$enforce_flight_consumer_preview_081_activation_gate$;

create trigger flight_runtime_controls_081_activation_gate
before update on public.flight_runtime_controls
for each row execute function
  public.enforce_flight_consumer_preview_081_activation_gate_v1();

-- Preserve the audited 080 implementations under private names, then replace
-- the public RPCs with 081-gated wrappers. The preflight version changes to v2
-- so an application built for this migration rejects an 080-only database.
alter function public.get_flight_consumer_preview_activation_preflight_v1(text)
  rename to get_flight_consumer_preview_activation_preflight_080_v1;
alter function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) rename to activate_flight_consumer_preview_080_v1;

revoke all on function
  public.get_flight_consumer_preview_activation_preflight_080_v1(text),
  public.activate_flight_consumer_preview_080_v1(
    timestamptz, text, text, text, text, text, text
  )
from public, anon, authenticated, service_role;

create function public.flight_consumer_preview_activation_manifest_sha256_v3()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_activation_manifest_081$
  select encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.activation-manifest.v3' || chr(10)
      || jsonb_build_object(
        'activation_control_migration', '202608260120',
        'migration_080_sha256',
          'b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a',
        'predecessor_manifest_sha256',
          public.flight_consumer_preview_activation_manifest_sha256_v2(),
        'operational_escalation_contract_sha256',
          public.flight_consumer_preview_operational_escalation_contract_sha256_v1()
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
$flight_consumer_preview_activation_manifest_081$;

create function public.get_flight_consumer_preview_activation_preflight_v1(
  p_stripe_account_id text
)
returns table (
  version text,
  ready boolean,
  control_key text,
  expected_updated_at timestamptz,
  expected_execution_scope_sha256 text,
  expected_activation_evidence_sha256 text,
  expected_runtime_control_receipt_sha256 text,
  target_execution_scope_sha256 text,
  activation_manifest_sha256 text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_preview_activation_preflight_081$
declare
  v_preflight record;
begin
  perform public.assert_flight_consumer_preview_operational_escalation_contract_v1();
  select * into v_preflight
    from public.get_flight_consumer_preview_activation_preflight_080_v1(
      p_stripe_account_id
    );
  if not found or not v_preflight.ready then
    raise exception 'Flight Consumer Preview activation preflight is unavailable';
  end if;
  return query select
    'flight-consumer-preview-activation-preflight-v2'::text,
    true,
    v_preflight.control_key,
    v_preflight.expected_updated_at,
    v_preflight.expected_execution_scope_sha256,
    v_preflight.expected_activation_evidence_sha256,
    v_preflight.expected_runtime_control_receipt_sha256,
    v_preflight.target_execution_scope_sha256,
    public.flight_consumer_preview_activation_manifest_sha256_v3();
end;
$get_flight_consumer_preview_activation_preflight_081$;

create function public.activate_flight_consumer_preview_v1(
  p_expected_updated_at timestamptz,
  p_expected_execution_scope_sha256 text,
  p_expected_activation_evidence_sha256 text,
  p_expected_runtime_control_receipt_sha256 text,
  p_stripe_account_id text,
  p_activation_packet_sha256 text,
  p_activation_nonce text
)
returns table (
  decision text,
  control_key text,
  updated_at timestamptz,
  bound_execution_scope_sha256 text,
  activation_evidence_sha256 text,
  runtime_control_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $activate_flight_consumer_preview_081$
declare
  v_actor uuid;
  v_080 record;
  v_control public.flight_runtime_controls;
  v_manifest_sha256 text;
  v_activation_evidence_sha256 text;
  v_runtime_control_receipt_sha256 text;
begin
  perform public.assert_flight_consumer_preview_operational_escalation_contract_v1();
  perform set_config(
    'app.flight_consumer_preview_081_activation_contract',
    public.flight_consumer_preview_operational_escalation_contract_sha256_v1(),
    true
  );
  select * into strict v_080
  from public.activate_flight_consumer_preview_080_v1(
    p_expected_updated_at,
    p_expected_execution_scope_sha256,
    p_expected_activation_evidence_sha256,
    p_expected_runtime_control_receipt_sha256,
    p_stripe_account_id,
    p_activation_packet_sha256,
    p_activation_nonce
  );
  v_actor := auth.uid();
  if v_actor is null or v_080.decision is distinct from 'activated' then
    raise exception 'Flight Consumer Preview migration-081 activation failed';
  end if;

  -- The delegated 080 transition verifies the entire reviewed activation CAS,
  -- then this second guarded update makes the current durable runtime-control
  -- receipt attest the v3/081 contract. The runtime-control authority trigger
  -- requires fresh evidence and records this exact final state immutably.
  v_manifest_sha256 := public.flight_consumer_preview_activation_manifest_sha256_v3();
  v_activation_evidence_sha256 := encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.activation-evidence.v3' || chr(10)
      || jsonb_build_object(
        'actor_id', v_actor::text,
        'activation_packet_sha256', p_activation_packet_sha256,
        'activation_nonce_sha256', encode(extensions.digest(
          convert_to(p_activation_nonce, 'UTF8'), 'sha256'
        ), 'hex'),
        'previous_activation_evidence_sha256',
          v_080.activation_evidence_sha256,
        'previous_runtime_control_receipt_sha256',
          v_080.runtime_control_receipt_sha256,
        'requested_predecessor_activation_evidence_sha256',
          p_expected_activation_evidence_sha256,
        'requested_predecessor_runtime_control_receipt_sha256',
          p_expected_runtime_control_receipt_sha256,
        'target_execution_scope_sha256',
          v_080.bound_execution_scope_sha256,
        'activation_manifest_sha256', v_manifest_sha256,
        'operational_escalation_contract_sha256',
          public.flight_consumer_preview_operational_escalation_contract_sha256_v1(),
        'activation_control_migration', '202608260120',
        'provider_dispatch_authorized', false,
        'production_authorized', false
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  if v_activation_evidence_sha256 = v_080.activation_evidence_sha256 then
    raise exception 'Flight Consumer Preview migration-081 activation evidence must be fresh';
  end if;

  update public.flight_runtime_controls
     set activation_evidence_sha256 = v_activation_evidence_sha256,
         updated_by = v_actor
   where control_key = v_080.control_key
     and updated_at = v_080.updated_at
     and bound_execution_scope_sha256 = v_080.bound_execution_scope_sha256
     and activation_evidence_sha256 = v_080.activation_evidence_sha256
     and execution_kill_switch_engaged = false
     and provider_sandbox_traffic_enabled = true
     and provider_live_traffic_enabled = false
     and production_release_enabled = false
  returning * into v_control;
  if not found then
    raise exception 'Flight Consumer Preview migration-081 activation evidence CAS failed';
  end if;
  v_runtime_control_receipt_sha256 :=
    public.flight_current_runtime_control_receipt_sha256_v1();
  if v_runtime_control_receipt_sha256 = v_080.runtime_control_receipt_sha256 then
    raise exception 'Flight Consumer Preview migration-081 runtime receipt must be fresh';
  end if;
  return query select
    'activated'::text,
    v_control.control_key,
    v_control.updated_at,
    v_control.bound_execution_scope_sha256,
    v_control.activation_evidence_sha256,
    v_runtime_control_receipt_sha256;
end;
$activate_flight_consumer_preview_081$;

revoke all on function
  public.record_flight_consumer_webhook_operational_escalation_v1(
    uuid, text, text, text
  ),
  public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(
    uuid, uuid, uuid, text
  ),
  public.resolve_flight_consumer_duffel_webhook_replay_v1(
    text, text, text, text, text, text, timestamptz, text, text
  ),
  public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(
    text, text, text, text, text, text, timestamptz, boolean, text, text
  ),
  public.validate_flight_consumer_webhook_case_resolution_v1(),
  public.resolve_flight_consumer_admin_reconciliation_v1(
    uuid, timestamptz, text, text
  ),
  public.flight_consumer_preview_operational_escalation_contract_sha256_v1(),
  public.assert_flight_consumer_preview_operational_escalation_contract_v1(),
  public.enforce_flight_consumer_preview_081_activation_gate_v1(),
  public.flight_consumer_preview_activation_manifest_sha256_v3(),
  public.get_flight_consumer_preview_activation_preflight_v1(text),
  public.activate_flight_consumer_preview_v1(
    timestamptz, text, text, text, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.record_flight_consumer_webhook_operational_escalation_v1(
    uuid, text, text, text
  ),
  public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(
    uuid, uuid, uuid, text
  ),
  public.resolve_flight_consumer_duffel_webhook_replay_v1(
    text, text, text, text, text, text, timestamptz, text, text
  ),
  public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(
    text, text, text, text, text, text, timestamptz, boolean, text, text
  )
to service_role;
grant execute on function
  public.resolve_flight_consumer_admin_reconciliation_v1(
    uuid, timestamptz, text, text
  ),
  public.get_flight_consumer_preview_activation_preflight_v1(text),
  public.activate_flight_consumer_preview_v1(
    timestamptz, text, text, text, text, text, text
  )
to authenticated;

comment on column public.flight_reconciliation_cases.source_webhook_ledger_id is
  'Exact verified adverse Consumer Preview webhook source; no raw provider or payment payload.';
comment on function public.record_flight_consumer_webhook_operational_escalation_v1(
  uuid, text, text, text
) is
  'Service-role-only, idempotent adverse-webhook escalation into a local provider-event-gap case; it cannot mutate commerce state or dispatch servicing.';
comment on function public.get_flight_consumer_async_duffel_convergence_lease_bound_v1(
  uuid, uuid, uuid, text
) is
  'Service-role-only exact lease-bound convergence context for delayed Consumer Preview order.created delivery; returns no lease or provider credential.';
comment on function public.resolve_flight_consumer_duffel_webhook_replay_v1(
  text, text, text, text, text, text, timestamptz, text, text
) is
  'Service-role-only immutable-envelope Duffel webhook replay resolver; returns the original ledger link or historical-unlinked marker before mutable lifecycle lookup.';
comment on function public.record_flight_consumer_verified_unlinked_duffel_webhook_v1(
  text, text, text, text, text, text, timestamptz, boolean, text, text
) is
  'Service-role-only verified Duffel ingress for exact currently-unlinked test events; persists canonical provider-reference digests and replays the immutable envelope.';
comment on function public.validate_flight_consumer_webhook_case_resolution_v1() is
  'Trigger-only validator for one authenticated-admin resolution-only update of an exact terminal ledger-backed Duffel provider-event-gap case after ledger completion advanced only the order revision.';
comment on function public.resolve_flight_consumer_admin_reconciliation_v1(
  uuid, timestamptz, text, text
) is
  'Authenticated-admin CAS reconciliation resolver; migration 081 binds the exact expected case revision into the narrow ledger-backed operational-case resolution validator.';
comment on function public.get_flight_consumer_preview_activation_preflight_v1(text) is
  'Authenticated-admin locked-state CAS snapshot, version 2, requiring the exact migration-081 operational escalation contract.';
comment on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) is
  'Exclusive authenticated-admin CAS activation wrapper fenced by the migration-081 adverse-webhook operational escalation contract.';

commit;
