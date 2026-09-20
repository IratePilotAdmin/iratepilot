\set ON_ERROR_STOP on

-- Disposable PostgreSQL acceptance only. This script records digest-only,
-- zero-dispatch plan evidence. It performs no HTTP, reads no credential, and
-- grants no payment, order, capture, refund, ticket, or release authority.
begin;

create schema flight_stripe_gate_harness;

create function flight_stripe_gate_harness.assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'FLIGHT_STRIPE_GATE_ASSERTION_FAILED: %', p_message;
  end if;
end;
$function$;

create function flight_stripe_gate_harness.expect_error(
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
      raise exception 'FLIGHT_STRIPE_GATE_WRONG_ERROR: expected %, received %',
        p_expected_message, v_message;
    end if;
  end;
  if not v_failed then
    raise exception 'FLIGHT_STRIPE_GATE_EXPECTED_ERROR_NOT_RAISED: %',
      p_expected_message;
  end if;
end;
$function$;

create function flight_stripe_gate_harness.record_plan(
  p_execution_scope_sha256 text default repeat('1', 64),
  p_payment_binding_sha256 text default repeat('2', 64),
  p_order_reference_sha256 text default repeat('3', 64),
  p_customer_reference_sha256 text default repeat('4', 64),
  p_payment_attempt_reference_sha256 text default repeat('5', 64),
  p_metadata_sha256 text default repeat('6', 64),
  p_request_body_sha256 text default repeat('7', 64),
  p_request_envelope_sha256 text default repeat('8', 64),
  p_idempotency_request_sha256 text default repeat('9', 64),
  p_idempotency_key_sha256 text default repeat('a', 64),
  p_plan_sha256 text default repeat('b', 64),
  p_amount_cents bigint default 25000
)
returns table (
  decision text,
  plan_id uuid,
  recorded_plan_sha256 text,
  plan_mode text
)
language sql
volatile
set search_path = pg_catalog, public
as $function$
  select *
    from public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
      p_execution_scope_sha256,
      p_payment_binding_sha256,
      p_order_reference_sha256,
      p_customer_reference_sha256,
      p_payment_attempt_reference_sha256,
      p_metadata_sha256,
      p_request_body_sha256,
      p_request_envelope_sha256,
      p_idempotency_request_sha256,
      p_idempotency_key_sha256,
      p_plan_sha256,
      p_amount_cents
    )
$function$;

grant usage on schema flight_stripe_gate_harness
  to anon, authenticated, service_role;
grant execute on function
  flight_stripe_gate_harness.assert(boolean, text),
  flight_stripe_gate_harness.expect_error(text, text),
  flight_stripe_gate_harness.record_plan(
    text, text, text, text, text, text,
    text, text, text, text, text, bigint
  )
to anon, authenticated, service_role;

commit;

-- Exact catalog shape and immutable index identities.
select flight_stripe_gate_harness.assert(
  to_regclass(
    'public.flight_consumer_live_stripe_payment_intent_plans'
  ) is not null
  and (
    select relation.relkind = 'r'
      and pg_get_userbyid(relation.relowner) = 'postgres'
      from pg_class as relation
     where relation.oid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
  ),
  'the plan journal must be one postgres-owned ordinary table'
);

select flight_stripe_gate_harness.assert(
  to_regprocedure(
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'
  ) is not null
  and (
    select routine.prosecdef
      and routine.proretset
      and pg_get_userbyid(routine.proowner) = 'postgres'
      and exists (
        select 1 from pg_roles as owner_role
         where owner_role.oid = routine.proowner
           and (owner_role.rolsuper or owner_role.rolbypassrls)
      )
      and language.lanname = 'plpgsql'
      and 'search_path=pg_catalog, public' = any(routine.proconfig)
      and pg_get_function_result(routine.oid) =
        'TABLE(decision text, plan_id uuid, recorded_plan_sha256 text, plan_mode text)'
      from pg_proc as routine
      join pg_language as language on language.oid = routine.prolang
     where routine.oid =
       'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'::regprocedure
  ),
  'the recorder must have the exact SECURITY DEFINER contract'
);

select flight_stripe_gate_harness.assert(
  (
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
  ),
  'the plan journal must retain the exact digest-only 36-column shape'
);

