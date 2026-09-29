begin;

-- Forward hardening for the Preview-only Duffel create-order dispatch boundary.
-- This preserves the one-attempt journal while making crash recovery exact,
-- binding a fresh SQL deadline to refreshed-offer authority, revalidating the
-- offer/reprice/evidence under lock at claim, and exposing evidence absence as
-- metadata so the application can open review without redispatch.
do $flight_consumer_preview_089_dependencies$
declare
  v_prepare_source text;
  v_claim_source text;
  v_recovery_source text;
  v_ambiguity_source text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_offers') is null
    or to_regclass('public.flight_reprice_receipts') is null
    or to_regclass('public.flight_offer_evidence_vault') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_order_response_evidence_vault') is null
    or to_regprocedure(
      'public.prepare_flight_consumer_duffel_order_attempt_v1(uuid,text,text,text,text,text,text,text,text,text,timestamptz)'
    ) is null
    or to_regprocedure(
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
    ) is null
    or to_regprocedure(
      'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview order recovery hardening requires migrations 068 through 088';
  end if;

  select routine.prosrc into v_prepare_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.prepare_flight_consumer_duffel_order_attempt_v1(uuid,text,text,text,text,text,text,text,text,text,timestamptz)'
   );
  select routine.prosrc into v_claim_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
   );
  select routine.prosrc into v_recovery_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
   );
  select routine.prosrc into v_ambiguity_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)'
   );

  if v_prepare_source is null
    or position(
      'or p_dispatch_not_after > v_now + interval ''5 minutes'' then'
      in v_prepare_source
    ) = 0
    or position('p_dispatch_not_after > v_reprice.expires_at' in v_prepare_source) > 0
    or v_claim_source is null
    or position(
      'and evidence.retention_expires_at > clock_timestamp() for share'
      in v_claim_source
    ) = 0
    or position('v_offer.expires_at <= v_now' in v_claim_source) > 0
    or v_recovery_source is null
    or position(
      'Flight Duffel recovery response evidence is unavailable'
      in v_recovery_source
    ) = 0
    or position('v_evidence_available' in v_recovery_source) > 0
    or v_ambiguity_source is null
    or position('#variable_conflict error' in v_ambiguity_source) = 0
    or position(
      'v_attempt.state in (''prepared'', ''failed'', ''blocked'')'
      in v_ambiguity_source
    ) = 0 then
    raise exception 'Flight Consumer Preview order recovery predecessor has drifted';
  end if;
end;
$flight_consumer_preview_089_dependencies$;

do $flight_consumer_preview_089_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 089 requires relock before hardening';
  end if;
end;
$flight_consumer_preview_089_relocked_precondition$;

