\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create schema flight_stripe104_harness;

create function flight_stripe104_harness.assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'FLIGHT_STRIPE104_ASSERTION_FAILED: %', p_message;
  end if;
end;
$function$;

create function flight_stripe104_harness.expect_error(
  p_sql text,
  p_expected_message text
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_failed boolean := false;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    get stacked diagnostics v_message = message_text;
    if position(p_expected_message in v_message) = 0 then
      raise exception 'FLIGHT_STRIPE104_WRONG_ERROR: expected %, received %',
        p_expected_message, v_message;
    end if;
  end;
  if not v_failed then
    raise exception 'FLIGHT_STRIPE104_EXPECTED_ERROR_NOT_RAISED: %',
      p_expected_message;
  end if;
end;
$function$;

create function flight_stripe104_harness.prepare(
  p_execution_scope_sha256 text default repeat('1', 64),
  p_payment_binding_sha256 text default repeat('2', 64),
  p_order_reference_sha256 text default repeat('3', 64),
  p_customer_reference_sha256 text default repeat('4', 64),
  p_payment_attempt_reference_sha256 text default repeat('5', 64),
  p_workflow_sha256 text default repeat('6', 64),
  p_metadata_sha256 text default repeat('7', 64),
  p_request_body_sha256 text default repeat('8', 64),
  p_request_envelope_sha256 text default repeat('9', 64),
  p_idempotency_request_sha256 text default repeat('a', 64),
  p_idempotency_key_sha256 text default repeat('b', 64),
  p_amount_cents bigint default 25000
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text
)
language sql
volatile
set search_path = pg_catalog, public
as $function$
  select *
    from public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
      p_execution_scope_sha256, p_payment_binding_sha256,
      p_order_reference_sha256, p_customer_reference_sha256,
      p_payment_attempt_reference_sha256, p_workflow_sha256,
      p_metadata_sha256, p_request_body_sha256,
      p_request_envelope_sha256, p_idempotency_request_sha256,
      p_idempotency_key_sha256, p_amount_cents
    )
$function$;

grant usage on schema flight_stripe104_harness
  to anon, authenticated, service_role;
grant execute on all functions in schema flight_stripe104_harness
  to anon, authenticated, service_role;

commit;

-- Exact catalog, ownership, RLS, and ACL closure.
select flight_stripe104_harness.assert(
  (
    select count(*) = 3
      and bool_and(relation.relkind = 'r')
      and bool_and(relation.relrowsecurity)
      and bool_and(relation.relforcerowsecurity)
      and bool_and(pg_get_userbyid(relation.relowner) = 'postgres')
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in (
         'flight_consumer_stripe_test_payment_attempts',
         'flight_consumer_stripe_test_webhook_events',
         'flight_consumer_stripe_test_payment_observations'
       )
  ),
  'all three journal tables must be postgres-owned forced-RLS tables'
);

select flight_stripe104_harness.assert(
  (
    select count(*) = 6
      and bool_and(routine.prosecdef)
      and bool_and(pg_get_userbyid(routine.proowner) = 'postgres')
      and bool_and('search_path=pg_catalog, public' = any(routine.proconfig))
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname in (
         'protect_flight_consumer_stripe_test_payment_attempt_v1',
         'protect_flight_consumer_stripe_test_append_only_v1',
         'prepare_flight_consumer_stripe_test_payment_attempt_v1',
         'claim_flight_consumer_stripe_test_payment_attempt_v1',
         'record_flight_consumer_stripe_test_payment_observation_v1',
         'recover_flight_consumer_stripe_test_payment_attempt_v1'
       )
  ),
  'all six journal functions must retain the reviewed definer posture'
);

