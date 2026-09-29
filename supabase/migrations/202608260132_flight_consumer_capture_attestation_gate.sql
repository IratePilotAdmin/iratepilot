begin;

-- Forward-only gate for a captured Stripe liability immediately before the
-- only prepared -> dispatching Duffel mutation. This projector accepts only
-- digest/categorical observations and never receives provider or card data.
do $flight_consumer_preview_093_dependencies$
declare
  v_claim_source text;
  v_recovery_source text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_order_response_evidence_vault') is null
    or to_regclass('public.flight_reconciliation_cases') is null
    or to_regprocedure(
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
    ) is null then
    raise exception 'Flight Consumer Preview capture attestation gate requires migrations 068 through 092';
  end if;
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
  if v_claim_source is null
    or position('Active Flight reconciliation blocks Duffel dispatch' in v_claim_source) = 0
    or v_recovery_source is null
    or position('if v_attempt.state in (''prepared'', ''dispatching'') then' in v_recovery_source) = 0 then
    raise exception 'Flight Consumer Preview capture attestation predecessor has drifted';
  end if;
end;
$flight_consumer_preview_093_dependencies$;

do $flight_consumer_preview_093_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 093 requires relock before hardening';
  end if;
end;
$flight_consumer_preview_093_relocked_precondition$;