select flight_stripe_gate_harness.assert(
  not exists (
    select 1
      from pg_constraint as constraint_row
     where constraint_row.conrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and (
         not constraint_row.convalidated
         or constraint_row.condeferrable
         or constraint_row.condeferred
       )
  ),
  'every journal constraint must be validated and immediate'
);

select flight_stripe_gate_harness.assert(
  (
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
  ),
  'the plan journal must have only the five reviewed valid indexes'
);

select flight_stripe_gate_harness.assert(
  not exists (
    select 1 from pg_policy
     where polrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
  )
  and not exists (
    select 1 from pg_trigger
     where tgrelid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and not tgisinternal
  )
  and (
    select count(*) = 1
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname like
         'record_flight_consumer_live_stripe_payment_intent_plan%'
  ),
  'the journal must have no policy, trigger, or shadow recorder'
);

-- Forced RLS and exact absence of direct table privileges.
select flight_stripe_gate_harness.assert(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_class as relation
     where relation.oid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
  ),
  'the journal must have enabled and forced RLS'
);

select flight_stripe_gate_harness.assert(
  not exists (
    select 1
      from unnest(array['anon', 'authenticated', 'service_role']) as role_name
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
  and not exists (
    select 1
      from pg_class as relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) as acl_row
     where relation.oid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and acl_row.grantee = 0
  )
  and not exists (
    select 1
      from pg_class as relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) as acl_row
     where relation.oid =
       'public.flight_consumer_live_stripe_payment_intent_plans'::regclass
       and acl_row.grantee <> relation.relowner
  ),
  'only the owner may have a direct journal privilege'
);

select flight_stripe_gate_harness.assert(
  has_function_privilege(
    'service_role',
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and not exists (
    select 1
      from pg_proc as routine
      cross join lateral aclexplode(
        coalesce(routine.proacl, acldefault('f', routine.proowner))
      ) as acl_row
     where routine.oid =
       'public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)'::regprocedure
       and acl_row.grantee = 0
       and acl_row.privilege_type = 'EXECUTE'
  )
  and not exists (
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
  ),
  'only service_role may execute the recorder'
);

select flight_stripe_gate_harness.assert(
  not exists (
    select 1
      from pg_proc as routine
      join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname ~
         'flight_consumer_live_stripe.*(claim|dispatch|complete|capture|refund|confirm)'
  ),
  'migration 103 must expose no Stripe mutation lifecycle RPC'
);

select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select flight_stripe_gate_harness.expect_error(
  'select count(*) from public.flight_consumer_live_stripe_payment_intent_plans',
  'permission denied for table flight_consumer_live_stripe_payment_intent_plans'
);
select flight_stripe_gate_harness.expect_error(
  'insert into public.flight_consumer_live_stripe_payment_intent_plans default values',
  'permission denied for table flight_consumer_live_stripe_payment_intent_plans'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
select flight_stripe_gate_harness.expect_error(
  'select count(*) from public.flight_consumer_live_stripe_payment_intent_plans',
  'permission denied for table flight_consumer_live_stripe_payment_intent_plans'
);
reset role;

-- One created row followed by a byte-for-byte logical replay.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select decision, plan_id::text, recorded_plan_sha256, plan_mode
  from flight_stripe_gate_harness.record_plan()
\gset base_
reset role;

select recorded_at::text as base_recorded_at
  from public.flight_consumer_live_stripe_payment_intent_plans
 where id = :'base_plan_id'::uuid
\gset

select flight_stripe_gate_harness.assert(
  :'base_decision' = 'created'
  and :'base_recorded_plan_sha256' = repeat('b', 64)
  and :'base_plan_mode' = 'zero_dispatch',
  'the first exact plan must be created'
);

select flight_stripe_gate_harness.assert(
  (
    select count(*) = 1
      and bool_and(
        execution_scope_sha256 = repeat('1', 64)
        and payment_binding_sha256 = repeat('2', 64)
        and order_reference_sha256 = repeat('3', 64)
        and customer_reference_sha256 = repeat('4', 64)
        and payment_attempt_reference_sha256 = repeat('5', 64)
        and metadata_sha256 = repeat('6', 64)
        and request_body_sha256 = repeat('7', 64)
        and request_envelope_sha256 = repeat('8', 64)
        and idempotency_request_sha256 = repeat('9', 64)
        and idempotency_key_sha256 = repeat('a', 64)
        and plan_sha256 = repeat('b', 64)
        and plan_version =
          'flight-consumer-production-stripe-payment-intent-plan-v1'
        and plan_mode = 'zero_dispatch'
        and processor_id = 'stripe_live'
        and amount_cents = 25000
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
        and id is not null
        and recorded_at is not null
      )
      from public.flight_consumer_live_stripe_payment_intent_plans
  ),
  'the created plan row must retain the full zero-dispatch contract'
);

select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select decision, plan_id::text, recorded_plan_sha256, plan_mode
  from flight_stripe_gate_harness.record_plan()
\gset replay_
reset role;

select flight_stripe_gate_harness.assert(
  :'replay_decision' = 'replay'
  and :'replay_plan_id' = :'base_plan_id'
  and :'replay_recorded_plan_sha256' = :'base_recorded_plan_sha256'
  and :'replay_plan_mode' = :'base_plan_mode'
  and (select count(*) = 1
         from public.flight_consumer_live_stripe_payment_intent_plans)
  and (select recorded_at::text = :'base_recorded_at'
         from public.flight_consumer_live_stripe_payment_intent_plans
        where id = :'base_plan_id'::uuid),
  'an exact replay must return the original immutable row'
);

-- Every one of the twelve compared fields must refuse one-field drift.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_execution_scope_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_payment_binding_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_order_reference_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_customer_reference_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_payment_attempt_reference_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_metadata_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_request_body_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_request_envelope_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_idempotency_request_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_idempotency_key_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_plan_sha256 => repeat('f', 64))$$,
  'payment plan idempotency collision'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_amount_cents => 25001)$$,
  'payment plan idempotency collision'
);