select flight_stripe104_harness.assert(
  not exists (
    select 1
      from unnest(array['anon', 'authenticated', 'service_role']) role_name
      cross join unnest(array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER'
      ]) privilege_name
      cross join unnest(array[
        'flight_consumer_stripe_test_payment_attempts',
        'flight_consumer_stripe_test_webhook_events',
        'flight_consumer_stripe_test_payment_observations'
      ]) table_name
     where has_table_privilege(
       role_name,
       format('public.%I', table_name),
       privilege_name
     )
  )
  and not exists (
    select 1
      from pg_policy as policy
      join pg_class as relation on relation.oid = policy.polrelid
     where relation.relname in (
       'flight_consumer_stripe_test_payment_attempts',
       'flight_consumer_stripe_test_webhook_events',
       'flight_consumer_stripe_test_payment_observations'
     )
  ),
  'journal tables must expose no direct application privileges or policies'
);

select flight_stripe104_harness.assert(
  has_function_privilege(
    'service_role',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.claim_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_flight_consumer_stripe_test_payment_observation_v1(uuid,integer,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.recover_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  ),
  'only service_role may execute the four journal RPCs'
);

select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select flight_stripe104_harness.expect_error(
  'select count(*) from public.flight_consumer_stripe_test_payment_attempts',
  'permission denied for table flight_consumer_stripe_test_payment_attempts'
);
select flight_stripe104_harness.expect_error(
  'insert into public.flight_consumer_stripe_test_payment_attempts default values',
  'permission denied for table flight_consumer_stripe_test_payment_attempts'
);

-- Create/replay and exact identity refusal.
select * from flight_stripe104_harness.prepare()
\gset base_
select * from flight_stripe104_harness.prepare()
\gset replay_
select flight_stripe104_harness.expect_error(
  $$select * from flight_stripe104_harness.prepare(
    p_metadata_sha256 => repeat('f', 64))$$,
  'attempt idempotency collision'
);
select flight_stripe104_harness.expect_error(
  $$select * from flight_stripe104_harness.prepare(
    p_amount_cents => 49)$$,
  'attempt evidence is invalid'
);

select attempt_id::text,
       attempt_revision,
       attempt_state,
       lease_expires_at::text
  from public.claim_flight_consumer_stripe_test_payment_attempt_v1(
    :'base_attempt_id'::uuid,
    0,
    repeat('1', 64),
    repeat('c', 64),
    120
  )
\gset claim_

select decision,
       attempt_id::text,
       attempt_revision,
       attempt_state,
       observation_state,
       capture_state,
       refund_state,
       payment_intent_reference_sha256
  from public.record_flight_consumer_stripe_test_payment_observation_v1(
    :'base_attempt_id'::uuid,
    1,
    repeat('1', 64),
    repeat('c', 64),
    'stripe_retrieve',
    null, null, null, null, null, null,
    repeat('d', 64),
    repeat('e', 64),
    repeat('f', 64),
    'requires_capture',
    'requires_capture',
    'not_requested',
    25000, 0, 0, false
  )
\gset retrieve_
reset role;

select flight_stripe104_harness.assert(
  :'base_decision' = 'created'
  and :'base_attempt_revision' = '0'
  and :'base_attempt_state' = 'prepared'
  and :'replay_decision' = 'replay'
  and :'replay_attempt_id' = :'base_attempt_id'
  and :'claim_attempt_revision' = '1'
  and :'claim_attempt_state' = 'claimed'
  and :'retrieve_decision' = 'recorded'
  and :'retrieve_attempt_revision' = '2'
  and :'retrieve_observation_state' = 'requires_capture'
  and :'retrieve_capture_state' = 'requires_capture'
  and :'retrieve_payment_intent_reference_sha256' = repeat('d', 64),
  'prepare, replay, claim, and leased retrieve observation must pass'
);

-- Capture and refund lifecycle observations are durable placeholders only.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select decision, attempt_revision, capture_state
  from public.record_flight_consumer_stripe_test_payment_observation_v1(
    :'base_attempt_id'::uuid,
    2,
    repeat('1', 64),
    null,
    'stripe_webhook',
    repeat('0', 64), repeat('1', 64), 'payment_intent.succeeded',
    repeat('2', 64), repeat('3', 64), repeat('4', 64),
    repeat('d', 64), repeat('6', 64), repeat('7', 64),
    'succeeded', 'captured', 'not_requested',
    0, 25000, 0, false
  )
\gset captured_
select decision, attempt_revision, refund_state
  from public.record_flight_consumer_stripe_test_payment_observation_v1(
    :'base_attempt_id'::uuid,
    3,
    repeat('1', 64),
    null,
    'stripe_webhook',
    repeat('8', 64), repeat('9', 64), 'charge.refunded',
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    repeat('d', 64), repeat('f', 64), repeat('0', 64),
    'succeeded', 'captured', 'succeeded',
    0, 25000, 5000, false
  )
\gset refunded_
reset role;

select flight_stripe104_harness.assert(
  :'captured_decision' = 'recorded'
  and :'captured_attempt_revision' = '3'
  and :'captured_capture_state' = 'captured'
  and :'refunded_decision' = 'recorded'
  and :'refunded_attempt_revision' = '4'
  and :'refunded_refund_state' = 'succeeded'
  and (
    select count(*) = 3
      and bool_and(not livemode)
      from public.flight_consumer_stripe_test_payment_observations
     where attempt_id = :'base_attempt_id'::uuid
  )
  and (
    select count(*) = 2
      and bool_and(not livemode)
      from public.flight_consumer_stripe_test_webhook_events
     where attempt_id = :'base_attempt_id'::uuid
  )
  and (
    select provider_request_count = 0
      and provider_mutation_count = 0
      and payment_intent_create_count = 0
      and capture_request_count = 0
      and refund_request_count = 0
      and not external_request_made
      and not payment_authorized
      and not capture_authorized
      and not refund_authorized
      and not order_authorized
      and not ticketing_authorized
      and not consumer_release_enabled
      from public.flight_consumer_stripe_test_payment_attempts
     where id = :'base_attempt_id'::uuid
  ),
  'capture/refund observations must persist without granting mutation authority'
);

-- A webhook can supersede an active worker by exact revision, without its lease.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select * from flight_stripe104_harness.prepare(
  repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
  repeat('6', 64), repeat('7', 64), repeat('8', 64), repeat('9', 64),
  repeat('a', 64), repeat('b', 64), repeat('c', 64), 26000
)
\gset async_
select *
  from public.claim_flight_consumer_stripe_test_payment_attempt_v1(
    :'async_attempt_id'::uuid, 0, repeat('2', 64), repeat('d', 64), 120
  );
select decision, attempt_revision
  from public.record_flight_consumer_stripe_test_payment_observation_v1(
    :'async_attempt_id'::uuid, 1, repeat('2', 64), null,
    'stripe_webhook',
    repeat('f', 64), repeat('0', 64),
    'payment_intent.amount_capturable_updated',
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    repeat('e', 64), repeat('4', 64), repeat('5', 64),
    'requires_capture', 'requires_capture', 'not_requested',
    26000, 0, 0, false
  )
\gset async_observed_
select decision, attempt_revision
  from public.record_flight_consumer_stripe_test_payment_observation_v1(
    :'async_attempt_id'::uuid, 1, repeat('2', 64), null,
    'stripe_webhook',
    repeat('f', 64), repeat('0', 64),
    'payment_intent.amount_capturable_updated',
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    repeat('e', 64), repeat('4', 64), repeat('5', 64),
    'requires_capture', 'requires_capture', 'not_requested',
    26000, 0, 0, false
  )
\gset async_replay_
select flight_stripe104_harness.expect_error(
  format(
    $$select * from public.record_flight_consumer_stripe_test_payment_observation_v1(
      %L::uuid, 2, repeat('2', 64), null,
      'stripe_webhook', repeat('f', 64), repeat('6', 64),
      'payment_intent.succeeded', repeat('7', 64), repeat('8', 64),
      repeat('9', 64), repeat('e', 64), repeat('a', 64), repeat('b', 64),
      'succeeded', 'captured', 'not_requested', 0, 26000, 0, false)$$,
    :'async_attempt_id'
  ),
  'webhook identity conflict'
);
reset role;

select flight_stripe104_harness.assert(
  :'async_observed_decision' = 'recorded'
  and :'async_observed_attempt_revision' = '2'
  and :'async_replay_decision' = 'replay'
  and :'async_replay_attempt_revision' = '2'
  and (
    select attempt_state = 'observed'
      and lease_token_sha256 is null
      and lease_expires_at is null
      and payment_intent_reference_sha256 = repeat('e', 64)
      from public.flight_consumer_stripe_test_payment_attempts
     where id = :'async_attempt_id'::uuid
  ),
  'an exact webhook must supersede a claim and replay without duplication'
);

-- Two expired leases exercise absence and ambiguous/provider-present recovery.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select * from flight_stripe104_harness.prepare(
  repeat('3', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
  repeat('7', 64), repeat('8', 64), repeat('9', 64), repeat('a', 64),
  repeat('b', 64), repeat('c', 64), repeat('d', 64), 27000
)
\gset absence_
select * from public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  :'absence_attempt_id'::uuid, 0, repeat('3', 64), repeat('e', 64), 15
);
select * from flight_stripe104_harness.prepare(
  repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
  repeat('8', 64), repeat('9', 64), repeat('a', 64), repeat('b', 64),
  repeat('c', 64), repeat('d', 64), repeat('e', 64), 28000
)
\gset present_
select * from public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  :'present_attempt_id'::uuid, 0, repeat('4', 64), repeat('f', 64), 15
);
select pg_sleep(15.1);
select decision, attempt_revision, attempt_state, recovery_state,
       blind_retry_authorized
  from public.recover_flight_consumer_stripe_test_payment_attempt_v1(
    :'absence_attempt_id'::uuid, 1, repeat('3', 64), repeat('e', 64),
    'provider_absence_attested', repeat('f', 64), null
  )