create function public.record_flight_consumer_capture_attestation_mismatch_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_capture_attempt_id uuid,
  p_expected_capture_revision integer,
  p_processor_reference_sha256 text,
  p_mismatch_reason text,
  p_observation_sha256 text
)
returns table (
  order_id uuid,
  order_status text,
  payment_id uuid,
  payment_status text,
  reconciliation_case_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $record_flight_consumer_capture_attestation_mismatch_093$
#variable_conflict error
declare
  v_order_id uuid;
  v_payment_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_payment public.flight_payments;
  v_case public.flight_reconciliation_cases;
  v_target_status text;
  v_target_authorized_cents bigint;
  v_target_captured_cents bigint;
  v_target_refunded_cents bigint;
  v_expected_sha256 text;
  v_observed_sha256 text;
  v_target_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight capture attestation mismatch is service-role only';
  end if;
  if p_expected_capture_revision <> 2
    or p_processor_reference_sha256 is null
    or p_processor_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_observation_sha256 is null
    or p_observation_sha256 !~ '^[0-9a-f]{64}$'
    or p_mismatch_reason not in (
      'payment_intent_mismatch', 'latest_charge_mismatch',
      'refund_observed', 'dispute_observed', 'capture_state_mismatch',
      'historical_binding_mismatch'
    ) then
    raise exception 'Flight capture attestation evidence is invalid';
  end if;

  -- Discover identity without locking, then use the shared runtime lock order:
  -- flight_order -> capture attempt -> payment. Capture completion and Duffel
  -- claim use the same order-first discipline.
  select attempt.order_id, attempt.payment_id
    into v_order_id, v_payment_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_capture_attempt_id;
  if v_order_id is null or v_payment_id is null
    or v_order_id is distinct from p_order_id
    or v_payment_id is distinct from p_payment_id then
    raise exception 'Flight capture attestation identity is unavailable';
  end if;
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id
   for update;
  select * into v_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_capture_attempt_id
   for update;
  select * into v_payment
    from public.flight_payments as payment
   where payment.id = v_payment_id
     and payment.order_id = v_order_id
   for update;

  if v_order.id is null or v_attempt.id is null or v_payment.id is null
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status not in ('payment_authorized', 'order_creating', 'requires_review')
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.payment_id is distinct from v_payment.id
    or v_attempt.operation <> 'capture'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256 is distinct from v_order.execution_scope_sha256
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_capture_revision
    or v_attempt.terminal_http_status not between 200 and 299
    or v_attempt.terminal_response_sha256 is null
    or v_attempt.terminal_response_bytes is null
    or v_attempt.terminal_receipt_sha256 is null
    or v_attempt.amount_cents is distinct from v_order.total_cents
    or v_attempt.currency is distinct from v_order.currency
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256 is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.processor_reference_sha256 is distinct from p_processor_reference_sha256
    or v_payment.currency is distinct from v_order.currency
    or v_payment.authorized_cents is distinct from v_order.total_cents
    or v_payment.refunded_cents <> 0
    or not (
      (v_payment.status = 'authorized' and v_payment.captured_cents = 0)
      or (v_payment.status = 'captured'
        and v_payment.captured_cents = v_order.total_cents)
      or v_payment.status = 'ambiguous'
    ) then
    raise exception 'Succeeded Flight capture attestation evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );

  -- An immutable succeeded Duffel response with exact retained evidence owns
  -- replay. A later payment change must not strand that provider booking.
  if exists (
    select 1
      from public.flight_provider_request_attempts as provider_attempt
      join public.flight_order_response_evidence_vault as evidence
        on evidence.attempt_id = provider_attempt.id
       and evidence.order_id = v_order.id
       and evidence.customer_id = v_order.customer_id
       and evidence.execution_mode = 'test'
       and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
       and evidence.provider_response_sha256
         is not distinct from provider_attempt.terminal_response_sha256
       and evidence.deleted_at is null
       and evidence.retention_expires_at > clock_timestamp()
     where provider_attempt.order_id = v_order.id
       and provider_attempt.customer_id = v_order.customer_id
       and provider_attempt.operation = 'create_order'
       and provider_attempt.execution_mode = 'test'
       and provider_attempt.execution_scope_sha256 = v_order.execution_scope_sha256
       and provider_attempt.state = 'succeeded'
       and provider_attempt.revision = 2
       and provider_attempt.terminal_http_status between 200 and 299
       and provider_attempt.terminal_response_sha256 is not null
       and provider_attempt.terminal_response_bytes is not null
       and provider_attempt.terminal_receipt_sha256 is not null
  ) then
    raise exception 'Immutable Flight provider success controls terminal replay';
  end if;

  select * into v_case
    from public.flight_reconciliation_cases as reconciliation
   where reconciliation.order_id = v_order.id
     and reconciliation.case_type = 'payment_order_mismatch'
     and reconciliation.subject_type = 'flight_payment'
     and reconciliation.subject_id = v_payment.id
     and reconciliation.status <> 'resolved'
   order by reconciliation.created_at asc, reconciliation.id asc
   limit 1
   for update;

  if found then
    if v_order.status <> 'requires_review' or v_payment.status <> 'ambiguous'
      or v_case.execution_mode <> 'test'
      or v_case.execution_scope_sha256 is distinct from v_order.execution_scope_sha256
      or v_case.source_status <> 'ambiguous'
      or v_case.target_status not in ('authorized', 'captured')
      or v_case.target_authorized_cents is distinct from v_payment.authorized_cents
      or v_case.target_captured_cents is distinct from v_payment.captured_cents
      or v_case.target_refunded_cents is distinct from v_payment.refunded_cents then
      raise exception 'Flight capture attestation replay collides';
    end if;
    v_target_status := v_case.target_status;
    v_target_authorized_cents := v_case.target_authorized_cents;
    v_target_captured_cents := v_case.target_captured_cents;
    v_target_refunded_cents := v_case.target_refunded_cents;
  else
    if v_payment.status not in ('authorized', 'captured') then
      raise exception 'Flight capture attestation replay evidence is unavailable';
    end if;
    v_target_status := v_payment.status;
    v_target_authorized_cents := v_payment.authorized_cents;
    v_target_captured_cents := v_payment.captured_cents;
    v_target_refunded_cents := v_payment.refunded_cents;
  end if;

  v_expected_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.capture-attestation.expected.v1',
    'capture_attempt_id', v_attempt.id::text,
    'capture_attempt_state', v_attempt.state,
    'capture_attempt_revision', v_attempt.revision,
    'capture_terminal_http_status', v_attempt.terminal_http_status,
    'capture_terminal_response_sha256', v_attempt.terminal_response_sha256,
    'capture_terminal_response_bytes', v_attempt.terminal_response_bytes,
    'capture_terminal_receipt_sha256', v_attempt.terminal_receipt_sha256,
    'order_id', v_order.id::text,
    'payment_id', v_payment.id::text,
    'processor_reference_sha256', v_payment.processor_reference_sha256,
    'target_status', v_target_status,
    'target_authorized_cents', v_target_authorized_cents,
    'target_captured_cents', v_target_captured_cents,
    'target_refunded_cents', v_target_refunded_cents,
    'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_observed_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.capture-attestation.observed.v1',
    'capture_attempt_id', v_attempt.id::text,
    'mismatch_reason', p_mismatch_reason,
    'observation_sha256', p_observation_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_payment',
    'subject_id', v_payment.id::text,
    'target_status', v_target_status,
    'target_authorized_cents', v_target_authorized_cents,
    'target_captured_cents', v_target_captured_cents,
    'target_refunded_cents', v_target_refunded_cents,
    'execution_mode', v_payment.execution_mode,
    'execution_scope_sha256', v_payment.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');

  if v_case.id is not null then
    if v_case.expected_state_sha256 is distinct from v_expected_sha256
      or v_case.observed_state_sha256 is distinct from v_observed_sha256
      or v_case.target_state_sha256 is distinct from v_target_sha256 then
      raise exception 'Flight capture attestation replay collides';
    end if;
    return query select
      v_order.id, v_order.status, v_payment.id, v_payment.status, v_case.id;
    return;
  end if;

  if v_order.status <> 'requires_review' then
    update public.flight_orders as flight_order
       set status = 'requires_review'
     where flight_order.id = v_order.id
       and flight_order.status = v_order.status
    returning flight_order.* into v_order;
    if not found then raise exception 'Flight capture attestation order CAS failed'; end if;
  end if;
  update public.flight_payments as payment
     set status = 'ambiguous'
   where payment.id = v_payment.id
     and payment.status = v_target_status
     and payment.updated_at = v_payment.updated_at
  returning payment.* into v_payment;
  if not found then raise exception 'Flight capture attestation payment CAS failed'; end if;

  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status, source_revision_at,
    expected_state_sha256, observed_state_sha256, target_status,
    target_authorized_cents, target_captured_cents, target_refunded_cents,
    target_state_sha256, status
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'payment_order_mismatch', 'flight_payment', v_payment.id,
    'ambiguous', v_payment.updated_at, v_expected_sha256, v_observed_sha256,
    v_target_status, v_target_authorized_cents, v_target_captured_cents,
    v_target_refunded_cents, v_target_sha256, 'open'
  ) returning * into v_case;
  return query select
    v_order.id, v_order.status, v_payment.id, v_payment.status, v_case.id;
end;
$record_flight_consumer_capture_attestation_mismatch_093$;

revoke all on function public.record_flight_consumer_capture_attestation_mismatch_v1(
  uuid, uuid, uuid, integer, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_flight_consumer_capture_attestation_mismatch_v1(
  uuid, uuid, uuid, integer, text, text, text
) to service_role;

comment on function public.record_flight_consumer_capture_attestation_mismatch_v1(
  uuid, uuid, uuid, integer, text, text, text
) is 'Atomically records a digest-only semantic Stripe capture-attestation mismatch as active payment reconciliation before any Duffel claim; transient availability failures are not evidence.';

do $flight_consumer_preview_093_postcondition$
declare
  v_safe_count integer;
  v_source text;
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
  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)'
   );
  if v_safe_count <> 1
    or v_source is null
    or position('flight_order -> capture attempt -> payment' in v_source) = 0
    or position('Immutable Flight provider success controls terminal replay' in v_source) = 0
    or position('payment_order_mismatch' in v_source) = 0
    or not has_function_privilege(
      'service_role',
      'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 093 postcondition failed';
  end if;
end;
$flight_consumer_preview_093_postcondition$;

commit;
