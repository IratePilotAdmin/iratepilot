-- Managed Supabase preflight for the exact migration 202608260104 bytes.
--
-- This file is intentionally not self-targeting. The guarded Node runner or
-- SQL Editor renderer sets
-- both app.flight_managed_104_target_kind and
-- app.flight_managed_104_project_ref in the same managed psql session after it
-- has bound the intended managed target. Running this base SQL without that
-- reviewed target-binding prefix fails closed.
--
-- Approved targets:
--   isolated_uat    exipwtvyjaihsvdhsbbt
--   preview_runtime eiqmdldjnedqgbtoozqa
--
-- This transaction is read-only. It does not create objects, apply migration
-- 104, write a migration ledger, create synthetic rows, or call any provider.

begin read only;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $flight_stripe_test_104_managed_preflight$
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
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: runner target binding is absent or invalid';
  end if;

  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: database/user identity changed';
  end if;

  if current_setting('server_version_num')::integer < 170000
    or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: PostgreSQL major must be 17';
  end if;

  if (
    select count(*)
      from pg_roles
     where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: required Supabase roles are missing';
  end if;

  if not exists (
    select 1
      from pg_roles
     where rolname = 'postgres'
       and (rolsuper or rolbypassrls)
  ) or not exists (
    select 1
      from pg_roles
     where rolname = 'service_role'
       and rolbypassrls
  ) or not pg_has_role(current_user, 'service_role', 'SET') then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: forced-RLS role contract is unavailable';
  end if;

  if to_regprocedure('auth.role()') is null
    or (
      select pg_get_function_result(routine.oid) <> 'text'
        from pg_proc as routine
       where routine.oid = 'auth.role()'::regprocedure
    ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: auth.role() text contract is missing';
  end if;

  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: gen_random_uuid() is missing';
  end if;

  if v_target_kind = 'isolated_uat' then
    if to_regclass(
      'public.flight_consumer_live_stripe_payment_intent_plans'
    ) is null then
      raise exception
        'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: isolated UAT predecessor 103 is absent';
    end if;
    if to_regclass('public.flight_runtime_controls') is not null then
      raise exception
        'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: isolated UAT contains Preview runtime controls';
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
        'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: locked Preview runtime predecessor is absent';
    end if;
  end if;

  if exists (
    select 1
      from pg_class as relation
      join pg_namespace as namespace
        on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname like 'flight_consumer_stripe_test_%'
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: target relation or index collides';
  end if;

  if exists (
    select 1
      from pg_type as type_row
      join pg_namespace as namespace
        on namespace.oid = type_row.typnamespace
     where namespace.nspname = 'public'
       and type_row.typname like 'flight_consumer_stripe_test_%'
  ) then
    raise exception
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: target type collides';
  end if;

  if exists (
    select 1
      from pg_proc as routine
      join pg_namespace as namespace
        on namespace.oid = routine.pronamespace
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
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: target function collides';
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
      'FLIGHT_STRIPE_TEST_104_PREFLIGHT_FAILED: migration ledger already contains 104';
  end if;
end;
$flight_stripe_test_104_managed_preflight$;

select jsonb_build_object(
  'gate', 'flight_consumer_stripe_test_journal_104_managed_preflight',
  'result', 'PASS',
  'target_kind', current_setting('app.flight_managed_104_target_kind'),
  'project_ref', current_setting('app.flight_managed_104_project_ref'),
  'database', current_database(),
  'current_user', current_user,
  'server_version_num', current_setting('server_version_num')::integer,
  'target_objects_absent', true,
  'migration_104_ledger_entry_absent', true,
  'writes_performed', false
) as flight_stripe_test_104_managed_preflight_receipt;

commit;
