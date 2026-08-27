begin;

lock table public.flight_consumer_live_checkout_authorization_bridges,
  public.flight_consumer_live_checkout_evidence_aggregates,
  public.flight_consumer_live_duffel_order_executions
  in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_checkout_authorization_bridges
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live checkout authorization bridge evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_duffel_order_authorization_bridge_110
  on public.flight_consumer_live_duffel_order_executions;
drop function
  public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1();

drop function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  uuid, uuid, text, text, text, text, text, text, text,
  timestamp with time zone
);
alter function
  public.prepare_flight_consumer_live_stripe_confirmation_frozen109(
    uuid, uuid, text, text, text, text, text, text, text,
    timestamp with time zone
  ) rename to prepare_flight_consumer_live_stripe_confirmation_v1;
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

-- Restore the exact frozen-107 finalization behavior. This rollback is only
-- allowed while 110 has recorded no evidence, so no authorization-bound
-- receipt can be orphaned or reinterpreted.
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

alter function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) owner to postgres;
revoke all on function
  public.finalize_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text
  ) from public, anon, authenticated;
grant execute on function
  public.finalize_flight_consumer_live_checkout_evidence_v1(
    uuid, integer, text, text, text
  ) to service_role;
comment on function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
) is
  'Finalizes evidence only while the exact refreshed offer and zero-dispatch Stripe prerequisite remain valid; it grants no dispatch, booking, payment, settlement, ticketing, or release authority.';

drop trigger flight_consumer_live_checkout_authorization_bridge_guard
  on public.flight_consumer_live_checkout_authorization_bridges;
drop function
  public.protect_flight_consumer_live_checkout_authorization_bridge_v1();
drop table public.flight_consumer_live_checkout_authorization_bridges;

commit;
