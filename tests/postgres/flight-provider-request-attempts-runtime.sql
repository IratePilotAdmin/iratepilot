\set ON_ERROR_STOP on

-- Disposable PostgreSQL acceptance only. This script never performs HTTP,
-- reads credentials, or enables order/payment/ticketing/live capabilities.
begin;

create schema flight_gate_harness;

create function flight_gate_harness.assert(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'FLIGHT_GATE_ASSERTION_FAILED: %', p_message;
  end if;
end;
$function$;

create function flight_gate_harness.expect_error(
  p_statement text,
  p_expected_message text
)
returns void
language plpgsql
as $function$
declare
  v_failed boolean := false;
  v_message text;
begin
  begin
    execute p_statement;
  exception when others then
    v_failed := true;
    get stacked diagnostics v_message = message_text;
    if position(p_expected_message in v_message) = 0 then
      raise exception 'FLIGHT_GATE_WRONG_ERROR: expected %, received %',
        p_expected_message, v_message;
    end if;
  end;
  if not v_failed then
    raise exception 'FLIGHT_GATE_EXPECTED_ERROR_NOT_RAISED: %', p_expected_message;
  end if;
end;
$function$;

create function flight_gate_harness.prepare_attempt(
  p_operation text,
  p_request_sha256 text,
  p_activation_evidence_sha256 text default repeat('a', 64),
  p_execution_scope_sha256 text default repeat('b', 64),
  p_provider_code text default 'duffel',
  p_adapter_version_sha256 text default repeat('c', 64),
  p_provider_account_sha256 text default repeat('d', 64),
  p_point_of_sale_sha256 text default
    '9b202ecbc6d45c6d8901d989a918878397a3eb9d00e8f48022fc051b19d21a1d',
  p_content_scope_sha256 text default repeat('e', 64)
)
returns uuid
language sql
volatile
as $function$
  select attempt_id
    from public.prepare_flight_provider_request_attempt(
      'tenant001',
      'commerce001',
      p_operation,
      p_provider_code,
      'test',
      p_execution_scope_sha256,
      p_activation_evidence_sha256,
      p_adapter_version_sha256,
      repeat('f', 64),
      p_provider_account_sha256,
      p_point_of_sale_sha256,
      p_content_scope_sha256,
      repeat('1', 64),
      repeat('7', 64),
      p_request_sha256,
      repeat('6', 64),
      repeat('2', 64),
      clock_timestamp() + interval '4 minutes'
    )
$function$;

grant usage on schema flight_gate_harness to anon, authenticated, service_role;
grant execute on function flight_gate_harness.assert(boolean, text),
  flight_gate_harness.expect_error(text, text),
  flight_gate_harness.prepare_attempt(text, text, text, text, text, text, text, text, text)
  to anon, authenticated, service_role;

commit;

-- Catalog shape, defaults, forced RLS, and grants.
select flight_gate_harness.assert(
  to_regclass('public.flight_runtime_controls') is not null
    and to_regclass('public.flight_runtime_control_receipts') is not null
    and to_regclass('public.flight_provider_request_attempts') is not null,
  '068 and 069 relations must exist'
);

select flight_gate_harness.assert(
  (
    select c.relrowsecurity and c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'flight_provider_request_attempts'
  ),
  'request attempts must have enabled and forced RLS'
);

select flight_gate_harness.assert(
  has_table_privilege('service_role', 'public.flight_provider_request_attempts', 'SELECT')
    and not has_table_privilege('service_role', 'public.flight_provider_request_attempts', 'INSERT')
    and not has_table_privilege('service_role', 'public.flight_provider_request_attempts', 'UPDATE')
    and not has_table_privilege('service_role', 'public.flight_provider_request_attempts', 'DELETE')
    and not has_table_privilege('authenticated', 'public.flight_provider_request_attempts', 'SELECT')
    and not has_table_privilege('anon', 'public.flight_provider_request_attempts', 'SELECT'),
  'attempt table grants must be service-read-only'
);

select flight_gate_harness.assert(
  has_function_privilege(
    'service_role',
    'public.prepare_flight_provider_request_attempt(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.claim_flight_provider_request_attempt_for_dispatch(uuid,integer)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.complete_flight_provider_request_attempt(uuid,integer,text,smallint,text,bigint,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.prepare_flight_provider_request_attempt(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.claim_flight_provider_request_attempt_for_dispatch(uuid,integer)',
      'EXECUTE'
    ),
  'journal RPC grants must be service-role-only'
);

select flight_gate_harness.assert(
  (
    select pg_get_expr(d.adbin, d.adrelid) = '''prepared''::text'
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.flight_provider_request_attempts'::regclass
       and a.attname = 'state'
  )
    and (
      select pg_get_expr(d.adbin, d.adrelid) = '0'
        from pg_attribute a
        join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.flight_provider_request_attempts'::regclass
         and a.attname = 'revision'
    )
    and (
      select pg_get_expr(d.adbin, d.adrelid) = 'false'
        from pg_attribute a
        join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.flight_provider_request_attempts'::regclass
         and a.attname = 'retry_authorized'
    ),
  'journal defaults must be prepared revision zero and retry-disabled'
);

select flight_gate_harness.assert(
  (
    select execution_kill_switch_engaged
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
      and activation_evidence_sha256 is null
      and bound_environment is null
      and bound_execution_scope_sha256 is null
      from public.flight_runtime_controls
     where control_key = 'global'
  ),
  'runtime control must start fully default-off'
);

-- Even a correctly shaped service session cannot prepare while default-off.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt('create_offer_request', repeat('0', 64))$$,
  'Flight provider traffic is blocked by the runtime kill switch'
);
reset role;

-- Activate only authenticated test-mode shopping in this exact disposable DB.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.flight_runtime_controls
   set execution_kill_switch_engaged = false,
       provider_sandbox_traffic_enabled = true,
       shopping_enabled = true,
       bound_environment = 'test',
       bound_project_ref = 'flight_gate_local',
       bound_database_name = :'gate_database',
       bound_session_user = :'gate_admin_role',
       bound_provider_code = 'duffel',
       bound_provider_account_sha256 = repeat('d', 64),
       bound_point_of_sale = 'US',
       bound_content_scope_sha256 = repeat('e', 64),
       bound_adapter_version_sha256 = repeat('c', 64),
       bound_execution_scope_sha256 = repeat('b', 64),
       activation_evidence_sha256 = repeat('a', 64),
       updated_by = '00000000-0000-4000-8000-000000000001'
 where control_key = 'global';
commit;

select flight_gate_harness.assert(
  (
    select not execution_kill_switch_engaged
      and provider_sandbox_traffic_enabled
      and shopping_enabled
      and not provider_live_traffic_enabled
      and not order_enabled
      and not payment_enabled
      and not ticketing_enabled
      and not servicing_enabled
      and not provider_events_enabled
      and not production_release_enabled
      from public.flight_runtime_controls
     where control_key = 'global'
  )
    and (select count(*) = 1 from public.flight_runtime_control_receipts),
  'authenticated activation must enable sandbox shopping only and mint one receipt'
);

-- Establish the exact service session bound by migration 068 and opaque 069 receipts.
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('app.flight_execution_authorized', 'true', false);
select set_config('app.flight_environment', 'test', false);
select set_config('app.flight_project_ref', 'flight_gate_local', false);
select set_config('app.flight_activation_evidence_sha256', repeat('a', 64), false);
select set_config('app.flight_adapter_source_sha256', repeat('f', 64), false);
select set_config('app.flight_provider_binding_receipt_sha256', repeat('1', 64), false);
select set_config('app.flight_request_authority_receipt_sha256', repeat('2', 64), false);
set role service_role;

select flight_gate_harness.assert(
  public.flight_runtime_capability_enabled(
    'test', 'shopping', 'duffel', null, repeat('b', 64)
  ),
  'exact sandbox-shopping capability must be enabled'
);
select flight_gate_harness.assert(
  not public.flight_runtime_capability_enabled(
    'test', 'order', 'duffel', null, repeat('b', 64)
  )
    and not public.flight_runtime_capability_enabled(
      'live', 'shopping', 'duffel', null, repeat('b', 64)
    ),
  'order and live capabilities must remain disabled'
);

-- Explicit operation and binding refusals must happen before any row is created.
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt('create_order', repeat('0', 64))$$,
  'Flight create_order HTTP dispatch requires a later durable authority migration'
);
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt(
      'create_offer_request', repeat('0', 64), repeat('a', 64), repeat('0', 64)
    )$$,
  'Flight provider runtime capability is disabled'
);
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt(
      'create_offer_request', repeat('0', 64), repeat('a', 64), repeat('b', 64), 'other'
    )$$,
  'Flight provider runtime capability is disabled'
);
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt(
      'create_offer_request', repeat('0', 64), repeat('0', 64)
    )$$,
  'Flight provider request binding does not match the locked runtime control'
);
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt(
      'create_offer_request', repeat('0', 64), repeat('a', 64), repeat('b', 64),
      'duffel', repeat('c', 64), repeat('d', 64), repeat('0', 64)
    )$$,
  'Flight provider request binding does not match the locked runtime control'
);
select set_config('app.flight_provider_binding_receipt_sha256', repeat('0', 64), false);
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt('create_offer_request', repeat('0', 64))$$,
  'Flight provider opaque receipt digests are not exactly session-bound'
);
select set_config('app.flight_provider_binding_receipt_sha256', repeat('1', 64), false);
select flight_gate_harness.assert(
  (select count(*) = 0 from public.flight_provider_request_attempts),
  'refused preparations must leave no attempt rows'
);

-- Successful lifecycle.
select flight_gate_harness.prepare_attempt(
  'create_offer_request', repeat('3', 64)
) as success_id \gset
select attempt_revision as success_claim_revision, attempt_state as success_claim_state
  from public.claim_flight_provider_request_attempt_for_dispatch(:'success_id', 0) \gset
select flight_gate_harness.assert(
  :'success_claim_revision' = '1' and :'success_claim_state' = 'dispatching',
  'successful attempt must claim revision one'
);
select attempt_revision as success_terminal_revision, attempt_state as success_terminal_state
  from public.complete_flight_provider_request_attempt(
    :'success_id', 1, 'succeeded', 200::smallint, repeat('4', 64), 128, repeat('9', 64)
  ) \gset
select flight_gate_harness.assert(
  :'success_terminal_revision' = '2' and :'success_terminal_state' = 'succeeded',
  'successful attempt must terminate at revision two'
);

-- Known provider failure lifecycle.
select flight_gate_harness.prepare_attempt(
  'retrieve_offer', repeat('4', 64)
) as failure_id \gset
select attempt_state
  from public.claim_flight_provider_request_attempt_for_dispatch(:'failure_id', 0);
select attempt_state
  from public.complete_flight_provider_request_attempt(
    :'failure_id', 1, 'failed', 422::smallint, repeat('5', 64), 96, repeat('9', 64)
  );

-- Dispatched uncertainty may not be mislabeled blocked or failed-without-response.
select flight_gate_harness.prepare_attempt(
  'list_orders_by_offer', repeat('5', 64)
) as ambiguous_id \gset
select attempt_state
  from public.claim_flight_provider_request_attempt_for_dispatch(:'ambiguous_id', 0);
select flight_gate_harness.expect_error(
  format(
    'select * from public.complete_flight_provider_request_attempt(%L, 1, %L, null, null, null, %L)',
    :'ambiguous_id', 'blocked', repeat('9', 64)
  ),
  'Dispatching attempt requires an exact terminal outcome'
);
select flight_gate_harness.expect_error(
  format(
    'select * from public.complete_flight_provider_request_attempt(%L, 1, %L, null, null, null, %L)',
    :'ambiguous_id', 'failed', repeat('9', 64)
  ),
  'Dispatched uncertainty must be recorded as ambiguous'
);
select attempt_state
  from public.complete_flight_provider_request_attempt(
    :'ambiguous_id', 1, 'ambiguous', null, null, null, repeat('9', 64)
  );

-- A never-dispatched attempt may be blocked and can never subsequently claim.
select flight_gate_harness.prepare_attempt(
  'create_offer_request', repeat('6', 64)
) as blocked_id \gset
select attempt_state
  from public.complete_flight_provider_request_attempt(
    :'blocked_id', 0, 'blocked', null, null, null, repeat('9', 64)
  );
select flight_gate_harness.expect_error(
  format(
    'select * from public.claim_flight_provider_request_attempt_for_dispatch(%L, 0)',
    :'blocked_id'
  ),
  'Flight provider request dispatch CAS failed'
);

-- Exact duplicate, stale CAS, and terminal immutability refusals.
select flight_gate_harness.expect_error(
  $$select flight_gate_harness.prepare_attempt('create_offer_request', repeat('3', 64))$$,
  'Flight provider request identity already has an attempt; retry is not authorized'
);
select flight_gate_harness.expect_error(
  format(
    'select * from public.complete_flight_provider_request_attempt(%L, 1, %L, 200::smallint, %L, 128, %L)',
    :'success_id', 'succeeded', repeat('4', 64), repeat('9', 64)
  ),
  'Flight provider request completion CAS failed'
);

-- Service role can read but cannot mutate the table directly.
select flight_gate_harness.expect_error(
  format(
    'update public.flight_provider_request_attempts set retry_authorized = true where id = %L',
    :'success_id'
  ),
  'permission denied for table flight_provider_request_attempts'
);
reset role;

-- Owner-level direct mutation still fails the evidence trigger.
select flight_gate_harness.expect_error(
  format(
    'update public.flight_provider_request_attempts set commerce_id = %L where id = %L',
    'commerce999', :'success_id'
  ),
  'Flight provider request-attempt identity is immutable'
);
select flight_gate_harness.expect_error(
  format('delete from public.flight_provider_request_attempts where id = %L', :'success_id'),
  'Flight provider request-attempt evidence is append-preserving'
);

-- An ordinary authenticated role has neither RLS-visible nor table-granted access.
set role authenticated;
select flight_gate_harness.expect_error(
  'select count(*) from public.flight_provider_request_attempts',
  'permission denied for table flight_provider_request_attempts'
);
reset role;

-- Prepare the fifth row for the runner's real two-session CAS race.
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('app.flight_execution_authorized', 'true', false);
select set_config('app.flight_environment', 'test', false);
select set_config('app.flight_project_ref', 'flight_gate_local', false);
select set_config('app.flight_activation_evidence_sha256', repeat('a', 64), false);
select set_config('app.flight_adapter_source_sha256', repeat('f', 64), false);
select set_config('app.flight_provider_binding_receipt_sha256', repeat('1', 64), false);
select set_config('app.flight_request_authority_receipt_sha256', repeat('2', 64), false);
set role service_role;
select flight_gate_harness.prepare_attempt(
  'retrieve_offer', repeat('8', 64)
) as concurrency_id \gset
reset role;

select flight_gate_harness.assert(
  (select count(*) = 5 from public.flight_provider_request_attempts)
    and (
      select state = 'prepared' and revision = 0 and retry_authorized = false
        from public.flight_provider_request_attempts
       where id = :'concurrency_id'
    ),
  'concurrency fixture must be the only remaining prepared attempt'
);

\echo FLIGHT_GATE_RUNTIME_SQL_PASS
