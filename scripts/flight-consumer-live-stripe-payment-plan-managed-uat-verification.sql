-- Flight Consumer managed-UAT verification for migration 202608260103.
-- Approved target only:
--   project: iratepilot-flight-payment-uat-20260827
--   ref:     exipwtvyjaihsvdhsbbt
-- Run only after the exact reviewed migration bytes with SHA-256
-- c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd.
-- The synthetic digest-only smoke rows are enclosed in BEGIN/ROLLBACK.
-- This script does not call Stripe or Duffel, move money, create an order,
-- issue a ticket, or authorize consumer release.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $flight_stripe_managed_uat_catalog$
declare
  v_ledger_contains_103 boolean := false;
begin
  if current_database() <> 'postgres'
    or current_user <> 'postgres'
    or current_setting('server_version_num')::integer < 170000
    or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: target identity or PostgreSQL major changed';
  end if;

  if to_regclass(
    'public.flight_consumer_live_stripe_payment_intent_plans'
  ) is null
    or not (
      select relation.relkind = 'r'
        and pg_get_userbyid(relation.relowner) = 'postgres'
        from pg_class as relation
       where relation.oid =
         'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: journal table identity is invalid';
  end if;

  if not (
    select count(*) = 36
      and count(*) filter (
        where format_type(attribute.atttypid, attribute.atttypmod)
          in ('json', 'jsonb', 'bytea')
      ) = 0
      from pg_attribute as attribute
     where attribute.attrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and attribute.attnum > 0
       and not attribute.attisdropped
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: digest-only 36-column shape changed';
  end if;

  if exists (
    select 1
      from pg_constraint as constraint_row
     where constraint_row.conrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and (
         not constraint_row.convalidated
         or constraint_row.condeferrable
         or constraint_row.condeferred
       )
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: a constraint is not immediate/validated';
  end if;

  if not (
    with journal_indexes as (
      select index_row.indisprimary,
             index_row.indisunique,
             index_row.indisvalid,
             index_row.indisready,
             pg_get_indexdef(index_row.indexrelid) as definition,
             array(
               select attribute.attname::text
                 from unnest(index_row.indkey) with ordinality
                   as key_column(attnum, position)
                 join pg_attribute as attribute
                   on attribute.attrelid = index_row.indrelid
                  and attribute.attnum = key_column.attnum
                order by key_column.position
             ) as columns
        from pg_index as index_row
       where index_row.indrelid =
         'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
    )
    select count(*) = 5
      and bool_and(indisvalid and indisready)
      and count(*) filter (
        where indisprimary and columns = array['id']::text[]
      ) = 1
      and count(*) filter (
        where indisunique and not indisprimary
          and columns = array['plan_sha256']::text[]
      ) = 1
      and count(*) filter (
        where indisunique
          and columns = array[
            'execution_scope_sha256', 'idempotency_key_sha256'
          ]::text[]
      ) = 1
      and count(*) filter (
        where indisunique
          and columns = array[
            'execution_scope_sha256',
            'payment_attempt_reference_sha256'
          ]::text[]
      ) = 1
      and count(*) filter (
        where not indisunique
          and columns = array['recorded_at']::text[]
          and definition like '%recorded_at DESC%'
      ) = 1
      from journal_indexes
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: exact five-index contract changed';
  end if;

  if not (
    select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_class as relation
     where relation.oid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: forced RLS is not active';
  end if;

  if exists (
    select 1
      from pg_policy
     where polrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
  )
    or exists (
      select 1
        from pg_trigger
       where tgrelid =
         'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
         and not tgisinternal
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: policy or user trigger is present';
  end if;

  if exists (
    select 1
      from unnest(
        array['anon', 'authenticated', 'service_role']
      ) as role_name
      cross join unnest(array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER'
      ]) as privilege_name
     where has_table_privilege(
       role_name,
       'public.flight_consumer_live_stripe_payment_intent_plans',
       privilege_name
     )
  )
    or exists (
      select 1
        from pg_class as relation
        cross join lateral aclexplode(
          coalesce(relation.relacl, acldefault('r', relation.relowner))
        ) as acl_row
       where relation.oid =
         'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
         and acl_row.grantee <> relation.relowner
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: direct table privilege is present';
  end if;

  if to_regprocedure(
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'
  ) is null
    or not (
      select routine.prosecdef
        and routine.proretset
        and pg_get_userbyid(routine.proowner) = 'postgres'
        and language.lanname = 'plpgsql'
        and 'search_path=pg_catalog, public' = any(routine.proconfig)
        and pg_get_function_result(routine.oid) =
          'TABLE(decision text, plan_id uuid, recorded_plan_sha256 text, plan_mode text)'
        from pg_proc as routine
        join pg_language as language on language.oid = routine.prolang
       where routine.oid =
         'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'::regprocedure
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: recorder contract is invalid';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
    or has_function_privilege(
      'authenticated',
      'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
      'EXECUTE'
    )
    or exists (
      select 1
        from pg_proc as routine
        cross join lateral aclexplode(
          coalesce(routine.proacl, acldefault('f', routine.proowner))
        ) as acl_row
       where routine.oid =
         'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'::regprocedure
         and (
           acl_row.grantee not in (
             routine.proowner,
             (select oid from pg_roles where rolname = 'service_role')
           )
           or acl_row.privilege_type <> 'EXECUTE'
         )
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: recorder ACL is invalid';
  end if;

  if exists (
    select 1
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname like
         'record_flight_consumer_live_stripe_payment_intent_plan%'
       and routine.oid <>
         'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'::regprocedure
  )
    or exists (
      select 1
        from pg_proc as routine
        join pg_namespace as namespace on namespace.oid = routine.pronamespace
       where namespace.nspname = 'public'
         and routine.proname ~
           'flight_consumer_live_stripe.*(claim|dispatch|complete|capture|refund|confirm)'
    ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: shadow or mutation lifecycle RPC exists';
  end if;

  if (
    select count(*)
      from public.flight_consumer_live_stripe_payment_intent_plans
  ) <> 0 then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: journal was not empty before smoke';
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
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: migration 103 was unexpectedly ledgered';
  end if;
end;
$flight_stripe_managed_uat_catalog$;

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

do $flight_stripe_managed_uat_smoke$
declare
  v_created record;
  v_replay record;
  v_second record;
  v_direct_access_denied boolean := false;
  v_drift_refused boolean := false;
  v_malformed_refused boolean := false;
  v_ambiguity_refused boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: modern request.jwt.claims role is not honored';
  end if;

  begin
    execute
      'select count(*) from public.flight_consumer_live_stripe_payment_intent_plans';
  exception
    when insufficient_privilege then
      v_direct_access_denied := true;
  end;
  if not v_direct_access_denied then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: service_role direct table read was allowed';
  end if;

  select * into strict v_created
    from public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );
  select * into strict v_replay
    from public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );

  if v_created.decision <> 'created'
    or v_replay.decision <> 'replay'
    or v_created.plan_id <> v_replay.plan_id
    or v_created.recorded_plan_sha256 <> repeat('b', 64)
    or v_created.plan_mode <> 'zero_dispatch' then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: created/replay contract changed';
  end if;

  begin
    perform public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      repeat('1', 64), repeat('c', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );
  exception
    when others then
      if position('payment plan idempotency collision' in sqlerrm) > 0 then
        v_drift_refused := true;
      else
        raise;
      end if;
  end;
  if not v_drift_refused then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: one-field drift was accepted';
  end if;

  begin
    perform public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      'bad', repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('b', 64), 25000
    );
  exception
    when others then
      if position('payment plan evidence is invalid' in sqlerrm) > 0 then
        v_malformed_refused := true;
      else
        raise;
      end if;
  end;
  if not v_malformed_refused then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: malformed evidence was accepted';
  end if;

  select * into strict v_second
    from public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      repeat('c', 64), repeat('d', 64), repeat('e', 64),
      repeat('f', 64), repeat('0', 64), repeat('1', 64),
      repeat('2', 64), repeat('3', 64), repeat('4', 64),
      repeat('5', 64), repeat('f', 64), 5100
    );
  if v_second.decision <> 'created' then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: second independent plan was not created';
  end if;

  begin
    perform public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      repeat('4', 64), repeat('0', 64), repeat('6', 64),
      repeat('7', 64), repeat('8', 64), repeat('9', 64),
      repeat('a', 64), repeat('f', 64), 25000
    );
  exception
    when others then
      if position('payment plan identity is ambiguous' in sqlerrm) > 0 then
        v_ambiguity_refused := true;
      else
        raise;
      end if;
  end;
  if not v_ambiguity_refused then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: ambiguous identity was accepted';
  end if;
end;
$flight_stripe_managed_uat_smoke$;

reset role;

do $flight_stripe_managed_uat_zero_dispatch$
begin
  if not (
    select count(*) = 2
      and bool_and(
        plan_mode = 'zero_dispatch'
        and processor_id = 'stripe_live'
        and currency = 'usd'
        and capture_method = 'manual'
        and confirmation_method = 'automatic'
        and payment_method_type = 'card'
        and provider_request_count = 0
        and stripe_request_count = 0
        and stripe_mutation_count = 0
        and payment_intent_count = 0
        and charge_count = 0
        and refund_count = 0
        and not external_request_made
        and not raw_payment_method_accepted
        and not client_secret_exposed
        and not payment_authorized
        and not capture_authorized
        and not refund_authorized
        and not order_authorized
        and not ticketing_authorized
        and not consumer_release_enabled
      )
      from public.flight_consumer_live_stripe_payment_intent_plans
  ) then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: zero-dispatch row posture changed';
  end if;
end;
$flight_stripe_managed_uat_zero_dispatch$;

rollback;

do $flight_stripe_managed_uat_rollback_receipt$
begin
  if (
    select count(*)
      from public.flight_consumer_live_stripe_payment_intent_plans
  ) <> 0 then
    raise exception
      'FLIGHT_STRIPE_UAT_VERIFY_FAILED: synthetic rows survived rollback';
  end if;
end;
$flight_stripe_managed_uat_rollback_receipt$;

select jsonb_build_object(
  'gate', 'flight_consumer_stripe_payment_plan_managed_uat_verification',
  'result', 'PASS',
  'project_ref', 'exipwtvyjaihsvdhsbbt',
  'catalog_contract', 'passed',
  'forced_rls_and_acl', 'passed',
  'modern_claims_service_role', 'passed',
  'created_then_replayed', true,
  'drift_refused', true,
  'malformed_refused', true,
  'identity_ambiguity_refused', true,
  'synthetic_rows_after_rollback', 0,
  'provider_requests', 0,
  'stripe_requests', 0,
  'charges', 0,
  'orders', 0,
  'tickets', 0,
  'migration_103_ledger_entry_present', false
) as flight_stripe_managed_uat_verification_receipt;
