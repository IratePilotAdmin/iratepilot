begin;

-- RETURN QUERY appends rows but does not exit a PL/pgSQL function. The 072
-- bridge therefore routed a successful create_order claim into the shopping
-- claim as well, where the second CAS failed and rolled the transaction back.
do $$
begin
  if to_regprocedure(
    'public.claim_flight_provider_attempt_rpc(uuid,integer,text,text,text,text)'
  ) is null
    or to_regprocedure(
      'public.claim_flight_provider_order_attempt_for_dispatch(uuid,integer)'
    ) is null
    or to_regprocedure(
      'public.claim_flight_provider_request_attempt_for_dispatch(uuid,integer)'
    ) is null then
    raise exception 'Duffel claim terminal return requires migration 072';
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
  else
    return query select * from public.claim_flight_provider_request_attempt_for_dispatch(p_attempt_id, p_expected_revision);
  end if;
end;
$$;

revoke all on function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
) to service_role;

comment on function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
) is 'Transaction-local Preview claim bridge with terminal create-order routing and no shopping-claim fallthrough.';

commit;
