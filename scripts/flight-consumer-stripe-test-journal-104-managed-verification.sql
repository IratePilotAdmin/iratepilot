-- Managed Supabase verification for migration 202608260104.
--
-- The guarded Node runner or SQL Editor renderer binds this session to one
-- approved managed target:
--   isolated_uat    exipwtvyjaihsvdhsbbt
--   preview_runtime eiqmdldjnedqgbtoozqa
-- Running this base SQL without the reviewed target-binding prefix fails
-- closed.
--
-- Synthetic digest-only rows are created only after an explicit savepoint and
-- rolled back to that savepoint before the transaction commits. No harness
-- schema, function, table, or other verification object is created. This file
-- never calls Stripe, Duffel, or another external transport and never writes a
-- migration-ledger entry.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $flight_stripe_test_104_managed_catalog$
declare
  v_target_kind text := current_setting(
    'app.flight_managed_104_target_kind', true
  );
  v_project_ref text := current_setting(
    'app.flight_managed_104_project_ref', true
  );
  v_ledger_contains_104 boolean := false;
begin
  if row(v_target_kind, v_project_ref) is distinct from row(
    'isolated_uat'::text,
    'exipwtvyjaihsvdhsbbt'::text
  ) and row(v_target_kind, v_project_ref) is distinct from row(
    'preview_runtime'::text,
    'eiqmdldjnedqgbtoozqa'::text
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: runner target binding is absent or invalid';
  end if;

  if current_database() <> 'postgres'
    or current_user <> 'postgres'
    or current_setting('server_version_num')::integer < 170000
    or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: database/user/PostgreSQL identity changed';
  end if;

  if v_target_kind = 'isolated_uat' then
    if to_regclass(
      'public.flight_consumer_live_stripe_payment_intent_plans'
    ) is null or to_regclass('public.flight_runtime_controls') is not null then
      raise exception
        'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: isolated UAT predecessor identity changed';
    end if;
  else
    if to_regclass('public.flight_runtime_controls') is null
      or not exists (
        select 1
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
           and not control.production_release_enabled
      ) then
      raise exception
        'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: locked Preview runtime predecessor changed';
    end if;
  end if;

  if not (
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
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: exact forced-RLS table set is invalid';
  end if;

  if exists (
    select 1
      from pg_attribute as attribute
      join pg_class as relation on relation.oid = attribute.attrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in (
         'flight_consumer_stripe_test_payment_attempts',
         'flight_consumer_stripe_test_webhook_events',
         'flight_consumer_stripe_test_payment_observations'
       )
       and attribute.attnum > 0
       and not attribute.attisdropped
       and format_type(attribute.atttypid, attribute.atttypmod)
         in ('json', 'jsonb', 'bytea')
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: raw-payload-capable column type is present';
  end if;

  if exists (
    select 1
      from pg_constraint as constraint_row
      join pg_class as relation on relation.oid = constraint_row.conrelid
     where relation.relname in (
       'flight_consumer_stripe_test_payment_attempts',
       'flight_consumer_stripe_test_webhook_events',
       'flight_consumer_stripe_test_payment_observations'
     )
       and (
         not constraint_row.convalidated
         or constraint_row.condeferrable
         or constraint_row.condeferred
       )
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: a constraint is not immediate/validated';
  end if;

  if not (
    select count(*) = 14
      and bool_and(index_row.indisvalid and index_row.indisready)
      from pg_index as index_row
      join pg_class as relation on relation.oid = index_row.indrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in (
         'flight_consumer_stripe_test_payment_attempts',
         'flight_consumer_stripe_test_webhook_events',
         'flight_consumer_stripe_test_payment_observations'
       )
  ) or to_regclass(
    'public.flight_consumer_stripe_test_attempts_pi_ref_uidx'
  ) is null or to_regclass(
    'public.flight_consumer_stripe_test_attempts_state_idx'
  ) is null or to_regclass(
    'public.flight_consumer_stripe_test_webhook_attempt_idx'
  ) is null or to_regclass(
    'public.flight_consumer_stripe_test_observations_attempt_idx'
  ) is null then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: exact valid/ready index contract is invalid';
  end if;

  if (
    select count(*)
      from pg_trigger as trigger_row
      join pg_class as relation on relation.oid = trigger_row.tgrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in (
         'flight_consumer_stripe_test_payment_attempts',
         'flight_consumer_stripe_test_webhook_events',
         'flight_consumer_stripe_test_payment_observations'
       )
       and not trigger_row.tgisinternal
       and trigger_row.tgname in (
         'flight_consumer_stripe_test_attempt_transition_guard',
         'flight_consumer_stripe_test_webhook_append_guard',
         'flight_consumer_stripe_test_observation_append_guard'
       )
  ) <> 3 or exists (
    select 1
      from pg_policy as policy
      join pg_class as relation on relation.oid = policy.polrelid
     where relation.relname in (
       'flight_consumer_stripe_test_payment_attempts',
       'flight_consumer_stripe_test_webhook_events',
       'flight_consumer_stripe_test_payment_observations'
     )
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: trigger/policy contract is invalid';
  end if;

  if not (
    select count(*) = 6
      and bool_and(routine.prosecdef)
      and bool_and(pg_get_userbyid(routine.proowner) = 'postgres')
      and bool_and(language.lanname = 'plpgsql')
      and bool_and('search_path=pg_catalog, public' = any(routine.proconfig))
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
      join pg_language as language on language.oid = routine.prolang
     where namespace.nspname = 'public'
       and routine.proname in (
         'protect_flight_consumer_stripe_test_payment_attempt_v1',
         'protect_flight_consumer_stripe_test_append_only_v1',
         'prepare_flight_consumer_stripe_test_payment_attempt_v1',
         'claim_flight_consumer_stripe_test_payment_attempt_v1',
         'record_flight_consumer_stripe_test_payment_observation_v1',
         'recover_flight_consumer_stripe_test_payment_attempt_v1'
       )
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: exact definer-function set is invalid';
  end if;

  if to_regprocedure(
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'
  ) is null or to_regprocedure(
    'public.claim_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,integer)'
  ) is null or to_regprocedure(
    'public.record_flight_consumer_stripe_test_payment_observation_v1(uuid,integer,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean)'
  ) is null or to_regprocedure(
    'public.recover_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,text,text,text)'
  ) is null then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: an exact RPC signature is absent';
  end if;

  if exists (
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
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: direct application table privilege exists';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.claim_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.record_flight_consumer_stripe_test_payment_observation_v1(uuid,integer,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.recover_flight_consumer_stripe_test_payment_attempt_v1(uuid,integer,text,text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.prepare_flight_consumer_stripe_test_payment_attempt_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: exact RPC ACL is invalid';
  end if;

  if (
    select count(*)
      from public.flight_consumer_stripe_test_payment_attempts
  ) <> 0 or (
    select count(*)
      from public.flight_consumer_stripe_test_webhook_events
  ) <> 0 or (
    select count(*)
      from public.flight_consumer_stripe_test_payment_observations
  ) <> 0 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: journal was not empty before synthetic verification';
  end if;

  if to_regnamespace('flight_stripe104_harness') is not null then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: disposable SQL harness is present';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $ledger$
      select exists (
        select 1
          from supabase_migrations.schema_migrations
         where version::text = '202608260104'
      )
    $ledger$
    into v_ledger_contains_104;
  end if;
  if v_ledger_contains_104 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: migration 104 was unexpectedly ledgered';
  end if;
end;
$flight_stripe_test_104_managed_catalog$;

savepoint flight_stripe_test_104_synthetic_rows;

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

do $flight_stripe_test_104_managed_synthetic$
declare
  v_created record;
  v_replay record;
  v_claimed record;
  v_observed record;
  v_direct_read_denied boolean := false;
  v_drift_refused boolean := false;
  v_malformed_refused boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: modern service-role claims are not honored';
  end if;

  begin
    execute
      'select count(*) from public.flight_consumer_stripe_test_payment_attempts';
  exception
    when insufficient_privilege then
      v_direct_read_denied := true;
  end;
  if not v_direct_read_denied then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: service_role direct table read was allowed';
  end if;

  select * into strict v_created
    from public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );
  select * into strict v_replay
    from public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );

  if v_created.decision <> 'created'
    or v_created.attempt_revision <> 0
    or v_created.attempt_state <> 'prepared'
    or v_replay.decision <> 'replay'
    or v_replay.attempt_id <> v_created.attempt_id then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: prepare/replay contract changed';
  end if;

  begin
    perform public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('f', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );
  exception
    when others then
      if position('attempt idempotency collision' in sqlerrm) > 0 then
        v_drift_refused := true;
      else
        raise;
      end if;
  end;
  if not v_drift_refused then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: one-field drift was accepted';
  end if;

  begin
    perform public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
      'bad', repeat('2', 64), repeat('3', 64), repeat('4', 64),
      repeat('5', 64), repeat('6', 64), repeat('7', 64),
      repeat('8', 64), repeat('9', 64), repeat('a', 64),
      repeat('b', 64), 25000
    );
  exception
    when others then
      if position('attempt evidence is invalid' in sqlerrm) > 0 then
        v_malformed_refused := true;
      else
        raise;
      end if;
  end;
  if not v_malformed_refused then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: malformed evidence was accepted';
  end if;

  select * into strict v_claimed
    from public.claim_flight_consumer_stripe_test_payment_attempt_v1(
      v_created.attempt_id,
      0,
      repeat('1', 64),
      repeat('c', 64),
      120
    );
  if v_claimed.attempt_revision <> 1
    or v_claimed.attempt_state <> 'claimed'
    or v_claimed.lease_expires_at is null then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: exact lease claim contract changed';
  end if;

  select * into strict v_observed
    from public.record_flight_consumer_stripe_test_payment_observation_v1(
      v_created.attempt_id, 1, repeat('1', 64), repeat('c', 64),
      'stripe_retrieve', null, null, null, null, null, null,
      repeat('d', 64), repeat('e', 64), repeat('f', 64),
      'requires_capture', 'requires_capture', 'not_requested',
      25000, 0, 0, false
    );
  if v_observed.decision <> 'recorded'
    or v_observed.attempt_revision <> 2
    or v_observed.attempt_state <> 'observed'
    or v_observed.observation_state <> 'requires_capture'
    or v_observed.capture_state <> 'requires_capture'
    or v_observed.refund_state <> 'not_requested'
    or v_observed.payment_intent_reference_sha256 <> repeat('d', 64) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: bounded observation contract changed';
  end if;
end;
$flight_stripe_test_104_managed_synthetic$;

reset role;

do $flight_stripe_test_104_managed_synthetic_receipt$
begin
  if (
    select count(*)
      from public.flight_consumer_stripe_test_payment_attempts
  ) <> 1 or (
    select count(*)
      from public.flight_consumer_stripe_test_webhook_events
  ) <> 0 or (
    select count(*)
      from public.flight_consumer_stripe_test_payment_observations
  ) <> 1 or not exists (
    select 1
      from public.flight_consumer_stripe_test_payment_attempts
     where processor_environment = 'stripe_test'
       and not livemode
       and capture_method = 'manual'
       and provider_request_count = 0
       and provider_mutation_count = 0
       and payment_intent_create_count = 0
       and capture_request_count = 0
       and refund_request_count = 0
       and not external_request_made
       and not raw_payment_method_accepted
       and not client_secret_exposed
       and not payment_authorized
       and not capture_authorized
       and not refund_authorized
       and not order_authorized
       and not ticketing_authorized
       and not consumer_release_enabled
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: synthetic zero-authority posture changed';
  end if;
end;
$flight_stripe_test_104_managed_synthetic_receipt$;

rollback to savepoint flight_stripe_test_104_synthetic_rows;
release savepoint flight_stripe_test_104_synthetic_rows;

do $flight_stripe_test_104_managed_zero_residue$
begin
  if (
    select count(*)
      from public.flight_consumer_stripe_test_payment_attempts
  ) <> 0 or (
    select count(*)
      from public.flight_consumer_stripe_test_webhook_events
  ) <> 0 or (
    select count(*)
      from public.flight_consumer_stripe_test_payment_observations
  ) <> 0 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: synthetic rows survived savepoint rollback';
  end if;

  if to_regnamespace('flight_stripe104_harness') is not null
    or exists (
      select 1
        from pg_namespace as namespace
       where namespace.nspname like 'flight_stripe104%harness%'
    ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_VERIFY_FAILED: verification harness object survived';
  end if;
end;
$flight_stripe_test_104_managed_zero_residue$;

select jsonb_build_object(
  'gate', 'flight_consumer_stripe_test_journal_104_managed_verification',
  'result', 'PASS',
  'target_kind', current_setting('app.flight_managed_104_target_kind'),
  'project_ref', current_setting('app.flight_managed_104_project_ref'),
  'catalog_contract', 'passed',
  'forced_rls_and_acl', 'passed',
  'modern_claims_service_role', 'passed',
  'created_then_replayed', true,
  'drift_refused', true,
  'malformed_refused', true,
  'bounded_lease_and_observation', true,
  'synthetic_rows_after_savepoint_rollback', 0,
  'verification_harness_objects', 0,
  'provider_requests', 0,
  'stripe_requests', 0,
  'charges', 0,
  'orders', 0,
  'tickets', 0,
  'migration_104_ledger_entry_present', false
) as flight_stripe_test_104_managed_verification_receipt;

commit;
