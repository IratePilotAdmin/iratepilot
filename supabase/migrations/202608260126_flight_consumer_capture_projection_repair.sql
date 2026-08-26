begin;

-- Forward repair for the Preview-only terminal projection failures identified
-- by authenticated Stripe and Duffel TEST rehearsals plus a static audit of
-- the no-redispatch and compensation paths. These routines have OUT parameter
-- names that collide with unqualified table columns. This migration qualifies
-- those references without changing capability, amount, provider payload,
-- transition, lock-order, or Production authority.
do $flight_consumer_preview_087_dependencies$
declare
  v_capture_source text;
  v_terminal_source text;
  v_sync_finalizer_source text;
  v_async_finalizer_source text;
  v_refund_source text;
  v_reprice_failure_source text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_order_response_evidence_vault') is null
    or to_regclass('public.flight_passenger_refs') is null
    or to_regclass('public.flight_ticket_documents') is null
    or to_regclass('public.flight_payment_refund_evidence') is null
    or to_regprocedure(
      'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_duffel_order_terminal_v1(uuid,integer,text,smallint,text,bigint,text,text,text,text,text,text,text,text,timestamptz)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_duffel_order_v1(uuid,integer,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null
    or to_regprocedure(
      'public.apply_flight_consumer_refund_compensation_v1(uuid,integer,uuid,text,text,bigint)'
    ) is null
    or to_regprocedure(
      'public.fail_flight_consumer_reprice_v1(uuid,integer)'
    ) is null then
    raise exception 'Flight Consumer Preview terminal projection repair requires migrations 068 through 086';
  end if;

  select routine.prosrc into v_capture_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)'
   );
  select routine.prosrc into v_terminal_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.record_flight_consumer_duffel_order_terminal_v1(uuid,integer,text,smallint,text,bigint,text,text,text,text,text,text,text,text,timestamptz)'
   );
  select routine.prosrc into v_sync_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_duffel_order_v1(uuid,integer,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   );
  select routine.prosrc into v_async_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   );
  select routine.prosrc into v_refund_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.apply_flight_consumer_refund_compensation_v1(uuid,integer,uuid,text,text,bigint)'
   );
  select routine.prosrc into v_reprice_failure_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_reprice_v1(uuid,integer)'
   );

  if v_capture_source is null
    or position('#variable_conflict error' in v_capture_source) > 0
    or position(
      'where id = p_payment_id and order_id = v_order.id' in v_capture_source
    ) = 0
    or v_terminal_source is null
    or position('#variable_conflict error' in v_terminal_source) > 0
    or position(
      'where attempt_id = v_attempt.id' in v_terminal_source
    ) = 0
    or v_sync_finalizer_source is null
    or position('#variable_conflict error' in v_sync_finalizer_source) > 0
    or position(
      'where order_id = v_order.id and processor_code = ''stripe'''
      in v_sync_finalizer_source
    ) = 0
    or position(
      'where attempt_id = v_attempt.id and order_id = v_order.id'
      in v_sync_finalizer_source
    ) = 0
    or position(
      'and order_id = v_order.id and provider_passenger_ref_sha256 is null'
      in v_sync_finalizer_source
    ) = 0
    or position(
      'where order_id = v_order.id and provider_passenger_ref_sha256 is null'
      in v_sync_finalizer_source
    ) = 0
    or v_async_finalizer_source is null
    or position('#variable_conflict error' in v_async_finalizer_source) > 0
    or position(
      'and order_id = v_order.id' in v_async_finalizer_source
    ) = 0
    or position(
      'not between 16 and 8176' in v_async_finalizer_source
    ) = 0
    or position(
      'not between 16 and 4080' in v_async_finalizer_source
    ) = 0
    or v_refund_source is null
    or position('#variable_conflict error' in v_refund_source) > 0
    or position(
      'where id = p_payment_id and order_id = v_order.id'
      in v_refund_source
    ) = 0
    or position(
      'from public.flight_ticket_documents where order_id = v_order.id'
      in v_refund_source
    ) = 0
    or v_reprice_failure_source is null
    or position('#variable_conflict error' in v_reprice_failure_source) = 0
    or position(
      'where reprice.offer_id = v_attempt.offer_id'
      in v_reprice_failure_source
    ) = 0 then
    raise exception 'Flight Consumer Preview terminal projection predecessor has drifted';
  end if;
end;
$flight_consumer_preview_087_dependencies$;

-- Install only from the fully relocked posture. Recovery of any already
-- terminal provider operation is performed later through the normal,
-- evidence-bound active Preview contracts.
do $flight_consumer_preview_087_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 087 requires relock before repair';
  end if;
end;
$flight_consumer_preview_087_relocked_precondition$;

