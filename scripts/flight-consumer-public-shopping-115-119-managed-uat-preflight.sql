-- Read-only managed Supabase preflight for exact Flight Gates 115-119.
--
-- The guarded runner or SQL Editor renderer must set both target GUCs in the
-- same session. This base file is intentionally not self-targeting and fails
-- closed if copied or run without the reviewed prefix.
--
-- Sole approved target:
--   isolated_uat  bzxqbvmrkmjyvudlspss
--
-- This diagnostic performs no writes, provider calls, Stripe calls, migration
-- ledger mutation, deployment, route release, or Production access.

begin read only;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $flight_public_shopping_115_119_preflight$
declare
  v_target_kind text := current_setting(
    'app.flight_managed_115_119_target_kind', true
  );
  v_project_ref text := current_setting(
    'app.flight_managed_115_119_project_ref', true
  );
  v_relation text;
  v_count bigint;
begin
  if row(v_target_kind, v_project_ref) is distinct from row(
    'isolated_uat'::text,
    'bzxqbvmrkmjyvudlspss'::text
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: target binding is absent or invalid';
  end if;

  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: database/user identity changed';
  end if;
  if current_setting('server_version_num')::integer < 170000
    or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: PostgreSQL major must be 17';
  end if;

  if (
    select count(*)
      from pg_roles
     where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4
    or not pg_has_role(current_user, 'service_role', 'SET') then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: Supabase role contract is unavailable';
  end if;
  if to_regprocedure('auth.role()') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: auth/crypto prerequisites are absent';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: migration ledger is unavailable for read-only observation';
  end if;

  -- The isolated branch was previously accepted through Gate 114. Require its
  -- exact terminal RPC plus every persistent transaction/evidence relation
  -- needed by Gates 115-119, and require the branch to remain data-less.
  if to_regprocedure(
    'public.complete_flight_consumer_live_stripe_capture_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,text)'
  ) is null
    or to_regprocedure(
      'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_shopping_attempt_v1(uuid,integer,text,integer,text,integer,integer)'
    ) is null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: accepted predecessor through Gate 114 is incomplete';
  end if;

  foreach v_relation in array array[
    'flight_consumer_live_duffel_shopping_attempts',
    'flight_consumer_live_stripe_payment_intent_plans',
    'flight_consumer_live_duffel_offer_sources',
    'flight_consumer_live_duffel_offer_refresh_attempts',
    'flight_consumer_live_stripe_payment_executions',
    'flight_consumer_live_stripe_payment_execution_receipts',
    'flight_consumer_live_checkout_evidence_aggregates',
    'flight_consumer_live_checkout_evidence_receipts',
    'flight_consumer_live_duffel_order_executions',
    'flight_consumer_live_duffel_order_execution_receipts',
    'flight_consumer_live_stripe_confirmation_attempts',
    'flight_consumer_live_stripe_confirmation_receipts',
    'flight_consumer_live_checkout_authorization_bridges',
    'flight_consumer_live_stripe_capture_attempts',
    'flight_consumer_live_stripe_capture_receipts',
    'flight_consumer_live_booking_settlements',
    'flight_consumer_live_booking_settlement_receipts'
  ] loop
    if to_regclass(format('public.%I', v_relation)) is null then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: predecessor relation % is absent',
        v_relation;
    end if;
    execute format('select count(*) from public.%I', v_relation) into v_count;
    if v_count <> 0 then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: predecessor relation % is not empty',
        v_relation;
    end if;
  end loop;

  if to_regclass('public.profiles') is null
    or (
      select not relation.relrowsecurity or not relation.relforcerowsecurity
        from pg_class as relation
       where relation.oid = 'public.profiles'::regclass
    )
    or has_table_privilege('anon', 'public.profiles', 'SELECT')
    or has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    or has_table_privilege('service_role', 'public.profiles', 'SELECT') then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: UAT-only profiles prerequisite changed';
  end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 0 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: UAT-only profiles is not empty';
  end if;

  -- All newly introduced relations/indexes must be absent. Gate 118's
  -- record-sources RPC is intentionally excluded because it replaces the
  -- predecessor Gate 105 function in place.
  if exists (
    select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname = any(array[
         'flight_consumer_live_public_shopping_admissions',
         'flight_consumer_live_public_shopping_subject_budget_idx',
         'flight_consumer_live_public_shopping_cohort_budget_idx',
         'flight_consumer_live_public_shopping_global_budget_idx',
         'flight_consumer_live_public_offer_projection_batches',
         'flight_consumer_live_public_offer_projection_dispositions',
         'flight_consumer_live_public_offer_projections',
         'flight_consumer_live_public_offer_projection_expiry_idx',
         'flight_consumer_live_public_offer_segments',
         'flight_consumer_live_public_offer_reference_vaults',
         'flight_consumer_live_public_offer_reference_purge_receipts',
         'flight_consumer_live_duffel_offer_source_batches',
         'flight_consumer_live_public_shopping_dispatches'
       ])
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: a Gate 115-119 target relation/index already exists';
  end if;

  if exists (
    select 1
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname = any(array[
         'refuse_flight_consumer_live_public_shopping_admission_mutation_v1',
         'reserve_flight_consumer_live_public_shopping_admission_v1',
         'canonical_flight_consumer_public_offer_json_v1',
         'refuse_flight_consumer_live_public_offer_projection_mutation_v1',
         'get_flight_consumer_live_public_offer_projection_batch_v1',
         'complete_flight_consumer_live_public_offer_projection_batch_v1',
         'list_flight_consumer_live_duffel_pending_offer_sources_v1',
         'read_flight_consumer_live_public_offer_projection_batch_v1',
         'purge_flight_consumer_live_expired_offer_references_v1',
         'refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1',
         'guard_flight_consumer_live_duffel_shopping_success_sources_v1',
         'refuse_flight_consumer_live_public_shopping_dispatch_mutation_v1',
         'claim_flight_consumer_live_public_shopping_dispatch_v1'
       ])
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: a Gate 115-119 target function already exists';
  end if;

  if exists (
    select 1
      from supabase_migrations.schema_migrations
     where version::text = any(array[
       '202608260115', '202608260116', '202608260117',
       '202608260118', '202608260119'
     ])
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_PREFLIGHT_FAILED: ledger contains a Gate 115-119 version';
  end if;
end;
$flight_public_shopping_115_119_preflight$;

select jsonb_build_object(
  'gate', 'flight_consumer_public_shopping_115_119_managed_uat_preflight',
  'result', 'PASS',
  'target_kind', current_setting('app.flight_managed_115_119_target_kind'),
  'project_ref', current_setting('app.flight_managed_115_119_project_ref'),
  'database', current_database(),
  'current_user', current_user,
  'server_version_num', current_setting('server_version_num')::integer,
  'accepted_predecessor_tip', '202608260114',
  'apply_range', '202608260115-202608260119',
  'canonical_repository_tip', '202608260140',
  'target_objects_absent', true,
  'predecessor_rows', 0,
  'provider_requests', 0,
  'stripe_requests', 0,
  'orders', 0,
  'charges', 0,
  'tickets', 0,
  'ledger_version_count', (select count(*) from supabase_migrations.schema_migrations),
  'ledger_versions_sha256', encode(extensions.digest(convert_to(coalesce((
    select string_agg(version::text, ',' order by version::text)
      from supabase_migrations.schema_migrations
  ), ''), 'UTF8'), 'sha256'), 'hex'),
  'gate_115_119_ledger_entries', 0,
  'writes_performed', false,
  'production_accessed', false
) as flight_public_shopping_115_119_managed_uat_preflight_receipt;

commit;