create or replace function public.prepare_flight_consumer_duffel_order_attempt_v1(
  p_order_id uuid,
  p_offer_evidence_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_order_089$
#variable_conflict error
declare
  v_control public.flight_runtime_controls;
  v_order public.flight_orders;
  v_search public.flight_searches;
  v_reprice public.flight_reprice_receipts;
  v_payment public.flight_payments;
  v_evidence public.flight_offer_evidence_vault;
  v_attempt public.flight_provider_request_attempts;
  v_point_of_sale_sha256 text;
  v_now timestamptz;
  v_expected_travelers integer;
  v_actual_travelers integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order preparation is service-role only';
  end if;
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
   for update;
  if not found then
    raise exception 'Flight consumer order is unavailable';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  if found then
    if v_attempt.offer_evidence_receipt_sha256
        is distinct from p_offer_evidence_receipt_sha256
      or v_attempt.request_plan_sha256 is distinct from p_request_plan_sha256
      or v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.provider_binding_receipt_sha256
        is distinct from p_provider_binding_receipt_sha256
      or v_attempt.payment_binding_receipt_sha256
        is distinct from p_payment_binding_receipt_sha256
      or v_attempt.provider_settlement_binding_receipt_sha256
        is distinct from p_provider_settlement_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception 'Flight consumer order already has a different provider attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;

  if v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status <> 'payment_authorized'
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight consumer order is not ready for its one provider attempt';
  end if;
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled
    or not v_control.order_enabled
    or not v_control.payment_enabled
    or not v_control.ticketing_enabled
    or v_control.servicing_enabled
    or not v_control.provider_events_enabled
    or v_control.production_release_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from current_database()::text
    or v_control.bound_session_user is distinct from session_user::text
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_payment_processor_code is distinct from 'stripe'
    or v_control.bound_payment_environment is distinct from 'test'
    or v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'
    or v_control.bound_provider_settlement_environment is distinct from 'test'
    or v_control.bound_execution_scope_sha256 is distinct from v_order.execution_scope_sha256 then
    raise exception 'Flight consumer Preview split payment/settlement authority is disabled';
  end if;

  perform set_config('app.flight_environment', v_control.bound_environment, true);
  perform set_config('app.flight_project_ref', v_control.bound_project_ref, true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config(
    'app.flight_activation_evidence_sha256', v_control.activation_evidence_sha256, true
  );
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config(
    'app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_customer_payment_binding_receipt_sha256',
    p_payment_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_provider_settlement_binding_receipt_sha256',
    p_provider_settlement_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_request_authority_receipt_sha256',
    p_operation_authority_receipt_sha256,
    true
  );
  if not public.flight_runtime_capability_enabled(
      'test', 'order', 'duffel', null, v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'stripe', v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, v_order.execution_scope_sha256
    ) then
    raise exception 'Flight consumer order, Stripe payment, or ticketing receipt is unavailable';
  end if;

  select * into v_search
    from public.flight_searches as search
   where search.id = v_order.search_id
     and search.customer_id = v_order.customer_id
     and search.execution_mode = 'test'
     and search.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_reprice
    from public.flight_reprice_receipts as reprice
   where reprice.id = v_order.reprice_receipt_id
     and reprice.offer_id = v_order.offer_id
     and reprice.execution_mode = 'test'
     and reprice.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_payment
    from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
     and payment.status = 'captured'
   for share;
  select * into v_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = p_offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.provider_code = 'duffel'
     and evidence.stage = 'refreshed'
     and evidence.retention_expires_at > clock_timestamp()
   for share;
  if v_search.id is null or v_reprice.id is null or v_payment.id is null
    or v_evidence.id is null
    or v_reprice.status not in ('confirmed', 'price_changed')
    or v_reprice.expires_at <= clock_timestamp()
    or (v_reprice.status = 'price_changed' and (
      v_reprice.customer_accepted_by is distinct from v_order.customer_id
      or v_reprice.customer_acceptance_version is distinct from 1
      or v_reprice.customer_accepted_currency is distinct from v_order.currency
      or v_reprice.customer_accepted_total_cents is distinct from v_order.total_cents
    )) then
    raise exception 'Flight consumer order lacks current reprice, payment, or offer evidence';
  end if;

  v_expected_travelers := v_search.adult_count + v_search.child_count
    + v_search.infant_in_seat_count + v_search.infant_on_lap_count;
  select count(*) into v_actual_travelers
    from public.flight_passenger_refs as passenger
    join public.flight_secure_pii_records as pii
      on pii.secure_pii_record_ref = passenger.secure_pii_record_ref
     and pii.execution_mode = passenger.execution_mode
     and pii.execution_scope_sha256 = passenger.execution_scope_sha256
   where passenger.order_id = v_order.id
     and passenger.execution_mode = 'test'
     and passenger.execution_scope_sha256 = v_order.execution_scope_sha256
     and pii.customer_id = v_order.customer_id
     and pii.traveler_type = passenger.traveler_type
     and pii.pii_record_sha256 = passenger.pii_record_sha256
     and pii.deleted_at is null
     and pii.retention_expires_at > clock_timestamp();
  if v_actual_travelers <> v_expected_travelers then
    raise exception 'Flight consumer order lacks exact active encrypted passenger evidence';
  end if;

  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes'
    or p_dispatch_not_after > v_reprice.expires_at then
    raise exception 'Flight consumer order dispatch deadline is invalid';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256, request_plan_sha256, request_sha256,
    request_body_sha256, operation_authority_receipt_sha256,
    dispatch_not_after, state, revision, retry_authorized, prepared_at,
    consumer_flow_version, customer_id, search_id, offer_id, order_id,
    offer_evidence_receipt_sha256, payment_binding_receipt_sha256,
    provider_settlement_binding_receipt_sha256
  ) values (
    'customer:' || v_order.customer_id::text,
    'order:' || v_order.id::text,
    'create_order', 'duffel', 'test', v_order.execution_scope_sha256,
    v_control.activation_evidence_sha256, v_control.bound_adapter_version_sha256,
    p_adapter_source_sha256, v_control.bound_provider_account_sha256,
    v_point_of_sale_sha256, v_control.bound_content_scope_sha256,
    p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
    p_request_body_sha256, p_operation_authority_receipt_sha256,
    p_dispatch_not_after, 'prepared', 0, false, v_now,
    1, v_order.customer_id, v_order.search_id, v_order.offer_id, v_order.id,
    p_offer_evidence_receipt_sha256, p_payment_binding_receipt_sha256,
    p_provider_settlement_binding_receipt_sha256
  ) returning * into v_attempt;

  update public.flight_orders
     set status = 'order_creating'
   where id = v_order.id and status = 'payment_authorized';
  if not found then
    raise exception 'Flight consumer order transition CAS failed';
  end if;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Flight consumer order already has a provider request identity';
end;
$prepare_flight_consumer_order_089$;

create or replace function public.claim_flight_consumer_duffel_order_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $claim_flight_consumer_order_089$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_offer public.flight_offers;
  v_reprice public.flight_reprice_receipts;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_evidence public.flight_offer_evidence_vault;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
  v_expected_travelers integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order claim is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_order.consumer_flow_version <> 1
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.state <> 'prepared' or v_attempt.revision <> p_expected_revision
    or v_order.status not in ('order_creating', 'requires_review')
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight consumer Duffel order dispatch CAS failed';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  if not public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'stripe', v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, v_order.execution_scope_sha256
    ) then
    raise exception 'Flight payment or ticketing authority changed before Duffel dispatch';
  end if;
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config(
    'app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_customer_payment_binding_receipt_sha256',
    p_payment_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_provider_settlement_binding_receipt_sha256',
    p_provider_settlement_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_request_authority_receipt_sha256',
    p_operation_authority_receipt_sha256, true
  );
  if p_adapter_source_sha256 is distinct from v_attempt.adapter_source_sha256
    or p_provider_binding_receipt_sha256
      is distinct from v_attempt.provider_binding_receipt_sha256
    or p_payment_binding_receipt_sha256
      is distinct from v_attempt.payment_binding_receipt_sha256
    or p_provider_settlement_binding_receipt_sha256
      is distinct from v_attempt.provider_settlement_binding_receipt_sha256
    or p_operation_authority_receipt_sha256
      is distinct from v_attempt.operation_authority_receipt_sha256
    or v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight consumer Duffel authority changed before dispatch';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'), 'hex'
  );
  if v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256 then
    raise exception 'Flight consumer point-of-sale binding changed before dispatch';
  end if;
  v_now := clock_timestamp();
  select * into v_offer from public.flight_offers as offer
   where offer.id = v_order.offer_id
     and offer.search_id = v_order.search_id
     and offer.provider_code = 'duffel'
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_reprice from public.flight_reprice_receipts as reprice
   where reprice.id = v_order.reprice_receipt_id
     and reprice.offer_id = v_order.offer_id
     and reprice.execution_mode = 'test'
     and reprice.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id and payment.processor_code = 'stripe'
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.currency = v_order.currency
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0 and payment.status = 'captured'
   for share;
  select * into v_evidence from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.reprice_receipt_id = v_order.reprice_receipt_id
     and evidence.stage = 'refreshed'
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.retention_expires_at > v_now
     and evidence.deleted_at is null for share;
  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected_travelers from public.flight_searches as search
   where search.id = v_order.search_id and search.customer_id = v_order.customer_id
   for share;
  if v_offer.id is null or v_reprice.id is null
    or v_offer.status <> 'offered'
    or v_reprice.status not in ('confirmed', 'price_changed')
    or v_reprice.currency is distinct from v_order.currency
    or v_reprice.repriced_total_cents is distinct from v_order.total_cents
    or v_reprice.expires_at <= v_now
    or v_attempt.dispatch_not_after > v_reprice.expires_at
    or (v_reprice.status = 'price_changed' and (
      v_reprice.customer_accepted_by is distinct from v_order.customer_id
      or v_reprice.customer_acceptance_version is distinct from 1
      or v_reprice.customer_accepted_currency is distinct from v_order.currency
      or v_reprice.customer_accepted_total_cents is distinct from v_order.total_cents
    ))
    or v_payment.id is null or v_evidence.id is null
    or (select count(*) from public.flight_passenger_refs as passenger
         where passenger.order_id = v_order.id) <> v_expected_travelers
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id and not exists (
         select 1 from public.flight_secure_pii_records as pii
          where pii.secure_pii_record_ref = passenger.secure_pii_record_ref
            and pii.order_id = v_order.id and pii.customer_id = v_order.customer_id
            and pii.execution_mode = passenger.execution_mode
            and pii.execution_scope_sha256 = passenger.execution_scope_sha256
            and pii.traveler_type = passenger.traveler_type
            and pii.pii_record_sha256 = passenger.pii_record_sha256
            and pii.deleted_at is null
            and pii.retention_expires_at > clock_timestamp()
       )
    ) then
    raise exception 'Captured payment or encrypted order evidence changed';
  end if;
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight consumer Duffel order authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching', revision = revision + 1,
         dispatch_started_at = v_now
   where id = v_attempt.id and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then raise exception 'Flight consumer Duffel order dispatch CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$claim_flight_consumer_order_089$;