create or replace function public.apply_flight_consumer_capture_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_payment_id uuid,
  p_processor_reference_sha256 text
)
returns table (order_id uuid, order_status text, payment_id uuid, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $apply_flight_consumer_capture_087$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight capture application is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id;
  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select attempt.* into v_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id for update;
  select control.* into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  select payment.* into v_payment
    from public.flight_payments as payment
   where payment.id = p_payment_id and payment.order_id = v_order.id for update;
  if v_order.id is null or v_attempt.id is null or v_payment.id is null
    or v_order.consumer_flow_version <> 1
    or v_attempt.operation <> 'capture' or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.payment_id is distinct from v_payment.id
    or v_payment.processor_reference_sha256 is distinct from p_processor_reference_sha256
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency <> v_order.currency
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.refunded_cents <> 0 then
    raise exception 'Successful Stripe capture evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_order.status = 'payment_authorized'
    and v_payment.status = 'captured'
    and v_payment.captured_cents = v_order.total_cents then
    return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
    return;
  end if;
  if v_order.status <> 'payment_authorized'
    or v_payment.status <> 'authorized'
    or v_payment.captured_cents <> 0 then
    raise exception 'Successful Stripe capture application CAS does not match';
  end if;
  update public.flight_payments as payment
     set status = 'captured', captured_cents = payment.authorized_cents
   where payment.id = v_payment.id
     and payment.status = 'authorized'
     and payment.captured_cents = 0
  returning payment.* into v_payment;
  if not found then raise exception 'Flight capture application CAS failed'; end if;
  update public.flight_orders as flight_order
     set updated_at = greatest(clock_timestamp(), flight_order.updated_at + interval '1 microsecond')
   where flight_order.id = v_order.id
  returning flight_order.* into v_order;
  return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
end;
$apply_flight_consumer_capture_087$;

create or replace function public.record_flight_consumer_duffel_order_terminal_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_ciphertext_sha256 text,
  p_evidence_receipt_sha256 text,
  p_retention_expires_at timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_duffel_order_terminal_087$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_evidence public.flight_order_response_evidence_vault;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order terminal recording is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id then
    raise exception 'Flight Duffel order attempt is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  if v_attempt.revision = 2
    and v_attempt.state in ('succeeded', 'failed', 'ambiguous') then
    if p_expected_revision <> 2
      or v_attempt.state is distinct from p_terminal_state
      or v_attempt.terminal_http_status is distinct from p_terminal_http_status
      or v_attempt.terminal_response_sha256 is distinct from p_terminal_response_sha256
      or v_attempt.terminal_response_bytes is distinct from p_terminal_response_bytes
      or v_attempt.terminal_receipt_sha256 is distinct from p_terminal_receipt_sha256 then
      raise exception 'Flight Duffel terminal replay does not match the journal';
    end if;
  elsif v_attempt.state = 'dispatching' and v_attempt.revision = 1
    and p_expected_revision = 1 then
    if p_terminal_state not in ('succeeded', 'failed', 'ambiguous')
      or p_terminal_receipt_sha256 is null
      or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight Duffel terminal outcome is invalid';
    end if;
    if p_terminal_state = 'succeeded' and (
      p_terminal_http_status not between 200 and 299
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Successful Duffel order response evidence is incomplete'; end if;
    if p_terminal_state = 'failed' and (
      p_terminal_http_status not between 300 and 599
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Known Duffel order failure evidence is incomplete'; end if;
    if p_terminal_state = 'ambiguous' and (
      p_terminal_http_status is not null or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null
    ) then raise exception 'Ambiguous Duffel order dispatch cannot claim a response'; end if;
    v_now := clock_timestamp();
    update public.flight_provider_request_attempts as attempt
       set state = p_terminal_state, revision = attempt.revision + 1,
           completed_at = v_now, terminal_http_status = p_terminal_http_status,
           terminal_response_sha256 = p_terminal_response_sha256,
           terminal_response_bytes = p_terminal_response_bytes,
           terminal_receipt_sha256 = p_terminal_receipt_sha256
     where attempt.id = v_attempt.id
       and attempt.state = 'dispatching'
       and attempt.revision = 1
    returning attempt.* into v_attempt;
  else
    raise exception 'Flight Duffel order terminal CAS failed';
  end if;
  if p_terminal_state = 'succeeded' then
    if p_key_version is null or p_iv_base64url is null or p_auth_tag_base64url is null
      or p_ciphertext_base64url is null or p_aad_sha256 is null
      or p_ciphertext_sha256 is null or p_evidence_receipt_sha256 is null
      or p_terminal_response_sha256 is distinct from v_attempt.terminal_response_sha256 then
      raise exception 'Successful Duffel order requires encrypted response evidence';
    end if;
    select evidence.* into v_evidence
      from public.flight_order_response_evidence_vault as evidence
     where evidence.attempt_id = v_attempt.id;
    if found then
      if v_evidence.order_id is distinct from v_order.id
        or v_evidence.customer_id is distinct from v_order.customer_id
        or v_evidence.provider_response_sha256
          is distinct from p_terminal_response_sha256
        or v_evidence.evidence_receipt_sha256
          is distinct from p_evidence_receipt_sha256
        or v_evidence.key_version is distinct from p_key_version
        or v_evidence.iv_base64url is distinct from p_iv_base64url
        or v_evidence.auth_tag_base64url is distinct from p_auth_tag_base64url
        or v_evidence.ciphertext_base64url is distinct from p_ciphertext_base64url
        or v_evidence.aad_sha256 is distinct from p_aad_sha256
        or v_evidence.ciphertext_sha256 is distinct from p_ciphertext_sha256
        or v_evidence.retention_expires_at is distinct from p_retention_expires_at then
        raise exception 'Flight Duffel response evidence replay collides';
      end if;
    else
      insert into public.flight_order_response_evidence_vault (
        attempt_id, order_id, customer_id, execution_mode,
        execution_scope_sha256, provider_response_sha256,
        evidence_receipt_sha256, key_version, iv_base64url,
        auth_tag_base64url, ciphertext_base64url, aad_sha256,
        ciphertext_sha256, retention_expires_at
      ) values (
        v_attempt.id, v_order.id, v_order.customer_id, 'test',
        v_order.execution_scope_sha256, p_terminal_response_sha256,
        p_evidence_receipt_sha256, p_key_version, p_iv_base64url,
        p_auth_tag_base64url, p_ciphertext_base64url, p_aad_sha256,
        p_ciphertext_sha256, p_retention_expires_at
      );
    end if;
  elsif p_key_version is not null or p_iv_base64url is not null
    or p_auth_tag_base64url is not null or p_ciphertext_base64url is not null
    or p_aad_sha256 is not null or p_ciphertext_sha256 is not null
    or p_evidence_receipt_sha256 is not null or p_retention_expires_at is not null then
    raise exception 'Failed or ambiguous Duffel attempt cannot claim response ciphertext';
  end if;
  update public.flight_orders as flight_order
     set updated_at = greatest(
       clock_timestamp(), flight_order.updated_at + interval '1 microsecond'
     )
   where flight_order.id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$record_flight_consumer_duffel_order_terminal_087$;

create or replace function public.finalize_flight_consumer_duffel_order_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_response_evidence_receipt_sha256 text,
  p_provider_order_ref_ciphertext text,
  p_provider_order_ref_sha256 text,
  p_provider_created_at timestamptz,
  p_ticketing_deadline_at timestamptz,
  p_passenger_bindings jsonb,
  p_ticket_documents jsonb
)
returns table (
  order_id uuid,
  order_status text,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $finalize_flight_consumer_duffel_order_087$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_offer_evidence public.flight_offer_evidence_vault;
  v_response_evidence public.flight_order_response_evidence_vault;
  v_binding jsonb;
  v_document jsonb;
  v_passenger public.flight_passenger_refs;
  v_ticket public.flight_ticket_documents;
  v_expected integer;
  v_issued integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order finalization is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.operation <> 'create_order'
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id then
    raise exception 'Successful Duffel order attempt is not finalizable';
  end if;
  select control.* into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  select payment.* into v_payment
    from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  select evidence.* into v_offer_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.reprice_receipt_id = v_order.reprice_receipt_id
     and evidence.stage = 'refreshed'
   for share;
  select evidence.* into v_response_evidence
    from public.flight_order_response_evidence_vault as evidence
   where evidence.attempt_id = v_attempt.id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.evidence_receipt_sha256 = p_response_evidence_receipt_sha256
     and evidence.provider_response_sha256 = v_attempt.terminal_response_sha256
     and evidence.deleted_at is null
   for share;
  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected from public.flight_searches as search
   where search.id = v_order.search_id and search.customer_id = v_order.customer_id
   for share;
  if jsonb_typeof(p_passenger_bindings) <> 'array'
    or jsonb_array_length(p_passenger_bindings) <> v_expected
    or jsonb_typeof(p_ticket_documents) <> 'array'
    or jsonb_array_length(p_ticket_documents) <> v_expected
    or (select count(distinct (binding.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_passenger_bindings) as binding(value))
       <> v_expected
    or (select count(distinct (document.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_ticket_documents) as document(value))
       <> v_expected then
    raise exception 'Flight Duffel finalization evidence is incomplete';
  end if;
  if v_order.status = 'ticketed' then
    if v_order.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_order.provider_created_at is distinct from p_provider_created_at
      or v_order.ticketing_deadline_at is distinct from p_ticketing_deadline_at
      or v_payment.id is null or v_offer_evidence.id is null
      or v_response_evidence.id is null then
      raise exception 'Flight Duffel finalization replay collides';
    end if;
    for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
        'passenger_ref_id', 'provider_passenger_ref_ciphertext',
        'provider_passenger_ref_sha256'
      ]) then
        raise exception 'Flight finalization replay passenger keys collide';
      end if;
      select * into v_passenger from public.flight_passenger_refs as passenger
       where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
         and passenger.order_id = v_order.id;
      if v_passenger.id is null
        or v_passenger.provider_passenger_ref_sha256
          is distinct from (v_binding ->> 'provider_passenger_ref_sha256') then
        raise exception 'Flight finalization replay passenger binding collides';
      end if;
    end loop;
    for v_document in select value from jsonb_array_elements(p_ticket_documents)
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
        'passenger_ref_id', 'document_ref_ciphertext',
        'document_ref_sha256', 'issuing_carrier'
      ]) then
        raise exception 'Flight finalization replay ticket keys collide';
      end if;
      select * into v_ticket from public.flight_ticket_documents as document
       where document.order_id = v_order.id
         and document.passenger_ref_id =
           (v_document ->> 'passenger_ref_id')::uuid
         and document.document_type = 'electronic_ticket'
         and document.status = 'issued';
      if v_ticket.id is null
        or v_ticket.document_ref_sha256
          is distinct from (v_document ->> 'document_ref_sha256')
        or v_ticket.issuing_carrier
          is distinct from upper(v_document ->> 'issuing_carrier') then
        raise exception 'Flight finalization replay ticket binding collides';
      end if;
    end loop;
    select count(*)::integer into v_issued
      from public.flight_ticket_documents as document
     where document.order_id = v_order.id
       and document.document_type = 'electronic_ticket'
       and document.status = 'issued';
    if v_issued <> v_expected then
      raise exception 'Flight finalization replay ticket count collides';
    end if;
    return query select v_order.id, v_order.status, v_issued;
    return;
  end if;
  if v_order.status <> 'order_creating'
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or v_payment.id is null or v_offer_evidence.id is null
    or v_offer_evidence.retention_expires_at <= clock_timestamp()
    or v_response_evidence.id is null
    or v_response_evidence.retention_expires_at <= clock_timestamp()
    or p_provider_created_at > clock_timestamp() + interval '5 minutes'
    or p_ticketing_deadline_at <= clock_timestamp()
    or p_ticketing_deadline_at <= p_provider_created_at then
    raise exception 'Flight Duffel finalization evidence is incomplete';
  end if;
  update public.flight_orders as flight_order
     set provider_order_ref_ciphertext = p_provider_order_ref_ciphertext,
         provider_order_ref_sha256 = p_provider_order_ref_sha256,
         provider_created_at = p_provider_created_at,
         ticketing_deadline_at = p_ticketing_deadline_at,
         status = 'booked'
   where flight_order.id = v_order.id
     and flight_order.status = 'order_creating'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight Duffel booking finalization CAS failed'; end if;
  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
      'passenger_ref_id', 'provider_passenger_ref_ciphertext',
      'provider_passenger_ref_sha256'
    ]) then
      raise exception 'Flight passenger binding contains missing or unknown keys';
    end if;
    update public.flight_passenger_refs as passenger
       set provider_passenger_ref_ciphertext =
             v_binding ->> 'provider_passenger_ref_ciphertext',
           provider_passenger_ref_sha256 =
             v_binding ->> 'provider_passenger_ref_sha256'
     where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
       and passenger.order_id = v_order.id
       and passenger.provider_passenger_ref_sha256 is null
    returning passenger.* into v_passenger;
    if not found then raise exception 'Flight provider passenger binding CAS failed'; end if;
  end loop;
  if exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and passenger.provider_passenger_ref_sha256 is null
  ) then raise exception 'Every flight passenger requires one provider binding'; end if;
  update public.flight_orders as flight_order set status = 'ticketing_pending'
   where flight_order.id = v_order.id and flight_order.status = 'booked'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight ticketing transition CAS failed'; end if;
  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
      'passenger_ref_id', 'document_ref_ciphertext',
      'document_ref_sha256', 'issuing_carrier'
    ]) then
      raise exception 'Flight ticket document contains missing or unknown keys';
    end if;
    insert into public.flight_ticket_documents (
      order_id, passenger_ref_id, execution_mode, execution_scope_sha256,
      document_type, issuing_carrier, status
    ) values (
      v_order.id, (v_document ->> 'passenger_ref_id')::uuid, 'test',
      v_order.execution_scope_sha256, 'electronic_ticket',
      upper(v_document ->> 'issuing_carrier'), 'pending'
    ) returning * into v_ticket;
    update public.flight_ticket_documents as document
       set document_ref_ciphertext = v_document ->> 'document_ref_ciphertext',
           document_ref_sha256 = v_document ->> 'document_ref_sha256',
           status = 'issued'
     where document.id = v_ticket.id and document.status = 'pending'
    returning document.* into v_ticket;
    if not found then raise exception 'Flight ticket issuance CAS failed'; end if;
  end loop;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = v_order.id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  if v_issued <> v_expected or exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (select count(*) from public.flight_ticket_documents as document
             where document.order_id = v_order.id
               and document.passenger_ref_id = passenger.id
               and document.document_type = 'electronic_ticket'
               and document.status = 'issued') <> 1
  ) then
    raise exception 'Exactly one distinct Duffel e-ticket is required per passenger';
  end if;
  update public.flight_orders as flight_order set status = 'ticketed'
   where flight_order.id = v_order.id
     and flight_order.status = 'ticketing_pending'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight ticketed transition CAS failed'; end if;
  update public.flight_orders as flight_order
     set updated_at = greatest(
       clock_timestamp(), flight_order.updated_at + interval '1 microsecond'
     )
   where flight_order.id = v_order.id
  returning flight_order.* into v_order;
  return query select v_order.id, v_order.status, v_issued;
