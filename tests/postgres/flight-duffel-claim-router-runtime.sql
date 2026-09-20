\set ON_ERROR_STOP on

-- Disposable local PostgreSQL acceptance only. This script performs no HTTP,
-- reads no credentials, and cannot touch the retained Preview request journal.
begin;

create schema flight_duffel_claim_gate;

create function flight_duffel_claim_gate.assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'FLIGHT_DUFFEL_CLAIM_ASSERTION_FAILED: %', p_message;
  end if;
end;
$function$;

create function flight_duffel_claim_gate.expect_second_claim_cas(
  p_attempt_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_failed boolean := false;
  v_message text;
begin
  begin
    perform *
      from public.claim_flight_provider_attempt_rpc(
        p_attempt_id,
        0,
        'create_order',
        repeat('f', 64),
        repeat('1', 64),
        repeat('2', 64)
      );
  exception when others then
    v_failed := true;
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Duffel test order dispatch CAS failed' then
      raise exception 'FLIGHT_DUFFEL_CLAIM_WRONG_ERROR: expected exact CAS, received %',
        v_message;
    end if;
  end;

  if not v_failed then
    raise exception 'FLIGHT_DUFFEL_CLAIM_EXPECTED_CAS_NOT_RAISED';
  end if;
end;
$function$;

grant usage on schema flight_duffel_claim_gate to service_role;
grant execute on function flight_duffel_claim_gate.assert(boolean, text),
  flight_duffel_claim_gate.expect_second_claim_cas(uuid)
  to service_role;

commit;

select flight_duffel_claim_gate.assert(
  to_regprocedure(
    'public.prepare_flight_provider_attempt_rpc(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz)'
  ) is not null
    and to_regprocedure(
      'public.claim_flight_provider_attempt_rpc(uuid,integer,text,text,text,text)'
    ) is not null
    and to_regprocedure(
      'public.claim_flight_provider_order_attempt_for_dispatch(uuid,integer)'
    ) is not null,
  'migrations 070 through 073 must expose the reviewed Duffel order bridges'
);

-- The base 068/069 gate leaves this disposable database shopping-only. Move
-- only this database to the exact Preview/test bindings required by 070-073.
-- Binding identity changes require a fresh execution scope and activation hash.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.flight_runtime_controls
   set execution_kill_switch_engaged = false,
       provider_sandbox_traffic_enabled = true,
       shopping_enabled = true,
       order_enabled = true,
       payment_enabled = true,
       ticketing_enabled = true,
       production_release_enabled = false,
       bound_environment = 'preview',
       bound_project_ref = 'eiqmdldjnedqgbtoozqa',
       bound_database_name = :'gate_database',
       bound_session_user = :'gate_admin_role',
       bound_provider_code = 'duffel',
       bound_provider_account_sha256 = repeat('d', 64),
       bound_point_of_sale = 'US',
       bound_content_scope_sha256 = repeat('e', 64),
       bound_adapter_version_sha256 = repeat('c', 64),
       bound_payment_processor_code = 'duffel_balance',
       bound_payment_account_sha256 = repeat('5', 64),
       bound_payment_environment = 'test',
       bound_payment_source_sha256 = repeat('6', 64),
       bound_payment_adapter_version_sha256 = repeat('7', 64),
       bound_execution_scope_sha256 = repeat('3', 64),
       activation_evidence_sha256 = repeat('4', 64),
       updated_by = '00000000-0000-4000-8000-000000000001'
 where control_key = 'global';
commit;

select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('app.flight_execution_authorized', 'true', false);
select set_config('app.flight_environment', 'preview', false);
select set_config('app.flight_project_ref', 'eiqmdldjnedqgbtoozqa', false);
select set_config('app.flight_activation_evidence_sha256', repeat('4', 64), false);
set role service_role;

select flight_duffel_claim_gate.assert(
  (
    select not execution_kill_switch_engaged
      and not synthetic_execution_enabled
      and provider_sandbox_traffic_enabled
      and not provider_live_traffic_enabled
      and shopping_enabled
      and order_enabled
      and payment_enabled
      and ticketing_enabled
      and not servicing_enabled
      and not provider_events_enabled
      and not production_release_enabled
      and bound_environment = 'preview'
      and bound_project_ref = 'eiqmdldjnedqgbtoozqa'
      and bound_database_name = :'gate_database'
      and bound_session_user = :'gate_admin_role'
      and bound_execution_scope_sha256 = repeat('3', 64)
      and activation_evidence_sha256 = repeat('4', 64)
      from public.flight_runtime_controls
     where control_key = 'global'
  )
    and (select count(*) = 2 from public.flight_runtime_control_receipts),
  'only the exact disposable Preview/test order controls may be active'
);

select flight_duffel_claim_gate.assert(
  public.flight_runtime_capability_enabled(
    'test', 'order', 'duffel', null, repeat('3', 64)
  )
    and public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'duffel_balance', repeat('3', 64)
    )
    and public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, repeat('3', 64)
    ),
  'the disposable database must have exact test order/payment/ticketing authority'
);

