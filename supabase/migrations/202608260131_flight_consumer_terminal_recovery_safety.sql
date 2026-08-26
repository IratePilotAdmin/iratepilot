begin;

-- Forward-only safety repair for terminal Consumer Preview payment/provider
-- journals. This migration creates no new dispatch authority: it makes adverse
-- capture terminalization observable, blocks provider claims behind active
-- reconciliation, and lets an immutable succeeded Duffel response outlive a
-- later rotation of the mutable provider binding.
do $flight_consumer_preview_092_dependencies$
declare
  v_complete_source text;
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
    or to_regclass('public.flight_consumer_completion_leases') is null
    or to_regprocedure(
      'public.complete_flight_consumer_payment_operation_v1(uuid,integer,text,smallint,text,bigint,text)'
    ) is null
    or to_regprocedure(
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
    ) is null then
    raise exception 'Flight Consumer Preview terminal recovery safety requires migrations 068 through 091';
  end if;

  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_payment_operation_v1(uuid,integer,text,smallint,text,bigint,text)'
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
  if v_complete_source is null
    or position(
      'if p_terminal_state in (''failed'', ''ambiguous'', ''blocked'') then'
      in v_complete_source
    ) = 0
    or position('insert into public.flight_reconciliation_cases' in v_complete_source) > 0
    or v_claim_source is null
    or position('v_attempt.dispatch_not_after > v_reprice.expires_at' in v_claim_source) = 0
    or position('reconciliation.status <> ''resolved''' in v_claim_source) > 0
    or v_recovery_source is null
    or position('v_attempt.provider_account_sha256' in v_recovery_source) = 0
    or position('v_evidence_available' in v_recovery_source) = 0 then
    raise exception 'Flight Consumer Preview terminal recovery predecessor has drifted';
  end if;
end;
$flight_consumer_preview_092_dependencies$;

do $flight_consumer_preview_092_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 092 requires relock before hardening';
  end if;
end;
$flight_consumer_preview_092_relocked_precondition$;

-- Internal, ungranted projector used by both the wrapped terminalization RPC
-- and the one-time backfill below. Its evidence is digest-only and its order
-- lock makes the case creation part of the same terminal CAS transaction.
create function public.ensure_flight_consumer_capture_review_case_092(
  p_attempt_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $ensure_flight_consumer_capture_review_case_092$
#variable_conflict error
declare
  v_attempt public.flight_payment_operation_attempts;
  v_order public.flight_orders;
  v_payment public.flight_payments;
  v_case public.flight_reconciliation_cases;
  v_expected_sha256 text;
  v_observed_sha256 text;
  v_target_sha256 text;
  v_target_status text;
begin
  select * into v_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id
   for update;
  if not found
    or v_attempt.operation <> 'capture'
    or v_attempt.execution_mode <> 'test'
    or not (
      (v_attempt.state = 'blocked' and v_attempt.revision = 1)
      or (v_attempt.state in ('failed', 'ambiguous') and v_attempt.revision = 2)
    ) then
    raise exception 'Adverse Flight capture terminal evidence is unavailable';
  end if;

  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_attempt.order_id
     and flight_order.customer_id = v_attempt.customer_id
   for update;
  select * into v_payment
    from public.flight_payments as payment
   where payment.id = v_attempt.payment_id
     and payment.order_id = v_attempt.order_id
   for update;
  if v_order.id is null or v_payment.id is null
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_order.status <> 'requires_review'
    or v_payment.processor_code <> 'stripe'
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.currency is distinct from v_order.currency
    or v_payment.authorized_cents is distinct from v_order.total_cents
    or v_payment.captured_cents <> 0
    or v_payment.refunded_cents <> 0
    or (
      v_attempt.state = 'ambiguous' and v_payment.status <> 'ambiguous'
    )
    or (
      v_attempt.state in ('blocked', 'failed') and v_payment.status <> 'authorized'
    ) then
    raise exception 'Adverse Flight capture review state does not match';
  end if;

  v_target_status := case when v_attempt.state = 'ambiguous'
    then 'order_creating' else 'failed' end;
  v_expected_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.capture-review.expected.v1',
    'attempt_id', v_attempt.id::text,
    'order_id', v_order.id::text,
    'payment_id', v_payment.id::text,
    'attempt_state', v_attempt.state,
    'attempt_revision', v_attempt.revision,
    'order_status', v_order.status,
    'payment_status', v_payment.status,
    'authorized_cents', v_payment.authorized_cents,
    'captured_cents', v_payment.captured_cents,
    'refunded_cents', v_payment.refunded_cents,
    'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_observed_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.capture-review.observed.v1',
    'attempt_id', v_attempt.id::text,
    'attempt_state', v_attempt.state,
    'attempt_revision', v_attempt.revision,
    'terminal_http_status', v_attempt.terminal_http_status,
    'terminal_response_sha256', v_attempt.terminal_response_sha256,
    'terminal_response_bytes', v_attempt.terminal_response_bytes,
    'terminal_receipt_sha256', v_attempt.terminal_receipt_sha256,
    'completed_at', v_attempt.completed_at
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order',
    'subject_id', v_order.id::text,
    'target_status', v_target_status,
    'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_case
    from public.flight_reconciliation_cases as reconciliation
   where reconciliation.order_id = v_order.id
     and reconciliation.case_type = 'ambiguous_order'
     and reconciliation.subject_type = 'flight_order'
     and reconciliation.subject_id = v_order.id
     and reconciliation.status <> 'resolved'
   order by reconciliation.created_at asc, reconciliation.id asc
   limit 1
   for update;
  if found then
    if v_case.execution_mode <> 'test'
      or v_case.execution_scope_sha256
        is distinct from v_order.execution_scope_sha256
      or v_case.source_status <> 'requires_review'
      or v_case.expected_state_sha256 is distinct from v_expected_sha256
      or v_case.observed_state_sha256 is distinct from v_observed_sha256
      or v_case.target_status is distinct from v_target_status
      or v_case.target_state_sha256 is distinct from v_target_sha256 then
      raise exception 'Adverse Flight capture review replay collides';
    end if;
    return v_case.id;
  end if;

  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status, source_revision_at,
    expected_state_sha256, observed_state_sha256, target_status,
    target_state_sha256, status
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'ambiguous_order', 'flight_order', v_order.id, 'requires_review',
    v_order.updated_at, v_expected_sha256, v_observed_sha256,
    v_target_status, v_target_sha256, 'open'
  ) returning * into v_case;
  return v_case.id;
