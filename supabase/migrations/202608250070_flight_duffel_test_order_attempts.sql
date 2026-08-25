begin;

-- Test-mode Duffel order dispatch only. This migration does not enable any
-- runtime capability, alter the kill switch, authorize Production, or permit
-- retries. It extends the immutable 069 journal with one exact operation.
do $$
begin
  if to_regclass('public.flight_provider_request_attempts') is null
    or to_regprocedure(
      'public.complete_flight_provider_request_attempt(uuid,integer,text,smallint,text,bigint,text)'
    ) is null then
    raise exception 'Duffel test order attempts require migration 069';
  end if;
end;
$$;

alter table public.flight_provider_request_attempts
  drop constraint flight_provider_request_attempts_operation_check;
alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_operation_check
  check (operation in (
    'create_offer_request', 'retrieve_offer', 'list_orders_by_offer', 'create_order'
  ));

create function public.prepare_flight_provider_order_attempt(
  p_tenant_id text,
  p_commerce_id text,
  p_provider_code text,
  p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_account_sha256 text,
  p_point_of_sale_sha256 text,
  p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider order-attempt preparation is service-role only';
  end if;
  if p_provider_code <> 'duffel' then
    raise exception 'Flight provider order attempt is restricted to Duffel test mode';
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    'test', 'order', p_provider_code, null, p_execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'payment', p_provider_code, 'duffel_balance', p_execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'ticketing', p_provider_code, null, p_execution_scope_sha256
  ) then
    raise exception 'Duffel test order, settlement, or ticketing capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from p_activation_evidence_sha256
    or v_control.bound_environment <> 'preview'
    or v_control.bound_project_ref <> 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_provider_code is distinct from p_provider_code
    or v_control.bound_execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from p_adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from p_provider_account_sha256
    or v_point_of_sale_sha256 is distinct from p_point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from p_content_scope_sha256
    or v_control.bound_payment_processor_code <> 'duffel_balance'
    or v_control.bound_payment_environment <> 'test' then
    raise exception 'Duffel test order binding does not match the locked runtime control';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from p_adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from p_provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from p_operation_authority_receipt_sha256 then
    raise exception 'Duffel test order opaque receipt digests are not exactly session-bound';
  end if;

  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Duffel test order dispatch deadline is invalid';
  end if;

  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at
  ) values (
    p_tenant_id, p_commerce_id, 'create_order', p_provider_code, 'test',
    p_execution_scope_sha256, p_activation_evidence_sha256,
    p_adapter_version_sha256, p_adapter_source_sha256,
    p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
    p_provider_binding_receipt_sha256,
    p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
    p_operation_authority_receipt_sha256, p_dispatch_not_after,
    'prepared', 0, false, v_now
  )
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Duffel test order request already has an attempt; retry is not authorized';
end;
$$;

create function public.claim_flight_provider_order_attempt_for_dispatch(
  p_attempt_id uuid,
  p_expected_revision integer
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider order dispatch claim is service-role only';
  end if;
  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.operation <> 'create_order'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Duffel test order dispatch CAS failed';
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    'test', 'order', 'duffel', null, v_attempt.execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'payment', 'duffel', 'duffel_balance', v_attempt.execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'ticketing', 'duffel', null, v_attempt.execution_scope_sha256
  ) then
    raise exception 'Duffel test order capability changed before dispatch';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_environment <> 'preview'
    or v_control.bound_project_ref <> 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_provider_code is distinct from v_attempt.provider_code
    or v_control.bound_execution_scope_sha256 is distinct from v_attempt.execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from v_attempt.provider_account_sha256
    or v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from v_attempt.content_scope_sha256
    or current_setting('app.flight_adapter_source_sha256', true)
      is distinct from v_attempt.adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from v_attempt.provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from v_attempt.operation_authority_receipt_sha256 then
    raise exception 'Duffel test order binding changed before dispatch';
  end if;

  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Duffel test order dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching', revision = revision + 1, dispatch_started_at = v_now
   where id = p_attempt_id and state = 'prepared' and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Duffel test order dispatch CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

revoke all on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer)
  to service_role;

comment on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) is 'Prepares exactly one non-retryable Duffel test order attempt after order, settlement, ticketing, runtime, provider, and opaque receipt checks.';
comment on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer) is
  'Atomically rechecks the exact Preview Duffel test-order authority immediately before the one allowed HTTP dispatch.';

commit;
