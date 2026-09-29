begin;

-- Forward repair for the migration-081 activation wrapper. Its second guarded
-- runtime-control UPDATE used unqualified column names that collide with the
-- RETURNS TABLE output parameters at execution time (SQLSTATE 42702). This
-- migration changes only identifier qualification; it does not enable a
-- capability, dispatch provider traffic, move money, or authorize Production.
do $flight_consumer_preview_082_dependencies$
declare
  v_source text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regprocedure(
      'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.activate_flight_consumer_preview_080_v1(timestamptz,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.assert_flight_consumer_preview_operational_escalation_contract_v1()'
    ) is null
    or to_regprocedure(
      'public.flight_consumer_preview_activation_manifest_sha256_v3()'
    ) is null
    or to_regprocedure(
      'public.flight_current_runtime_control_receipt_sha256_v1()'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or not exists (
      select 1
        from pg_catalog.pg_trigger as activation_gate
       where activation_gate.tgrelid = 'public.flight_runtime_controls'::regclass
         and activation_gate.tgname = 'flight_runtime_controls_081_activation_gate'
         and not activation_gate.tgisinternal
         and activation_gate.tgenabled = 'O'
    ) then
    raise exception 'Flight Consumer Preview activation CAS repair requires migrations 068 through 081';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)'
   );
  if v_source is null
    or position(
      'public.activate_flight_consumer_preview_080_v1' in v_source
    ) = 0
    or position(
      'iratepilot.flight.consumer-preview.activation-evidence.v3' in v_source
    ) = 0
    or position('where control_key = v_080.control_key' in v_source) = 0
    or position(
      'and updated_at = v_080.updated_at' in v_source
    ) = 0 then
    raise exception 'Flight Consumer Preview activation CAS repair predecessor has drifted';
  end if;
end;
$flight_consumer_preview_082_dependencies$;

-- Function replacement is allowed only while every transaction capability is
-- durably relocked. The failed 081 execution is transactional and cannot have
-- left an active partial state, but this independently proves that posture.
do $flight_consumer_preview_082_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 082 requires relock before repair';
  end if;
end;
$flight_consumer_preview_082_relocked_precondition$;

create or replace function public.activate_flight_consumer_preview_v1(
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
as $activate_flight_consumer_preview_082$
#variable_conflict error
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

  -- Preserve the reviewed two-step 081 transition and evidence contract. Only
  -- the target-table references in this final CAS are newly qualified.
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

  update public.flight_runtime_controls as runtime_control
     set activation_evidence_sha256 = v_activation_evidence_sha256,
         updated_by = v_actor
   where runtime_control.control_key = v_080.control_key
     and runtime_control.updated_at = v_080.updated_at
     and runtime_control.bound_execution_scope_sha256
       = v_080.bound_execution_scope_sha256
     and runtime_control.activation_evidence_sha256
       = v_080.activation_evidence_sha256
     and runtime_control.execution_kill_switch_engaged = false
     and runtime_control.provider_sandbox_traffic_enabled = true
     and runtime_control.provider_live_traffic_enabled = false
     and runtime_control.production_release_enabled = false
  returning runtime_control.* into v_control;
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
$activate_flight_consumer_preview_082$;

revoke all on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) to authenticated;

do $flight_consumer_preview_082_postcondition$
declare
  v_source text;
  v_safe_count integer;
begin
  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array[
       'search_path=pg_catalog, public, extensions'
     ]::text[];
  if v_source is null
    or position(
      'where runtime_control.control_key = v_080.control_key' in v_source
    ) = 0
    or position(
      'and runtime_control.updated_at = v_080.updated_at' in v_source
    ) = 0
    or position(
      'and runtime_control.bound_execution_scope_sha256' in v_source
    ) = 0
    or position(
      'and runtime_control.activation_evidence_sha256' in v_source
    ) = 0
    or position(
      'and runtime_control.execution_kill_switch_engaged = false' in v_source
    ) = 0
    or position(
      'and runtime_control.provider_sandbox_traffic_enabled = true' in v_source
    ) = 0
    or position(
      'and runtime_control.provider_live_traffic_enabled = false' in v_source
    ) = 0
    or position(
      'and runtime_control.production_release_enabled = false' in v_source
    ) = 0
    or position('returning runtime_control.* into v_control' in v_source) = 0
    or position('#variable_conflict error' in v_source) = 0
    or position('where control_key = v_080.control_key' in v_source) > 0 then
    raise exception 'Flight Consumer Preview migration 082 did not install the qualified activation CAS';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Flight Consumer Preview migration 082 activation grants are unsafe';
  end if;
  perform public.assert_flight_consumer_preview_operational_escalation_contract_v1();

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
    raise exception 'Flight Consumer Preview migration 082 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_082_postcondition$;

comment on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) is
  'Exclusive authenticated-admin migration-081 activation contract with the migration-082 output-parameter-safe runtime-control CAS qualification repair.';

commit;