-- PostgreSQL cannot replace a TABLE-return signature in place. The runtime is
-- fully relocked above, so replace the service-role discovery contract
-- transactionally and restore its least-privilege grant below.
drop function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid);

create function public.get_flight_consumer_duffel_order_recovery_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns table (
  attempt_id uuid,
  customer_id uuid,
  order_id uuid,
  attempt_revision integer,
  attempt_state text,
  request_sha256 text,
  operation_authority_receipt_sha256 text,
  terminal_http_status smallint,
  terminal_response_sha256 text,
  terminal_response_bytes bigint,
  terminal_receipt_sha256 text,
  dispatch_not_after timestamptz,
  evidence_available boolean,
  response_evidence_receipt_sha256 text,
  response_evidence_retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $get_flight_consumer_duffel_order_recovery_089$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_evidence public.flight_order_response_evidence_vault;
  v_point_of_sale_sha256 text;
  v_evidence_available boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order recovery is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for share;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel' then
    raise exception 'Flight Duffel recovery order is unavailable';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.order_id = v_order.id
     and attempt.customer_id = v_order.customer_id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1;
  if not found then
    return;
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.provider_account_sha256
      is distinct from v_control.bound_provider_account_sha256
    or v_attempt.point_of_sale_sha256 is distinct from v_point_of_sale_sha256
    or v_attempt.content_scope_sha256
      is distinct from v_control.bound_content_scope_sha256
    or v_attempt.adapter_version_sha256
      is distinct from v_control.bound_adapter_version_sha256
    or v_attempt.retry_authorized then
    raise exception 'Flight Duffel recovery binding is stale';
  end if;
  select * into v_evidence from public.flight_order_response_evidence_vault as evidence
   where evidence.attempt_id = v_attempt.id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.deleted_at is null;
  v_evidence_available := v_attempt.state = 'succeeded'
    and v_attempt.revision = 2
    and v_evidence.id is not null
    and v_evidence.provider_response_sha256
      is not distinct from v_attempt.terminal_response_sha256
    and v_evidence.retention_expires_at > clock_timestamp();
  if v_attempt.state <> 'succeeded' and v_evidence.id is not null then
    raise exception 'Non-successful Flight Duffel attempt cannot own response evidence';
  end if;
  return query select
    v_attempt.id, v_attempt.customer_id, v_attempt.order_id,
    v_attempt.revision, v_attempt.state, v_attempt.request_sha256,
    v_attempt.operation_authority_receipt_sha256,
    v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
    v_attempt.terminal_receipt_sha256, v_attempt.dispatch_not_after,
    v_evidence_available,
    case when v_evidence_available then v_evidence.evidence_receipt_sha256 end,
    case when v_evidence_available then v_evidence.retention_expires_at end;
end;
$get_flight_consumer_duffel_order_recovery_089$;

revoke all on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) to service_role;
grant execute on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) to service_role;

