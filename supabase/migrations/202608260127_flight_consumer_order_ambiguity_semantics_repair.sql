begin;

-- Forward repair for the Preview-only Duffel create-order ambiguity projection.
-- Migration 075 installed an exact-replay branch for reviewed orders, but its
-- upfront status guard rejected requires_review before that branch was reachable.
-- It also classified terminal provider failure as potentially provider-created.
-- This repair restores those intended semantics without enabling any runtime
-- capability, contacting a provider, moving money, or authorizing Production.
do $flight_consumer_preview_088_dependencies$
declare
  v_ambiguity_source text;
  v_capture_source text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_reconciliation_cases') is null
    or to_regprocedure(
      'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)'
    ) is null
    or to_regprocedure(
      'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)'
    ) is null then
    raise exception 'Flight Consumer Preview ambiguity semantics repair requires migrations 068 through 087';
  end if;

  select routine.prosrc into v_ambiguity_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)'
   );
  select routine.prosrc into v_capture_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)'
   );

  if v_ambiguity_source is null
    or position('#variable_conflict error' in v_ambiguity_source) > 0
    or position(
      'or v_order.status <> ''order_creating''' in v_ambiguity_source
    ) = 0
    or position(
      'v_target_status := case when v_attempt.state in (''prepared'', ''blocked'')'
      in v_ambiguity_source
    ) = 0
    or position(
      'if v_order.status = ''requires_review'' then' in v_ambiguity_source
    ) = 0
    or v_capture_source is null
    or position('#variable_conflict error' in v_capture_source) = 0
    or position(
      'where payment.id = p_payment_id and payment.order_id = v_order.id'
      in v_capture_source
    ) = 0 then
    raise exception 'Flight Consumer Preview ambiguity semantics predecessor has drifted';
  end if;
end;
$flight_consumer_preview_088_dependencies$;

-- Install only from the fully relocked posture. The repaired replay and
-- reconciliation behavior remains available solely through the existing
-- evidence-bound service-role Preview contracts after explicit reactivation.
do $flight_consumer_preview_088_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 088 requires relock before repair';
  end if;
end;
$flight_consumer_preview_088_relocked_precondition$;

create or replace function public.mark_flight_consumer_order_ambiguous_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_expected_state_sha256 text,
  p_observed_state_sha256 text
)
returns table (order_id uuid, order_status text, reconciliation_case_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $mark_flight_consumer_order_ambiguous_088$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_case public.flight_reconciliation_cases;
  v_target_status text;
  v_target_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight order ambiguity recording is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_provider_request_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.retry_authorized
    or v_attempt.state not in (
      'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked'
    )
    or v_attempt.revision <> p_expected_terminal_revision
    or (v_attempt.state = 'prepared' and v_attempt.revision <> 0)
    or (v_attempt.state in ('dispatching', 'blocked') and v_attempt.revision <> 1)
    or (v_attempt.state in ('succeeded', 'failed', 'ambiguous')
      and v_attempt.revision <> 2)
    or v_order.status not in ('order_creating', 'requires_review')
    or v_order.provider_order_ref_sha256 is not null
    or p_expected_state_sha256 is null
    or p_expected_state_sha256 !~ '^[0-9a-f]{64}$'
    or p_observed_state_sha256 is null
    or p_observed_state_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight order ambiguity evidence does not match';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  if v_payment.id is null then
    raise exception 'Flight order ambiguity requires exact captured Stripe liability';
  end if;
  v_target_status := case when v_attempt.state in ('prepared', 'failed', 'blocked')
    then 'failed' else 'order_creating' end;
  if v_order.status = 'requires_review' then
    select * into v_case from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = v_order.execution_mode
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.case_type = 'ambiguous_order'
       and reconciliation.subject_type = 'flight_order'
       and reconciliation.subject_id = v_order.id
       and reconciliation.source_status = 'requires_review'
       and reconciliation.expected_state_sha256 = p_expected_state_sha256
       and reconciliation.observed_state_sha256 = p_observed_state_sha256
       and reconciliation.target_status = v_target_status
     order by reconciliation.created_at asc, reconciliation.id asc
     limit 1;
    if v_case.id is null then
      raise exception 'Flight order ambiguity replay collides';
    end if;
    return query select v_order.id, v_order.status, v_case.id;
    return;
  end if;
  update public.flight_orders set status = 'requires_review'
   where id = v_order.id and status = 'order_creating'
  returning * into v_order;
  if not found then raise exception 'Flight order review transition CAS failed'; end if;
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', v_order.id::text,
    'target_status', v_target_status, 'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status, source_revision_at,
    expected_state_sha256, observed_state_sha256, target_status,
    target_state_sha256, status
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'ambiguous_order', 'flight_order', v_order.id, 'requires_review',
    v_order.updated_at, p_expected_state_sha256, p_observed_state_sha256,
    v_target_status, v_target_sha256, 'open'
  ) returning * into v_case;
  return query select v_order.id, v_order.status, v_case.id;
end;
$mark_flight_consumer_order_ambiguous_088$;

revoke all on function public.mark_flight_consumer_order_ambiguous_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_flight_consumer_order_ambiguous_v1(
  uuid, integer, text, text
) to service_role;

do $flight_consumer_preview_088_postcondition$
declare
  v_ambiguity_source text;
  v_safe_count integer;
begin
  select routine.prosrc into v_ambiguity_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig =
       array['search_path=pg_catalog, public, extensions']::text[];

  if v_ambiguity_source is null
    or position('#variable_conflict error' in v_ambiguity_source) = 0
    or position(
      'or v_order.status not in (''order_creating'', ''requires_review'')'
      in v_ambiguity_source
    ) = 0
    or position(
      'v_target_status := case when v_attempt.state in (''prepared'', ''failed'', ''blocked'')'
      in v_ambiguity_source
    ) = 0
    or position(
      'or v_order.status <> ''order_creating''' in v_ambiguity_source
    ) > 0
    or position(
      'v_attempt.state in (''prepared'', ''blocked'')' in v_ambiguity_source
    ) > 0 then
    raise exception 'Flight Consumer Preview migration 088 did not install the ambiguity semantics repair';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.mark_flight_consumer_order_ambiguous_v1(uuid,integer,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 088 function grants are unsafe';
  end if;

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
    raise exception 'Flight Consumer Preview migration 088 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_088_postcondition$;

comment on function public.mark_flight_consumer_order_ambiguous_v1(
  uuid, integer, text, text
) is
  'Service-role Preview Duffel ambiguity projection with migration-088 replay and terminal-failure semantics.';

commit;