select *
  from public.prepare_flight_provider_attempt_rpc(
    'claim_gate_tenant',
    'claim_gate_order_073',
    'create_order',
    'duffel',
    'test',
    repeat('3', 64),
    repeat('4', 64),
    repeat('c', 64),
    repeat('f', 64),
    repeat('d', 64),
    '9b202ecbc6d45c6d8901d989a918878397a3eb9d00e8f48022fc051b19d21a1d',
    repeat('e', 64),
    repeat('1', 64),
    repeat('8', 64),
    repeat('9', 64),
    repeat('a', 64),
    repeat('2', 64),
    clock_timestamp() + interval '4 minutes'
  )
\gset prepared_

select flight_duffel_claim_gate.assert(
  :'prepared_attempt_revision'::integer = 0
    and :'prepared_attempt_state' = 'prepared'
    and (
      select count(*) = 1
        from public.flight_provider_request_attempts
       where id = :'prepared_attempt_id'::uuid
         and tenant_id = 'claim_gate_tenant'
         and commerce_id = 'claim_gate_order_073'
         and operation = 'create_order'
         and state = 'prepared'
         and revision = 0
         and not retry_authorized
         and dispatch_started_at is null
    )
    and (
      select count(*) = 1
        from public.flight_provider_request_attempts
       where operation = 'create_order'
    ),
  'prepare RPC must create exactly one non-retryable prepared revision-zero order'
);

-- Commit the first claim before attempting the loser. This is the exact path
-- whose missing terminal return in 072 previously rolled the claim back.
begin;
select *
  from public.claim_flight_provider_attempt_rpc(
    :'prepared_attempt_id'::uuid,
    0,
    'create_order',
    repeat('f', 64),
    repeat('1', 64),
    repeat('2', 64)
  )
\gset claimed_
commit;

select flight_duffel_claim_gate.assert(
  :'claimed_attempt_id'::uuid = :'prepared_attempt_id'::uuid
    and :'claimed_attempt_revision'::integer = 1
    and :'claimed_attempt_state' = 'dispatching'
    and (
      select count(*) = 1
        from public.flight_provider_request_attempts
       where id = :'prepared_attempt_id'::uuid
         and state = 'dispatching'
         and revision = 1
         and dispatch_started_at is not null
         and not retry_authorized
         and terminal_http_status is null
         and terminal_response_sha256 is null
         and terminal_response_bytes is null
         and terminal_receipt_sha256 is null
         and completed_at is null
    ),
  'first wrapper claim must commit exactly dispatching revision one'
);

-- A separate autocommit transaction must observe the committed winner and
-- fail the original revision-zero CAS. The helper checks the exact exception.
select flight_duffel_claim_gate.expect_second_claim_cas(
  :'prepared_attempt_id'::uuid
);

select flight_duffel_claim_gate.assert(
  (
    select count(*) = 1
      from public.flight_provider_request_attempts
     where id = :'prepared_attempt_id'::uuid
       and state = 'dispatching'
       and revision = 1
       and dispatch_started_at is not null
       and not retry_authorized
       and terminal_http_status is null
       and terminal_response_sha256 is null
       and terminal_response_bytes is null
       and terminal_receipt_sha256 is null
       and completed_at is null
  ),
  'second claim failure must preserve exactly the committed dispatching revision-one row'
);

reset role;

\echo FLIGHT_DUFFEL_CLAIM_ROUTER_RUNTIME_PASS