end;
$ensure_flight_consumer_capture_review_case_092$;

alter function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) rename to complete_flight_consumer_payment_operation_pre092_v1;

create function public.complete_flight_consumer_payment_operation_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $complete_flight_consumer_payment_operation_092$
#variable_conflict error
declare
  v_result record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Stripe operation completion is service-role only';
  end if;
  select * into v_result
    from public.complete_flight_consumer_payment_operation_pre092_v1(
      p_attempt_id, p_expected_revision, p_terminal_state,
      p_terminal_http_status, p_terminal_response_sha256,
      p_terminal_response_bytes, p_terminal_receipt_sha256
    );
  if v_result.attempt_id is null then
    raise exception 'Flight Stripe operation completion returned no result';
  end if;
  if p_terminal_state in ('blocked', 'failed', 'ambiguous')
    and exists (
      select 1 from public.flight_payment_operation_attempts as attempt
       where attempt.id = p_attempt_id and attempt.operation = 'capture'
    ) then
    perform public.ensure_flight_consumer_capture_review_case_092(p_attempt_id);
  end if;
  return query select
    v_result.attempt_id::uuid,
    v_result.attempt_revision::integer,
    v_result.attempt_state::text;
end;
$complete_flight_consumer_payment_operation_092$;

alter function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) rename to claim_flight_consumer_duffel_order_attempt_pre092_v1;

create function public.claim_flight_consumer_duffel_order_attempt_v1(
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
as $claim_flight_consumer_order_092$
#variable_conflict error
declare
  v_order_id uuid;
  v_order public.flight_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order claim is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_order_id
   for update;
  if not found or v_order.status <> 'order_creating' then
    raise exception 'Flight consumer Duffel order claim is unavailable';
  end if;
  if exists (
    select 1 from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.status <> 'resolved'
       and (
         (
           reconciliation.subject_type = 'flight_order'
           and reconciliation.subject_id = v_order.id
         )
         or (
           reconciliation.subject_type = 'flight_payment'
           and exists (
             select 1 from public.flight_payments as payment
              where payment.id = reconciliation.subject_id
                and payment.order_id = v_order.id
           )
         )
       )
  ) then
    raise exception 'Active Flight reconciliation blocks Duffel dispatch';
  end if;
  return query
  select claimed.attempt_id, claimed.attempt_revision, claimed.attempt_state
    from public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
      p_attempt_id, p_expected_revision, p_adapter_source_sha256,
      p_provider_binding_receipt_sha256, p_payment_binding_receipt_sha256,
      p_provider_settlement_binding_receipt_sha256,
      p_operation_authority_receipt_sha256
    ) as claimed;
end;
$claim_flight_consumer_order_092$;

