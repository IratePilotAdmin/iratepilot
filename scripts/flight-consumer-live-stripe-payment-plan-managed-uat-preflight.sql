-- Flight Consumer managed-UAT preflight for migration 202608260103.
-- Approved target only:
--   project: iratepilot-flight-payment-uat-20260827
--   ref:     exipwtvyjaihsvdhsbbt
-- This script is read-only. It does not install objects, write a migration
-- ledger, call Stripe or Duffel, or authorize booking, payment, or release.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $flight_stripe_managed_uat_preflight$
declare
  v_server_version_num integer :=
    current_setting('server_version_num')::integer;
  v_ledger_contains_103 boolean := false;
begin
  if current_database() <> 'postgres' then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: current database must be postgres';
  end if;

  if current_user <> 'postgres' then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: current user must be postgres';
  end if;

  if v_server_version_num < 170000 or v_server_version_num >= 180000 then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: PostgreSQL major version must be 17';
  end if;

  if not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: postgres lacks CREATE on public';
  end if;

  if (
    select count(*)
      from pg_roles
     where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: required Supabase roles are missing';
  end if;

  if not exists (
    select 1
      from pg_roles
     where rolname = 'postgres'
       and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: postgres cannot bypass forced RLS';
  end if;

  if not exists (
    select 1
      from pg_roles
     where rolname = 'service_role'
       and rolbypassrls
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: service_role lacks BYPASSRLS';
  end if;

  if not pg_has_role(current_user, 'service_role', 'SET') then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: postgres cannot SET ROLE service_role';
  end if;

  if to_regprocedure('auth.role()') is null
    or (
      select pg_get_function_result(routine.oid) <> 'text'
        from pg_proc as routine
       where routine.oid = 'auth.role()'::regprocedure
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: auth.role() text contract is missing';
  end if;

  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: gen_random_uuid() is missing';
  end if;

  if exists (
    select 1
      from pg_class as relation
      join pg_namespace as namespace
        on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and (
         relation.relname like
           'flight_consumer_live_stripe_payment_intent_plan%'
         or relation.relname =
           'flight_consumer_live_stripe_payment_intent_plans_recorded_idx'
       )
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: target relation or index collides';
  end if;

  if exists (
    select 1
      from pg_type as type_row
      join pg_namespace as namespace
        on namespace.oid = type_row.typnamespace
     where namespace.nspname = 'public'
       and type_row.typname in (
         'flight_consumer_live_stripe_payment_intent_plans',
         '_flight_consumer_live_stripe_payment_intent_plans'
       )
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: target type collides';
  end if;

  if exists (
    select 1
      from pg_proc as routine
      join pg_namespace as namespace
        on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname like
         'record_flight_consumer_live_stripe_payment_intent_plan%'
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: target recorder collides';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $ledger$
      select exists (
        select 1
          from supabase_migrations.schema_migrations
         where version::text = '202608260103'
      )
    $ledger$
    into v_ledger_contains_103;
  end if;

  if v_ledger_contains_103 then
    raise exception
      'FLIGHT_STRIPE_UAT_PREFLIGHT_FAILED: migration ledger already contains 103';
  end if;
end;
$flight_stripe_managed_uat_preflight$;

select jsonb_build_object(
  'gate', 'flight_consumer_stripe_payment_plan_managed_uat_preflight',
  'result', 'PASS',
  'project_ref', 'exipwtvyjaihsvdhsbbt',
  'database', current_database(),
  'current_user', current_user,
  'server_version_num', current_setting('server_version_num')::integer,
  'target_objects_absent', true,
  'migration_103_ledger_entry_absent', true,
  'writes_performed', false
) as flight_stripe_managed_uat_preflight_receipt;

commit;
