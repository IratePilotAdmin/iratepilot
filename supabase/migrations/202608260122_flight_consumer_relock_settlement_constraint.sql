begin;

-- Migration 074 introduced the split Duffel-balance settlement binding, but
-- its dependency constraint admitted only unbound locked rows or active rows.
-- The reviewed relock RPC deliberately preserves the complete binding and its
-- execution-scope evidence while closing every capability, so that exact safe
-- transition was rejected. This migration qualifies only that constraint. It
-- does not change a control row, enable traffic, move money, or authorize
-- Production.
do $flight_consumer_preview_083_dependencies$
declare
  v_constraint_definition text;
  v_relock_source text;
  v_guarded_state_count integer;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regprocedure(
      'public.relock_flight_consumer_preview_v1(timestamptz,text,text,text,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview relock qualification requires migrations 068 through 082';
  end if;
  select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
    into v_constraint_definition
    from pg_catalog.pg_constraint as constraint_record
   where constraint_record.conrelid = 'public.flight_runtime_controls'::regclass
     and constraint_record.conname =
       'flight_runtime_controls_provider_settlement_dependency_check'
     and constraint_record.contype = 'c';
  select routine.prosrc into v_relock_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.relock_flight_consumer_preview_v1(timestamptz,text,text,text,text,text)'
   );
  if v_constraint_definition is null
    or position('bound_provider_settlement_processor_code is null' in v_constraint_definition) = 0
    or position('provider_sandbox_traffic_enabled' in v_constraint_definition) = 0
    or position('execution_kill_switch_engaged' in v_constraint_definition) > 0
    or v_relock_source is null
    or position('execution_kill_switch_engaged = true' in v_relock_source) = 0
    or position('provider_sandbox_traffic_enabled = false' in v_relock_source) = 0
    or position('bound_provider_settlement_processor_code = null' in v_relock_source) > 0
    or position('bound_execution_scope_sha256 = null' in v_relock_source) > 0 then
    raise exception 'Flight Consumer Preview relock settlement predecessor has drifted';
  end if;

  select count(*)::integer into v_guarded_state_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and not control.synthetic_execution_enabled
     and not control.provider_live_traffic_enabled
     and not control.servicing_enabled
     and not control.production_release_enabled
     and (
       (
         not control.execution_kill_switch_engaged
         and control.provider_sandbox_traffic_enabled
         and control.shopping_enabled
         and control.order_enabled
         and control.payment_enabled
         and control.ticketing_enabled
         and control.provider_events_enabled
       )
       or (
         control.execution_kill_switch_engaged
         and not control.provider_sandbox_traffic_enabled
         and not control.shopping_enabled
         and not control.order_enabled
         and not control.payment_enabled
         and not control.ticketing_enabled
         and not control.provider_events_enabled
       )
     );
  if v_guarded_state_count <> 1 then
    raise exception 'Flight Consumer Preview migration 083 requires an exact active or relocked TEST posture';
  end if;
end;
$flight_consumer_preview_083_dependencies$;

alter table public.flight_runtime_controls
  drop constraint flight_runtime_controls_provider_settlement_dependency_check;

alter table public.flight_runtime_controls
  add constraint flight_runtime_controls_provider_settlement_dependency_check
  check (
    (
      bound_provider_settlement_processor_code is null
      and bound_provider_settlement_account_sha256 is null
      and bound_provider_settlement_environment is null
      and bound_provider_settlement_source_sha256 is null
      and bound_provider_settlement_adapter_version_sha256 is null
      and not order_enabled
    )
    or (
      bound_provider_settlement_processor_code is not null
      and bound_provider_settlement_account_sha256 is not null
      and bound_provider_settlement_environment is not null
      and bound_provider_settlement_source_sha256 is not null
      and bound_provider_settlement_adapter_version_sha256 is not null
      and (
        (provider_sandbox_traffic_enabled
          and bound_provider_settlement_environment = 'test')
        or (provider_live_traffic_enabled
          and bound_provider_settlement_environment = 'live')
        or (
          execution_kill_switch_engaged
          and not synthetic_execution_enabled
          and not provider_sandbox_traffic_enabled
          and not provider_live_traffic_enabled
          and not shopping_enabled
          and not order_enabled
          and not payment_enabled
          and not ticketing_enabled
          and not servicing_enabled
          and not provider_events_enabled
          and not production_release_enabled
        )
      )
    )
  ) not valid;

alter table public.flight_runtime_controls
  validate constraint flight_runtime_controls_provider_settlement_dependency_check;

do $flight_consumer_preview_083_postcondition$
declare
  v_definition text;
  v_validated boolean;
  v_guarded_state_count integer;
begin
  select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)),
         constraint_record.convalidated
    into v_definition, v_validated
    from pg_catalog.pg_constraint as constraint_record
   where constraint_record.conrelid = 'public.flight_runtime_controls'::regclass
     and constraint_record.conname =
       'flight_runtime_controls_provider_settlement_dependency_check'
     and constraint_record.contype = 'c';
  if v_definition is null
    or not v_validated
    or position('execution_kill_switch_engaged' in v_definition) = 0
    or position('not synthetic_execution_enabled' in v_definition) = 0
    or position('not provider_sandbox_traffic_enabled' in v_definition) = 0
    or position('not provider_live_traffic_enabled' in v_definition) = 0
    or position('not shopping_enabled' in v_definition) = 0
    or position('not order_enabled' in v_definition) = 0
    or position('not payment_enabled' in v_definition) = 0
    or position('not ticketing_enabled' in v_definition) = 0
    or position('not servicing_enabled' in v_definition) = 0
    or position('not provider_events_enabled' in v_definition) = 0
    or position('not production_release_enabled' in v_definition) = 0 then
    raise exception 'Flight Consumer Preview migration 083 did not qualify the relocked settlement constraint';
  end if;

  select count(*)::integer into v_guarded_state_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and not control.synthetic_execution_enabled
     and not control.provider_live_traffic_enabled
     and not control.servicing_enabled
     and not control.production_release_enabled
     and (
       (
         not control.execution_kill_switch_engaged
         and control.provider_sandbox_traffic_enabled
         and control.shopping_enabled
         and control.order_enabled
         and control.payment_enabled
         and control.ticketing_enabled
         and control.provider_events_enabled
       )
       or (
         control.execution_kill_switch_engaged
         and not control.provider_sandbox_traffic_enabled
         and not control.shopping_enabled
         and not control.order_enabled
         and not control.payment_enabled
         and not control.ticketing_enabled
         and not control.provider_events_enabled
       )
     );
  if v_guarded_state_count <> 1 then
    raise exception 'Flight Consumer Preview migration 083 changed the guarded runtime posture';
  end if;
end;
$flight_consumer_preview_083_postcondition$;

comment on constraint flight_runtime_controls_provider_settlement_dependency_check
  on public.flight_runtime_controls is
  'Complete Duffel settlement binding is valid only during matching sandbox/live provider traffic or while every transaction capability is durably relocked.';

commit;
