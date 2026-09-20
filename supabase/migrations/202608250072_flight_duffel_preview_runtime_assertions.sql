begin;

-- Complete the PostgREST bridge by binding the runtime assertions required by
-- migration 068 into the same transaction as each 069/070 prepare or claim.
create or replace function public.prepare_flight_provider_attempt_rpc(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text, p_adapter_version_sha256 text,
  p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider attempt RPC bridge is service-role only';
  end if;
  perform set_config('app.flight_environment', 'preview', true);
  perform set_config('app.flight_project_ref', 'eiqmdldjnedqgbtoozqa', true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config('app.flight_activation_evidence_sha256', p_activation_evidence_sha256, true);
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    if p_execution_mode <> 'test' then raise exception 'Duffel order RPC bridge is test-only'; end if;
    return query select * from public.prepare_flight_provider_order_attempt(
      p_tenant_id, p_commerce_id, p_provider_code, p_execution_scope_sha256,
      p_activation_evidence_sha256, p_adapter_version_sha256, p_adapter_source_sha256,
      p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
      p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
      p_request_body_sha256, p_operation_authority_receipt_sha256, p_dispatch_not_after
    );
  else
    return query select * from public.prepare_flight_provider_request_attempt(
      p_tenant_id, p_commerce_id, p_operation, p_provider_code, p_execution_mode,
      p_execution_scope_sha256, p_activation_evidence_sha256, p_adapter_version_sha256,
      p_adapter_source_sha256, p_provider_account_sha256, p_point_of_sale_sha256,
      p_content_scope_sha256, p_provider_binding_receipt_sha256, p_request_plan_sha256,
      p_request_sha256, p_request_body_sha256, p_operation_authority_receipt_sha256,
      p_dispatch_not_after
    );
  end if;
end;
$$;

create or replace function public.claim_flight_provider_attempt_rpc(
  p_attempt_id uuid, p_expected_revision integer, p_operation text,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_activation_evidence_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider claim RPC bridge is service-role only';
  end if;
  select activation_evidence_sha256 into v_activation_evidence_sha256
    from public.flight_provider_request_attempts where id = p_attempt_id;
  if not found then raise exception 'Flight provider claim RPC attempt is unavailable'; end if;
  perform set_config('app.flight_environment', 'preview', true);
  perform set_config('app.flight_project_ref', 'eiqmdldjnedqgbtoozqa', true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config('app.flight_activation_evidence_sha256', v_activation_evidence_sha256, true);
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    return query select * from public.claim_flight_provider_order_attempt_for_dispatch(p_attempt_id, p_expected_revision);
  end if;
  return query select * from public.claim_flight_provider_request_attempt_for_dispatch(p_attempt_id, p_expected_revision);
end;
$$;

commit;