select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_metadata_sha256 => 'bad')$$,
  'payment plan evidence is invalid'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_amount_cents => 49)$$,
  'payment plan evidence is invalid'
);
select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_amount_cents => 100000000)$$,
  'payment plan evidence is invalid'
);
reset role;

select flight_stripe_gate_harness.assert(
  (select count(*) = 1
     from public.flight_consumer_live_stripe_payment_intent_plans)
  and (select execution_scope_sha256 = repeat('1', 64)
         and payment_binding_sha256 = repeat('2', 64)
         and order_reference_sha256 = repeat('3', 64)
         and customer_reference_sha256 = repeat('4', 64)
         and payment_attempt_reference_sha256 = repeat('5', 64)
         and metadata_sha256 = repeat('6', 64)
         and request_body_sha256 = repeat('7', 64)
         and request_envelope_sha256 = repeat('8', 64)
         and idempotency_request_sha256 = repeat('9', 64)
         and idempotency_key_sha256 = repeat('a', 64)
         and plan_sha256 = repeat('b', 64)
         and amount_cents = 25000
         and recorded_at::text = :'base_recorded_at'
         from public.flight_consumer_live_stripe_payment_intent_plans),
  'all refused drift and malformed calls must preserve the original row'
);

-- A second independent row permits an explicit two-row OR-identity ambiguity.
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select decision
  from flight_stripe_gate_harness.record_plan(
    repeat('c', 64), repeat('d', 64), repeat('e', 64),
    repeat('f', 64), repeat('0', 64), repeat('1', 64),
    repeat('2', 64), repeat('3', 64), repeat('4', 64),
    repeat('5', 64), repeat('6', 64), 26000
  )
\gset second_

select flight_stripe_gate_harness.expect_error(
  $$select * from flight_stripe_gate_harness.record_plan(
    p_plan_sha256 => repeat('6', 64))$$,
  'payment plan identity is ambiguous'
);
reset role;

select flight_stripe_gate_harness.assert(
  :'second_decision' = 'created'
  and (select count(*) = 2
         from public.flight_consumer_live_stripe_payment_intent_plans),
  'identity ambiguity must preserve both independent plans'
);

\echo FLIGHT_STRIPE_PLAN_POSTGRES_GATE_PASS