\gset absence_recovery_
select decision, attempt_revision, attempt_state, recovery_state,
       blind_retry_authorized
  from public.recover_flight_consumer_stripe_test_payment_attempt_v1(
    :'present_attempt_id'::uuid, 1, repeat('4', 64), repeat('f', 64),
    'provider_present', repeat('0', 64), repeat('f', 64)
  )
\gset present_recovery_
reset role;

select flight_stripe104_harness.assert(
  :'absence_recovery_decision' = 'retry_prepared'
  and :'absence_recovery_attempt_revision' = '2'
  and :'absence_recovery_attempt_state' = 'prepared'
  and :'absence_recovery_recovery_state' = 'provider_absence_attested'
  and :'absence_recovery_blind_retry_authorized' = 'f'
  and :'present_recovery_decision' = 'reconcile_required'
  and :'present_recovery_attempt_revision' = '2'
  and :'present_recovery_attempt_state' = 'reconcile_required'
  and :'present_recovery_recovery_state' = 'provider_present'
  and :'present_recovery_blind_retry_authorized' = 'f',
  'expired-lease recovery must remain evidence-bound and blind-retry false'
);

-- Append preservation and final row counts.
select flight_stripe104_harness.expect_error(
  format(
    'delete from public.flight_consumer_stripe_test_payment_attempts where id = %L::uuid',
    :'base_attempt_id'
  ),
  'attempt evidence is append-preserving'
);
select flight_stripe104_harness.expect_error(
  format(
    'delete from public.flight_consumer_stripe_test_webhook_events where attempt_id = %L::uuid',
    :'base_attempt_id'
  ),
  'evidence is append-only'
);

select flight_stripe104_harness.assert(
  (select count(*) = 4
     from public.flight_consumer_stripe_test_payment_attempts)
  and (select count(*) = 3
     from public.flight_consumer_stripe_test_webhook_events)
  and (select count(*) = 4
     from public.flight_consumer_stripe_test_payment_observations),
  'the runtime journal must retain exactly the expected durable evidence'
);

\echo FLIGHT_STRIPE104_POSTGRES_GATE_PASS