end;
$finalize_flight_consumer_duffel_order_087$;

create or replace function public.finalize_flight_consumer_async_duffel_order_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text,
  p_provider_order_ref_ciphertext text,
  p_provider_order_ref_sha256 text,
  p_provider_created_at timestamptz,
  p_ticketing_deadline_at timestamptz,
  p_passenger_bindings jsonb,
  p_ticket_documents jsonb
)
returns table (
  order_id uuid,
  order_status text,
  issued_ticket_count integer,
  reconciliation_case_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $finalize_flight_consumer_async_duffel_order_087$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_ledger public.flight_consumer_webhook_ledger;
  v_payment public.flight_payments;
  v_offer public.flight_offers;
  v_offer_evidence public.flight_offer_evidence_vault;
  v_recovery public.flight_order_recovery_evidence_vault;
  v_case public.flight_reconciliation_cases;
  v_binding jsonb;
  v_document jsonb;
  v_passenger public.flight_passenger_refs;
  v_ticket public.flight_ticket_documents;
  v_expected integer;
  v_issued integer;
  v_target_sha256 text;
  v_system_resolution_receipt_sha256 text;
  v_system_resolution_evidence_sha256 text;
  v_canonical_passenger_bindings jsonb;
  v_canonical_ticket_documents jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight async Duffel finalization is service-role only';
  end if;
  if p_recovery_evidence_receipt_sha256 is null
    or p_recovery_evidence_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_order_ref_ciphertext is null
    or (
      p_provider_order_ref_ciphertext
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      or char_length(split_part(p_provider_order_ref_ciphertext, ':', 3))
        not between 16 and 8176
    )
    or p_provider_order_ref_sha256 is null
    or p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_created_at is null
    or p_ticketing_deadline_at is null
    or jsonb_typeof(p_passenger_bindings) <> 'array'
    or jsonb_typeof(p_ticket_documents) <> 'array' then
    raise exception 'Flight async Duffel finalization envelope is invalid';
  end if;

  -- Fixed lock order: order -> provider attempt -> runtime control -> webhook
  -- ledger -> payment -> offer/evidence/review -> passengers/tickets.
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for update;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel'
    or v_order.status not in ('requires_review', 'ticketed') then
    raise exception 'Flight async Duffel order is unavailable';
  end if;
  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = v_order.id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  select control.* into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id for share;
  select * into v_payment
    from public.flight_payments as payment
   where payment.id = v_ledger.payment_id
     and payment.order_id = v_order.id for share;
  select * into v_offer
    from public.flight_offers as offer
   where offer.id = v_order.offer_id
     and offer.search_id = v_order.search_id for share;
  select * into v_offer_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
   for share;
  select * into v_recovery
    from public.flight_order_recovery_evidence_vault as evidence
   where evidence.ledger_id = p_ledger_id
     and evidence.recovery_evidence_receipt_sha256
       = p_recovery_evidence_receipt_sha256
   for share;
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', v_order.id::text,
    'target_status', 'order_creating', 'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  select reconciliation.* into v_case
    from public.flight_reconciliation_cases as reconciliation
    left join public.profiles as resolver on resolver.id = reconciliation.resolved_by
   where reconciliation.order_id = v_order.id
     and reconciliation.provider_code = 'duffel'
     and reconciliation.execution_mode = 'test'
     and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
     and reconciliation.case_type = 'ambiguous_order'
     and reconciliation.subject_type = 'flight_order'
     and reconciliation.subject_id = v_order.id
     and reconciliation.source_status = 'requires_review'
     and reconciliation.target_status = 'order_creating'
     and reconciliation.target_state_sha256 = v_target_sha256
     and (
       (reconciliation.status in ('open', 'investigating', 'blocked')
         and reconciliation.resolution_code is null
         and reconciliation.resolution_evidence_sha256 is null
         and reconciliation.resolved_by is null
         and reconciliation.resolved_at is null
         and reconciliation.resolution_actor_type = 'administrator'
         and reconciliation.system_resolution_receipt_sha256 is null)
       or (reconciliation.status = 'resolved'
         and reconciliation.resolution_code = 'provider_state_confirmed'
         and reconciliation.resolution_evidence_sha256 is not null
         and reconciliation.resolved_at is not null
         and (
           (reconciliation.resolution_actor_type = 'administrator'
             and reconciliation.resolved_by is not null
             and reconciliation.system_resolution_receipt_sha256 is null
             and resolver.role = 'admin')
           or (reconciliation.resolution_actor_type = 'system'
             and reconciliation.resolved_by is null
             and reconciliation.system_resolution_receipt_sha256 is not null)
         ))
     )
   order by reconciliation.resolved_at desc, reconciliation.id desc
   limit 1
   for update of reconciliation;
  perform 1 from public.flight_passenger_refs as passenger
   where passenger.order_id = v_order.id
   order by passenger.traveler_sequence, passenger.id
   for update;
  perform 1 from public.flight_ticket_documents as document
   where document.order_id = v_order.id
   order by document.passenger_ref_id, document.id
   for share;

  if v_attempt.id is null
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.state <> 'succeeded' or v_attempt.revision <> 2
    or v_attempt.retry_authorized
    or v_ledger.id is null or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_ledger.order_id is distinct from v_order.id
    or v_ledger.payment_id is distinct from v_payment.id
    or v_ledger.provider_attempt_id is distinct from v_attempt.id
    or v_ledger.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_ledger.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.state <> 'processed' or v_ledger.revision <> 2
    or v_payment.id is null or v_payment.processor_code <> 'stripe'
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.currency <> v_order.currency
    or v_payment.status <> 'captured'
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> v_order.total_cents
    or v_payment.refunded_cents <> 0
    or v_offer.id is null or v_offer.provider_code <> 'duffel'
    or v_offer.execution_mode <> 'test'
    or v_offer.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_offer_evidence.id is null
    or v_offer_evidence.customer_id is distinct from v_order.customer_id
    or v_offer_evidence.search_id is distinct from v_order.search_id
    or v_offer_evidence.offer_id is distinct from v_order.offer_id
    or v_offer_evidence.reprice_receipt_id
      is distinct from v_order.reprice_receipt_id
    or v_offer_evidence.execution_mode <> 'test'
    or v_offer_evidence.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_offer_evidence.stage <> 'refreshed'
    or v_offer_evidence.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_offer_evidence.deleted_at is not null
    or v_recovery.id is null
    or v_recovery.attempt_id is distinct from v_attempt.id
    or v_recovery.order_id is distinct from v_order.id
    or v_recovery.customer_id is distinct from v_order.customer_id
    or v_recovery.execution_mode <> 'test'
    or v_recovery.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_recovery.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_recovery.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_recovery.webhook_verification_receipt_sha256
      is distinct from v_ledger.verification_receipt_sha256
    or v_recovery.deleted_at is not null
    or v_case.id is null then
    raise exception 'Flight async Duffel convergence evidence is incomplete';
  end if;

  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected
    from public.flight_searches as search
   where search.id = v_order.search_id
     and search.customer_id = v_order.customer_id
     and search.execution_mode = 'test'
     and search.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  if v_expected is null
    or jsonb_array_length(p_passenger_bindings) <> v_expected
    or jsonb_array_length(p_ticket_documents) <> v_expected
    or (select count(distinct (binding.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_passenger_bindings) as binding(value))
       <> v_expected
    or (select count(distinct (document.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_ticket_documents) as document(value))
       <> v_expected then
    raise exception 'Flight async passenger or ticket evidence is incomplete';
  end if;

  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
      'passenger_ref_id', 'provider_passenger_ref_ciphertext',
      'provider_passenger_ref_sha256'
    ])
      or (
        coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '')
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
        or char_length(split_part(coalesce(
          v_binding ->> 'provider_passenger_ref_ciphertext', ''
        ), ':', 3)) not between 16 and 4080
      )
      or coalesce(v_binding ->> 'provider_passenger_ref_sha256', '')
        !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight async passenger binding is invalid';
    end if;
    select * into v_passenger
      from public.flight_passenger_refs as passenger
     where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
       and passenger.order_id = v_order.id
       and passenger.execution_mode = 'test'
       and passenger.execution_scope_sha256 = v_order.execution_scope_sha256;
    if v_passenger.id is null then
      raise exception 'Flight async passenger binding is not owner scoped';
    end if;
    if v_order.status = 'ticketed' and (
      v_passenger.provider_passenger_ref_sha256
        is distinct from v_binding ->> 'provider_passenger_ref_sha256'
    ) then
      raise exception 'Flight async passenger replay collides';
    elsif v_order.status = 'requires_review' and (
      v_passenger.provider_passenger_ref_ciphertext is not null
      or v_passenger.provider_passenger_ref_sha256 is not null
    ) then
      raise exception 'Flight async passenger identity was already bound';
    end if;
  end loop;

  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
      'passenger_ref_id', 'document_ref_ciphertext',
      'document_ref_sha256', 'issuing_carrier'
    ])
      or (
        coalesce(v_document ->> 'document_ref_ciphertext', '')
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
        or char_length(split_part(coalesce(
          v_document ->> 'document_ref_ciphertext', ''
        ), ':', 3)) not between 16 and 4080
      )
      or coalesce(v_document ->> 'document_ref_sha256', '')
        !~ '^[0-9a-f]{64}$'
      or upper(coalesce(v_document ->> 'issuing_carrier', ''))
        is distinct from v_offer.validating_carrier then
      raise exception 'Flight async ticket document is invalid';
    end if;
    if not exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.id = (v_document ->> 'passenger_ref_id')::uuid
         and passenger.order_id = v_order.id
    ) then
      raise exception 'Flight async ticket passenger is not owner scoped';
    end if;
    if v_order.status = 'ticketed' then
      select * into v_ticket
        from public.flight_ticket_documents as document
       where document.order_id = v_order.id
         and document.passenger_ref_id
           = (v_document ->> 'passenger_ref_id')::uuid
         and document.document_type = 'electronic_ticket'
         and document.status = 'issued';
      if v_ticket.id is null
        or v_ticket.document_ref_sha256
          is distinct from v_document ->> 'document_ref_sha256'
        or v_ticket.issuing_carrier
          is distinct from upper(v_document ->> 'issuing_carrier') then
        raise exception 'Flight async ticket replay collides';
      end if;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object(
      'passenger_ref_id', binding.value ->> 'passenger_ref_id',
      'provider_passenger_ref_sha256',
        binding.value ->> 'provider_passenger_ref_sha256'
    ) order by binding.value ->> 'passenger_ref_id')
    into v_canonical_passenger_bindings
    from jsonb_array_elements(p_passenger_bindings) as binding(value);
  select jsonb_agg(jsonb_build_object(
      'passenger_ref_id', document.value ->> 'passenger_ref_id',
      'document_ref_sha256', document.value ->> 'document_ref_sha256',
      'issuing_carrier', upper(document.value ->> 'issuing_carrier')
    ) order by document.value ->> 'passenger_ref_id')
    into v_canonical_ticket_documents
    from jsonb_array_elements(p_ticket_documents) as document(value);
  v_system_resolution_receipt_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.consumer-preview.async-system-resolution-receipt.v1',
      'case_id', v_case.id::text,
      'order_id', v_order.id::text,
      'attempt_id', v_attempt.id::text,
      'ledger_id', v_ledger.id::text,
      'recovery_evidence_receipt_sha256',
        v_recovery.recovery_evidence_receipt_sha256,
      'provider_response_sha256', v_recovery.provider_response_sha256,
      'provider_order_ref_sha256', p_provider_order_ref_sha256,
      'provider_created_at', p_provider_created_at,
      'ticketing_deadline_at', p_ticketing_deadline_at,
      'passenger_bindings', v_canonical_passenger_bindings,
      'ticket_documents', v_canonical_ticket_documents
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  v_system_resolution_evidence_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.consumer-preview.async-system-resolution-evidence.v1',
      'case_id', v_case.id::text,
      'system_resolution_receipt_sha256',
        v_system_resolution_receipt_sha256,
      'webhook_verification_receipt_sha256',
        v_ledger.verification_receipt_sha256,
      'recovery_authority_receipt_sha256',
        v_recovery.recovery_authority_receipt_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  if v_case.status in ('open', 'investigating', 'blocked') then
    if v_order.status <> 'requires_review' then
      raise exception 'Flight async system review cannot resolve a terminal order';
    end if;
    perform set_config(
      'app.flight_consumer_async_system_resolution_authorized', 'true', true
    );
    update public.flight_reconciliation_cases as reconciliation
       set status = 'resolved',
           resolution_code = 'provider_state_confirmed',
           resolution_evidence_sha256 = v_system_resolution_evidence_sha256,
           resolved_by = null,
           resolution_actor_type = 'system',
           system_resolution_receipt_sha256 =
             v_system_resolution_receipt_sha256
     where reconciliation.id = v_case.id
       and reconciliation.status = v_case.status
       and reconciliation.resolution_code is null
       and reconciliation.resolution_evidence_sha256 is null
       and reconciliation.resolved_by is null
       and reconciliation.resolved_at is null
       and reconciliation.resolution_actor_type = 'administrator'
       and reconciliation.system_resolution_receipt_sha256 is null
    returning reconciliation.* into v_case;
    if not found then
      raise exception 'Flight async system review resolution CAS failed';
    end if;
  elsif v_case.resolution_actor_type = 'system'
    and (
      v_case.system_resolution_receipt_sha256
        is distinct from v_system_resolution_receipt_sha256
      or v_case.resolution_evidence_sha256
        is distinct from v_system_resolution_evidence_sha256
    ) then
    raise exception 'Flight async system review replay collides';
  end if;

  if v_order.status = 'ticketed' then
    if v_order.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_order.provider_created_at is distinct from p_provider_created_at
      or v_order.ticketing_deadline_at is distinct from p_ticketing_deadline_at then
      raise exception 'Flight async finalization replay collides';
    end if;
    select count(*)::integer into v_issued
      from public.flight_ticket_documents as document
     where document.order_id = v_order.id
       and document.document_type = 'electronic_ticket'
       and document.status = 'issued';
    if v_issued <> v_expected then
      raise exception 'Flight async finalization replay ticket count collides';
    end if;
    return query select v_order.id, v_order.status, v_issued, v_case.id;
    return;
  end if;

  if v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or v_offer_evidence.retention_expires_at <= clock_timestamp()
    or v_recovery.retention_expires_at <= clock_timestamp()
    or p_provider_created_at > clock_timestamp() + interval '5 minutes'
    or p_ticketing_deadline_at <= clock_timestamp()
    or p_ticketing_deadline_at <= p_provider_created_at
    or exists (
      select 1 from public.flight_ticket_documents as document
       where document.order_id = v_order.id
    ) then
    raise exception 'Flight async first finalization evidence is stale or colliding';
  end if;

  perform set_config(
    'app.flight_consumer_async_finalization_authorized', 'true', true
  );
  update public.flight_orders as flight_order
     set provider_order_ref_ciphertext = p_provider_order_ref_ciphertext,
         provider_order_ref_sha256 = p_provider_order_ref_sha256,
         provider_created_at = p_provider_created_at,
         ticketing_deadline_at = p_ticketing_deadline_at,
         status = 'booked'
   where flight_order.id = v_order.id
     and flight_order.status = 'requires_review'
  returning flight_order.* into v_order;
  if not found then
    raise exception 'Flight async reviewed-booking transition CAS failed';
  end if;

  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    update public.flight_passenger_refs as passenger
       set provider_passenger_ref_ciphertext =
             v_binding ->> 'provider_passenger_ref_ciphertext',
           provider_passenger_ref_sha256 =
             v_binding ->> 'provider_passenger_ref_sha256'
     where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
       and passenger.order_id = v_order.id
       and passenger.provider_passenger_ref_ciphertext is null
       and passenger.provider_passenger_ref_sha256 is null
    returning passenger.* into v_passenger;
    if not found then
      raise exception 'Flight async provider passenger binding CAS failed';
    end if;
  end loop;
  if exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (
         passenger.provider_passenger_ref_ciphertext is null
         or passenger.provider_passenger_ref_sha256 is null
       )
  ) then
    raise exception 'Every async flight passenger requires one provider binding';
  end if;

  update public.flight_orders as flight_order set status = 'ticketing_pending'
   where flight_order.id = v_order.id and flight_order.status = 'booked'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight async ticketing transition CAS failed'; end if;

  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    insert into public.flight_ticket_documents (
      order_id, passenger_ref_id, execution_mode, execution_scope_sha256,
      document_type, issuing_carrier, status
    ) values (
      v_order.id, (v_document ->> 'passenger_ref_id')::uuid,
      'test', v_order.execution_scope_sha256, 'electronic_ticket',
      upper(v_document ->> 'issuing_carrier'), 'pending'
    ) returning * into v_ticket;
    update public.flight_ticket_documents as document
       set document_ref_ciphertext = v_document ->> 'document_ref_ciphertext',
           document_ref_sha256 = v_document ->> 'document_ref_sha256',
           status = 'issued'
     where document.id = v_ticket.id and document.status = 'pending'
    returning document.* into v_ticket;
    if not found then raise exception 'Flight async ticket issuance CAS failed'; end if;
  end loop;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = v_order.id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  if v_issued <> v_expected or exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (
         select count(*) from public.flight_ticket_documents as document
          where document.order_id = v_order.id
            and document.passenger_ref_id = passenger.id
            and document.document_type = 'electronic_ticket'
            and document.status = 'issued'
       ) <> 1
  ) then
    raise exception 'Exactly one async Duffel e-ticket is required per passenger';
  end if;
  update public.flight_orders as flight_order set status = 'ticketed'
   where flight_order.id = v_order.id
     and flight_order.status = 'ticketing_pending'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight async ticketed transition CAS failed'; end if;
  update public.flight_orders as flight_order
     set updated_at = greatest(
       clock_timestamp(), flight_order.updated_at + interval '1 microsecond'
     )
   where flight_order.id = v_order.id
  returning flight_order.* into v_order;
  return query select v_order.id, v_order.status, v_issued, v_case.id;