comment on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) is 'Prepares the sole Consumer Preview Duffel TEST create-order attempt only while its dispatch deadline remains within the exact refreshed reprice authority.';
comment on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) is 'Claims the sole Consumer Preview Duffel TEST create-order attempt only after locked exact offer, reprice, encrypted evidence, payment, PII, and runtime revalidation.';
comment on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) is 'Returns owner-scoped Duffel order journal metadata, its original dispatch deadline, and whether exact unexpired encrypted terminal response evidence is available; it never authorizes redispatch.';

do $flight_consumer_preview_089_postcondition$
declare
  v_safe_count integer;
  v_prepare_source text;
  v_claim_source text;
  v_recovery_source text;
  v_recovery_result text;
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
    raise exception 'Flight Consumer Preview migration 089 changed the locked runtime posture';
  end if;

  select routine.prosrc into v_prepare_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.prepare_flight_consumer_duffel_order_attempt_v1(uuid,text,text,text,text,text,text,text,text,text,timestamptz)'
   );
  select routine.prosrc into v_claim_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
   );
  select routine.prosrc, pg_catalog.pg_get_function_result(routine.oid)
    into v_recovery_source, v_recovery_result
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
   );

  if v_prepare_source is null
    or position('#variable_conflict error' in v_prepare_source) = 0
    or position('p_dispatch_not_after > v_reprice.expires_at' in v_prepare_source) = 0
    or v_claim_source is null
    or position('#variable_conflict error' in v_claim_source) = 0
    or position('v_offer.status <> ''offered''' in v_claim_source) = 0
    or position('evidence.deleted_at is null' in v_claim_source) = 0
    or position('v_attempt.dispatch_not_after > v_reprice.expires_at' in v_claim_source) = 0
    or position('v_reprice.customer_accepted_by' in v_claim_source) = 0
    or v_recovery_source is null
    or position('#variable_conflict error' in v_recovery_source) = 0
    or position('v_evidence_available' in v_recovery_source) = 0
    or position('dispatch_not_after timestamp with time zone' in v_recovery_result) = 0
    or position('evidence_available boolean' in v_recovery_result) = 0
    or not has_function_privilege(
      'service_role',
      'public.prepare_flight_consumer_duffel_order_attempt_v1(uuid,text,text,text,text,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 089 postcondition failed';
  end if;
end;
$flight_consumer_preview_089_postcondition$;

commit;