create or replace function public.get_flight_consumer_duffel_order_recovery_v1(
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
as $get_flight_consumer_duffel_order_recovery_092$
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
  if v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.retry_authorized then
    raise exception 'Flight Duffel recovery journal is invalid';
  end if;

  -- Only a not-yet-terminal attempt can derive mutation authority from the
  -- current binding. A succeeded response is historical evidence and remains
  -- replayable after account/POS/content/adapter rotation; this RPC never
  -- authorizes a provider redispatch.
  if v_attempt.state in ('prepared', 'dispatching') then
    select * into v_control from public.flight_runtime_controls
     where control_key = 'global';
    v_point_of_sale_sha256 := encode(
      extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_attempt.provider_account_sha256
        is distinct from v_control.bound_provider_account_sha256
      or v_attempt.point_of_sale_sha256 is distinct from v_point_of_sale_sha256
      or v_attempt.content_scope_sha256
        is distinct from v_control.bound_content_scope_sha256
      or v_attempt.adapter_version_sha256
        is distinct from v_control.bound_adapter_version_sha256 then
      raise exception 'Flight Duffel recovery mutation binding is stale';
    end if;
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
    and v_attempt.terminal_http_status between 200 and 299
    and v_attempt.terminal_response_sha256 is not null
    and v_attempt.terminal_response_bytes is not null
    and v_attempt.terminal_receipt_sha256 is not null
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
$get_flight_consumer_duffel_order_recovery_092$;

-- Repair any adverse capture terminal committed before this migration. The
-- helper proves the current exact local state and either inserts one case or
-- verifies an exact replay; any collision aborts the migration while relocked.
-- The ordinary runtime-capability trigger intentionally rejects new order
-- evidence while relocked, so suspend only that trigger under this migration's
-- table lock for the bounded evidence repair and restore it immediately.
alter table public.flight_reconciliation_cases
  disable trigger flight_reconciliation_cases_runtime_guard;

do $flight_consumer_preview_092_backfill$
declare
  v_attempt_id uuid;
begin
  for v_attempt_id in
    select attempt.id
      from public.flight_payment_operation_attempts as attempt
      join public.flight_orders as flight_order on flight_order.id = attempt.order_id
     where attempt.operation = 'capture'
       and attempt.execution_mode = 'test'
       and flight_order.consumer_flow_version = 1
       and flight_order.execution_mode = 'test'
       and flight_order.status = 'requires_review'
       and (
         (attempt.state = 'blocked' and attempt.revision = 1)
         or (attempt.state in ('failed', 'ambiguous') and attempt.revision = 2)
       )
     order by attempt.id
  loop
    perform public.ensure_flight_consumer_capture_review_case_092(v_attempt_id);
  end loop;
end;
$flight_consumer_preview_092_backfill$;

alter table public.flight_reconciliation_cases
  enable trigger flight_reconciliation_cases_runtime_guard;

revoke all on function public.ensure_flight_consumer_capture_review_case_092(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_payment_operation_pre092_v1(
  uuid, integer, text, smallint, text, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) to service_role;
grant execute on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) to service_role;
grant execute on function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid)
  to service_role;

comment on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) is 'Completes one Stripe TEST journal CAS and atomically projects every adverse capture terminal into exact active review evidence.';
comment on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) is 'Claims one Duffel TEST create-order attempt only when no active order/payment reconciliation exists; the wrapped 089 authority checks remain mandatory.';
comment on function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid)
  is 'Returns owner-scoped Duffel recovery metadata without redispatch; terminal success uses immutable stored evidence and does not depend on the current provider binding.';

do $flight_consumer_preview_092_postcondition$
declare
  v_safe_count integer;
  v_complete_source text;
  v_claim_source text;
  v_recovery_source text;
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
  select routine.prosrc into v_complete_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_payment_operation_v1(uuid,integer,text,smallint,text,bigint,text)'
   );
  select routine.prosrc into v_claim_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
   );
  select routine.prosrc into v_recovery_source from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
   );
  if v_safe_count <> 1
    or v_complete_source is null
    or position('ensure_flight_consumer_capture_review_case_092' in v_complete_source) = 0
    or v_claim_source is null
    or position('reconciliation.status <> ''resolved''' in v_claim_source) = 0
    or position('Active Flight reconciliation blocks Duffel dispatch' in v_claim_source) = 0
    or v_recovery_source is null
    or position('if v_attempt.state in (''prepared'', ''dispatching'') then' in v_recovery_source) = 0
    or position('v_evidence_available' in v_recovery_source) = 0
    or not exists (
      select 1 from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.flight_reconciliation_cases'::regclass
         and trigger_row.tgname = 'flight_reconciliation_cases_runtime_guard'
         and trigger_row.tgenabled = 'O'
         and not trigger_row.tgisinternal
    )
    or not has_function_privilege(
      'service_role',
      'public.complete_flight_consumer_payment_operation_v1(uuid,integer,text,smallint,text,bigint,text)',
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
      'service_role',
      'public.ensure_flight_consumer_capture_review_case_092(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)',
      'EXECUTE'
    )
    or exists (
      select 1
        from public.flight_payment_operation_attempts as attempt
        join public.flight_orders as flight_order on flight_order.id = attempt.order_id
       where attempt.operation = 'capture'
         and attempt.execution_mode = 'test'
         and flight_order.consumer_flow_version = 1
         and flight_order.status = 'requires_review'
         and (
           (attempt.state = 'blocked' and attempt.revision = 1)
           or (attempt.state in ('failed', 'ambiguous') and attempt.revision = 2)
         )
         and not exists (
           select 1 from public.flight_reconciliation_cases as reconciliation
            where reconciliation.order_id = flight_order.id
              and reconciliation.case_type = 'ambiguous_order'
              and reconciliation.subject_type = 'flight_order'
              and reconciliation.subject_id = flight_order.id
              and reconciliation.status <> 'resolved'
         )
    ) then
    raise exception 'Flight Consumer Preview migration 092 postcondition failed';
  end if;
end;
$flight_consumer_preview_092_postcondition$;

commit;