end;
$finalize_flight_consumer_async_duffel_order_087$;

create or replace function public.apply_flight_consumer_refund_compensation_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_payment_id uuid,
  p_refund_reference_ciphertext text,
  p_refund_reference_sha256 text,
  p_refunded_cents bigint
)
returns table (order_id uuid, order_status text, payment_id uuid, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $apply_flight_consumer_refund_compensation_087$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_refund_evidence public.flight_payment_refund_evidence;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight refund compensation application is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id;
  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select attempt.* into v_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id for update;
  select control.* into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  select payment.* into v_payment
    from public.flight_payments as payment
   where payment.id = p_payment_id and payment.order_id = v_order.id for update;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.provider_order_ref_sha256 is not null
    or v_attempt.id is null or v_attempt.operation <> 'refund'
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.payment_id is distinct from v_payment.id
    or v_payment.id is null
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency <> v_order.currency
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> v_order.total_cents
    or p_refunded_cents is distinct from v_order.total_cents
    or exists (
      select 1 from public.flight_ticket_documents as document
       where document.order_id = v_order.id
    ) then
    raise exception 'Successful full-refund compensation evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_order.status = 'failed' and v_payment.status = 'refunded'
    and v_payment.refunded_cents = v_order.total_cents then
    select * into v_refund_evidence
      from public.flight_payment_refund_evidence as evidence
     where evidence.attempt_id = v_attempt.id
       and evidence.order_id = v_order.id
       and evidence.payment_id = v_payment.id;
    if v_refund_evidence.id is null
      or v_refund_evidence.execution_mode <> 'test'
      or v_refund_evidence.execution_scope_sha256
        is distinct from v_order.execution_scope_sha256
      or v_refund_evidence.refund_reference_ciphertext
        is distinct from p_refund_reference_ciphertext
      or v_refund_evidence.refund_reference_sha256
        is distinct from p_refund_reference_sha256
      or v_refund_evidence.refunded_cents is distinct from p_refunded_cents
      or v_refund_evidence.terminal_receipt_sha256
        is distinct from v_attempt.terminal_receipt_sha256 then
      raise exception 'Flight refund application replay collides';
    end if;
    return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
    return;
  end if;
  if v_order.status <> 'requires_review'
    or v_payment.status <> 'refund_pending'
    or v_payment.refunded_cents <> 0
    or not exists (
      select 1 from public.flight_reconciliation_cases as reconciliation
       where reconciliation.order_id = v_order.id
         and reconciliation.case_type = 'ambiguous_order'
         and reconciliation.status = 'resolved'
         and reconciliation.target_status = 'failed'
         and reconciliation.resolution_code in ('payment_reversed', 'duplicate_suppressed')
    ) then
    raise exception 'Successful full-refund compensation evidence does not match';
  end if;
  insert into public.flight_payment_refund_evidence (
    attempt_id, order_id, payment_id, execution_mode, execution_scope_sha256,
    refund_reference_ciphertext, refund_reference_sha256, refunded_cents,
    terminal_receipt_sha256
  ) values (
    v_attempt.id, v_order.id, v_payment.id, 'test', v_order.execution_scope_sha256,
    p_refund_reference_ciphertext, p_refund_reference_sha256,
    p_refunded_cents, v_attempt.terminal_receipt_sha256
  );
  update public.flight_payments as payment
     set status = 'refunded', refunded_cents = p_refunded_cents
   where payment.id = v_payment.id
     and payment.status = 'refund_pending'
     and payment.captured_cents = p_refunded_cents
     and payment.refunded_cents = 0
  returning payment.* into v_payment;
  if not found then raise exception 'Flight refund application CAS failed'; end if;
  perform set_config('app.flight_consumer_compensated_failure_authorized', 'true', true);
  update public.flight_orders as flight_order set status = 'failed'
   where flight_order.id = v_order.id
     and flight_order.status = 'requires_review'
  returning flight_order.* into v_order;
  if not found then raise exception 'Flight compensated order failure transition failed'; end if;
  update public.flight_orders as flight_order
     set updated_at = greatest(
       clock_timestamp(), flight_order.updated_at + interval '1 microsecond'
     )
   where flight_order.id = v_order.id
  returning flight_order.* into v_order;
  return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
end;
$apply_flight_consumer_refund_compensation_087$;

revoke all on function public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_flight_consumer_duffel_order_v1(
  uuid, integer, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.apply_flight_consumer_refund_compensation_v1(
  uuid, integer, uuid, text, text, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text)
  to service_role;
grant execute on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.finalize_flight_consumer_duffel_order_v1(
  uuid, integer, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;
grant execute on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;
grant execute on function public.apply_flight_consumer_refund_compensation_v1(
  uuid, integer, uuid, text, text, bigint
) to service_role;

do $flight_consumer_preview_087_postcondition$
declare
  v_capture_source text;
  v_terminal_source text;
  v_sync_finalizer_source text;
  v_async_finalizer_source text;
  v_refund_source text;
  v_signature text;
  v_safe_count integer;
begin
  select routine.prosrc into v_capture_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_terminal_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.record_flight_consumer_duffel_order_terminal_v1(uuid,integer,text,smallint,text,bigint,text,text,text,text,text,text,text,text,timestamptz)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_sync_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_duffel_order_v1(uuid,integer,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_async_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig =
       array['search_path=pg_catalog, public, extensions']::text[];
  select routine.prosrc into v_refund_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.apply_flight_consumer_refund_compensation_v1(uuid,integer,uuid,text,text,bigint)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];

  if v_capture_source is null
    or position('#variable_conflict error' in v_capture_source) = 0
    or position(
      'where payment.id = p_payment_id and payment.order_id = v_order.id'
      in v_capture_source
    ) = 0
    or position(
      'where id = p_payment_id and order_id = v_order.id' in v_capture_source
    ) > 0
    or v_terminal_source is null
    or position('#variable_conflict error' in v_terminal_source) = 0
    or position(
      'where evidence.attempt_id = v_attempt.id' in v_terminal_source
    ) = 0
    or position(
      'where attempt_id = v_attempt.id' in v_terminal_source
    ) > 0
    or v_sync_finalizer_source is null
    or position('#variable_conflict error' in v_sync_finalizer_source) = 0
    or position(
      'where payment.order_id = v_order.id' in v_sync_finalizer_source
    ) = 0
    or position(
      'where evidence.attempt_id = v_attempt.id'
      in v_sync_finalizer_source
    ) = 0
    or position(
      'and evidence.order_id = v_order.id' in v_sync_finalizer_source
    ) = 0
    or position(
      'and passenger.order_id = v_order.id'
      in v_sync_finalizer_source
    ) = 0
    or position(
      'where order_id = v_order.id' in v_sync_finalizer_source
    ) > 0
    or v_async_finalizer_source is null
    or position('#variable_conflict error' in v_async_finalizer_source) = 0
    or position(
      'and passenger.order_id = v_order.id'
      in v_async_finalizer_source
    ) = 0
    or position(
      'and order_id = v_order.id' in v_async_finalizer_source
    ) > 0
    or position(
      'not between 16 and 8176' in v_async_finalizer_source
    ) = 0
    or position(
      'not between 16 and 4080' in v_async_finalizer_source
    ) = 0
    or v_refund_source is null
    or position('#variable_conflict error' in v_refund_source) = 0
    or position(
      'where payment.id = p_payment_id and payment.order_id = v_order.id'
      in v_refund_source
    ) = 0
    or position(
      'where document.order_id = v_order.id' in v_refund_source
    ) = 0
    or position(
      'where id = p_payment_id and order_id = v_order.id' in v_refund_source
    ) > 0
    or position(
      'from public.flight_ticket_documents where order_id = v_order.id'
      in v_refund_source
    ) > 0 then
    raise exception 'Flight Consumer Preview migration 087 did not install every terminal projection repair';
  end if;

  foreach v_signature in array array[
    'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)',
    'public.record_flight_consumer_duffel_order_terminal_v1(uuid,integer,text,smallint,text,bigint,text,text,text,text,text,text,text,text,timestamptz)',
    'public.finalize_flight_consumer_duffel_order_v1(uuid,integer,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
    'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
    'public.apply_flight_consumer_refund_compensation_v1(uuid,integer,uuid,text,text,bigint)'
  ]
  loop
    if not has_function_privilege('service_role', v_signature, 'EXECUTE')
      or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'Flight Consumer Preview migration 087 function grants are unsafe';
    end if;
  end loop;

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
    raise exception 'Flight Consumer Preview migration 087 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_087_postcondition$;

comment on function public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text) is
  'Service-role Preview capture application with migration-087 output-parameter-safe payment projection.';
comment on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) is
  'Service-role Preview Duffel terminal journal with migration-087 output-parameter-safe evidence projection.';
comment on function public.finalize_flight_consumer_duffel_order_v1(
  uuid, integer, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) is
  'Service-role Preview synchronous Duffel finalization with migration-087 output-parameter-safe projections.';
comment on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) is
  'Service-role Preview async Duffel convergence with migration-087 output-parameter-safe projections.';
comment on function public.apply_flight_consumer_refund_compensation_v1(
  uuid, integer, uuid, text, text, bigint
) is
  'Service-role Preview refund compensation with migration-087 output-parameter-safe projections.';

commit;
