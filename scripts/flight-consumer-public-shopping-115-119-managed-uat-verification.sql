-- Managed isolated-UAT verification for exact Flight Gates 115-119.
--
-- The guarded runner or SQL Editor renderer supplies the exact target prefix.
-- Synthetic digest-only rows are enclosed by one savepoint and are rolled back
-- before commit. No provider, Stripe, order, charge, ticket, route, deployment,
-- Production, or migration-ledger operation exists in this file.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $flight_public_shopping_115_119_catalog$
declare
  v_target_kind text := current_setting(
    'app.flight_managed_115_119_target_kind', true
  );
  v_project_ref text := current_setting(
    'app.flight_managed_115_119_project_ref', true
  );
  v_expected_ledger_count text := current_setting(
    'app.flight_managed_115_119_expected_ledger_count', true
  );
  v_expected_ledger_sha256 text := current_setting(
    'app.flight_managed_115_119_expected_ledger_sha256', true
  );
  v_actual_ledger_count bigint;
  v_actual_ledger_sha256 text;
  v_relation text;
  v_signature text;
  v_count bigint;
begin
  if row(v_target_kind, v_project_ref) is distinct from row(
    'isolated_uat'::text,
    'bzxqbvmrkmjyvudlspss'::text
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target binding is absent or invalid';
  end if;
  if current_database() <> 'postgres' or current_user <> 'postgres'
    or current_setting('server_version_num')::integer < 170000
    or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: managed database identity changed';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: migration ledger is unavailable';
  end if;

  foreach v_relation in array array[
    'flight_consumer_live_public_shopping_admissions',
    'flight_consumer_live_public_offer_projection_batches',
    'flight_consumer_live_public_offer_projection_dispositions',
    'flight_consumer_live_public_offer_projections',
    'flight_consumer_live_public_offer_segments',
    'flight_consumer_live_public_offer_reference_vaults',
    'flight_consumer_live_public_offer_reference_purge_receipts',
    'flight_consumer_live_duffel_offer_source_batches',
    'flight_consumer_live_public_shopping_dispatches'
  ] loop
    if to_regclass(format('public.%I', v_relation)) is null then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target relation % is absent',
        v_relation;
    end if;
    if (
      select not relation.relrowsecurity
        or not relation.relforcerowsecurity
        or pg_get_userbyid(relation.relowner) <> 'postgres'
        from pg_class as relation
       where relation.oid = format('public.%I', v_relation)::regclass
    ) then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target relation % RLS/owner changed',
        v_relation;
    end if;
    if exists (
      select 1
        from unnest(array['anon', 'authenticated', 'service_role']) role_name
        cross join unnest(array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]) privilege_name
       where has_table_privilege(
         role_name,
         format('public.%I', v_relation),
         privilege_name
       )
    ) then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: direct table privilege exists on %',
        v_relation;
    end if;
    execute format('select count(*) from public.%I', v_relation) into v_count;
    if v_count <> 0 then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target relation % is not empty before verification',
        v_relation;
    end if;
  end loop;

  if exists (
    select 1
      from pg_policy as policy
     where policy.polrelid = any(array[
       'public.flight_consumer_live_public_shopping_admissions'::regclass,
       'public.flight_consumer_live_public_offer_projection_batches'::regclass,
       'public.flight_consumer_live_public_offer_projection_dispositions'::regclass,
       'public.flight_consumer_live_public_offer_projections'::regclass,
       'public.flight_consumer_live_public_offer_segments'::regclass,
       'public.flight_consumer_live_public_offer_reference_vaults'::regclass,
       'public.flight_consumer_live_public_offer_reference_purge_receipts'::regclass,
       'public.flight_consumer_live_duffel_offer_source_batches'::regclass,
       'public.flight_consumer_live_public_shopping_dispatches'::regclass
     ])
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target relation policy unexpectedly exists';
  end if;

  foreach v_signature in array array[
    'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)',
    'public.get_flight_consumer_live_public_offer_projection_batch_v1(uuid,text,text,text,text)',
    'public.complete_flight_consumer_live_public_offer_projection_batch_v1(uuid,text,text,text,text,text,text,text,text,jsonb,uuid,text,text,text,text,timestamptz,integer,jsonb,jsonb)',
    'public.list_flight_consumer_live_duffel_pending_offer_sources_v1(uuid,text,text)',
    'public.read_flight_consumer_live_public_offer_projection_batch_v1(uuid,text,text,text)',
    'public.purge_flight_consumer_live_expired_offer_references_v1(integer)',
    'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)',
    'public.claim_flight_consumer_live_public_shopping_dispatch_v1(uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz)'
  ] loop
    if to_regprocedure(v_signature) is null
      or not has_function_privilege('service_role', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE')
      or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or (
        select not routine.prosecdef
          or pg_get_userbyid(routine.proowner) <> 'postgres'
          or coalesce(array_to_string(routine.proconfig, ','), '')
            not like '%search_path=pg_catalog, public%'
          from pg_proc as routine
         where routine.oid = to_regprocedure(v_signature)
      ) then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: RPC contract changed for %',
        v_signature;
    end if;
  end loop;

  if to_regprocedure('public.canonical_flight_consumer_public_offer_json_v1(jsonb)') is null
    or has_function_privilege(
      'service_role',
      'public.canonical_flight_consumer_public_offer_json_v1(jsonb)',
      'EXECUTE'
    )
    or (
      select routine.provolatile <> 'i'
        or not routine.proisstrict
        or routine.prosecdef
        or pg_get_userbyid(routine.proowner) <> 'postgres'
        from pg_proc as routine
       where routine.oid =
         'public.canonical_flight_consumer_public_offer_json_v1(jsonb)'::regprocedure
    ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: canonical JSON contract changed';
  end if;

  -- PostgreSQL truncates identifiers to NAMEDATALEN - 1, so bind the guards by
  -- relation, trigger function, timing, and event instead of long tgname text.
  if (
    select count(*)
      from (values
        (
          'public.flight_consumer_live_public_shopping_admissions'::regclass,
          'public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1()'::regprocedure,
          true
        ),
        ('public.flight_consumer_live_public_offer_projection_batches'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_public_offer_projection_dispositions'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_public_offer_projections'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_public_offer_segments'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_public_offer_reference_vaults'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, false),
        ('public.flight_consumer_live_public_offer_reference_purge_receipts'::regclass,
          'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_duffel_offer_source_batches'::regclass,
          'public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1()'::regprocedure, true),
        ('public.flight_consumer_live_public_shopping_dispatches'::regclass,
          'public.refuse_flight_consumer_live_public_shopping_dispatch_mutation_v1()'::regprocedure, true)
      ) as expected_guard(relation_oid, function_oid, delete_required)
     where exists (
       select 1
         from pg_trigger as trigger_row
        where not trigger_row.tgisinternal
          and trigger_row.tgrelid = expected_guard.relation_oid
          and trigger_row.tgfoid = expected_guard.function_oid
          and (trigger_row.tgtype & 1) = 1
          and (trigger_row.tgtype & 2) = 2
          and (trigger_row.tgtype & 16) = 16
          and (
            not expected_guard.delete_required
            or (trigger_row.tgtype & 8) = 8
          )
     )
  ) <> 9 or not exists (
    select 1
      from pg_trigger as trigger_row
     where not trigger_row.tgisinternal
       and trigger_row.tgrelid =
         'public.flight_consumer_live_duffel_shopping_attempts'::regclass
       and trigger_row.tgfoid =
         'public.guard_flight_consumer_live_duffel_shopping_success_sources_v1()'::regprocedure
       and (trigger_row.tgtype & 1) = 1
       and (trigger_row.tgtype & 2) = 2
       and (trigger_row.tgtype & 16) = 16
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: append-only/success guard set changed';
  end if;
  if exists (
    select 1
      from pg_constraint as constraint_row
     where constraint_row.conrelid = any(array[
       'public.flight_consumer_live_public_shopping_admissions'::regclass,
       'public.flight_consumer_live_public_offer_projection_batches'::regclass,
       'public.flight_consumer_live_public_offer_projection_dispositions'::regclass,
       'public.flight_consumer_live_public_offer_projections'::regclass,
       'public.flight_consumer_live_public_offer_segments'::regclass,
       'public.flight_consumer_live_public_offer_reference_vaults'::regclass,
       'public.flight_consumer_live_public_offer_reference_purge_receipts'::regclass,
       'public.flight_consumer_live_duffel_offer_source_batches'::regclass,
       'public.flight_consumer_live_public_shopping_dispatches'::regclass
     ])
       and (not constraint_row.convalidated or constraint_row.condeferrable)
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: target constraint is unvalidated or deferrable';
  end if;

  -- Gates 139/140 are the canonical repository tip, but are intentionally not
  -- part of this bounded 115-119 UAT apply package.
  if to_regclass(
      'public.flight_consumer_live_private_preview_membership_events'
    ) is not null
    or to_regprocedure(
      'public.reconcile_flight_consumer_live_private_preview_exposure_v1(uuid,text,text,text)'
    ) is not null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: out-of-range Gate 139/140 object is present';
  end if;
  if to_regnamespace('flight_public_shopping_115_119_harness') is not null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: verification harness object exists';
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
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: Gate 115-119 was unexpectedly ledgered';
  end if;
  select count(*), encode(extensions.digest(convert_to(coalesce(
      string_agg(version::text, ',' order by version::text), ''
    ), 'UTF8'), 'sha256'), 'hex')
    into v_actual_ledger_count, v_actual_ledger_sha256
    from supabase_migrations.schema_migrations;
  if v_expected_ledger_count is not null
    and v_expected_ledger_count <> ''
    and (
      v_actual_ledger_count::text is distinct from v_expected_ledger_count
      or v_actual_ledger_sha256 is distinct from v_expected_ledger_sha256
    ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: migration ledger changed after preflight';
  end if;
end;
$flight_public_shopping_115_119_catalog$;

savepoint flight_public_shopping_115_119_synthetic_rows;

-- Gate 116 intentionally keeps its canonicalizer owner-only. Grant the exact
-- fixture helper only inside this savepoint; the rollback below restores the
-- reviewed ACL before the transaction can commit.
grant execute on function
  public.canonical_flight_consumer_public_offer_json_v1(jsonb)
  to service_role;

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

do $flight_public_shopping_115_119_synthetic$
declare
  v_scope text := repeat('1', 64);
  v_policy text := repeat('2', 64);
  v_cohort text := repeat('3', 64);
  v_subject text := repeat('4', 64);
  v_admission_idempotency text := repeat('5', 64);
  v_shopping_scope text := repeat('6', 64);
  v_admission_policy text;
  v_search jsonb := jsonb_build_object(
    'adults', 1,
    'cabin', 'economy',
    'departureDate', '2026-09-10',
    'destination', 'LHR',
    'origin', 'ORD',
    'returnDate', null
  );
  v_search_json text;
  v_request text;
  v_body text;
  v_admission record;
  v_admission_replay record;
  v_dispatch record;
  v_dispatch_replay record;
  v_completed record;
  v_recorded record;
  v_observed timestamptz;
  v_projection_batch text;
  v_dispatch_idempotency text;
  v_deadline timestamptz;
  v_collision_refused boolean := false;
  v_direct_read_refused boolean := false;
  v_nonzero_admission record;
  v_nonzero_dispatch record;
  v_nonzero_source record;
  v_nonzero_completed record;
  v_nonzero_admission_idempotency text := repeat('7', 64);
  v_nonzero_dispatch_idempotency text;
  v_nonzero_response text := repeat('8', 64);
  v_nonzero_offer text := repeat('9', 64);
  v_nonzero_sources jsonb;
  v_refused jsonb;
  v_safe_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: service-role claims are not honored';
  end if;
  begin
    perform 1 from public.flight_consumer_live_public_shopping_admissions;
  exception when insufficient_privilege then
    v_direct_read_refused := true;
  end;
  if not v_direct_read_refused then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: service role gained direct table access';
  end if;

  v_admission_policy := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-shopping-admission-policy:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_policy
      || ':subjectMinute=2:subjectDay=10:cohortMinute=10:cohortDay=100'
      || ':globalMinute=20:globalDay=250:claimTtlSeconds=60',
      'UTF8'
    ), 'sha256'
  ), 'hex');
  v_search_json := '{"adults":1,"cabin":"economy","departureDate":"2026-09-10",'
    || '"destination":"LHR","origin":"ORD","returnDate":null}';
  v_request := encode(extensions.digest(convert_to(
    '{"admissionPolicySha256":"' || v_admission_policy
    || '","cohortSha256":"' || v_cohort
    || '","executionScopeSha256":"' || v_scope
    || '","policySha256":"' || v_policy || '","search":'
    || v_search_json || ',"subjectSha256":"' || v_subject
    || '","version":"flight-consumer-production-public-shopping-admission-request-v1"}',
    'UTF8'
  ), 'sha256'), 'hex');
  v_body := encode(extensions.digest(convert_to(
    '{"data":{"cabin_class":"economy","passengers":[{"type":"adult"}],'
    || '"slices":[{"departure_date":"2026-09-10","destination":"LHR",'
    || '"origin":"ORD"}]}}', 'UTF8'
  ), 'sha256'), 'hex');

  select * into strict v_admission
    from public.reserve_flight_consumer_live_public_shopping_admission_v1(
      v_scope, v_policy, v_cohort, v_subject,
      v_admission_idempotency, v_request
    );
  if v_admission.decision <> 'created'
    or v_admission.admission_state <> 'admitted'
    or not v_admission.budget_claimed
    or v_admission.provider_dispatch_authorized
    or v_admission.consumer_exposure_authorized
    or v_admission.order_authorized
    or v_admission.stripe_dispatch_authorized
    or v_admission.booking_authorized
    or v_admission.payment_authorized
    or v_admission.capture_authorized
    or v_admission.refund_authorized
    or v_admission.settlement_authorized
    or v_admission.ticketing_authorized
    or v_admission.servicing_authorized
    or v_admission.consumer_release_enabled
    or v_admission.blind_retry_authorized then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: admission contract changed';
  end if;
  select * into strict v_admission_replay
    from public.reserve_flight_consumer_live_public_shopping_admission_v1(
      v_scope, v_policy, v_cohort, v_subject,
      v_admission_idempotency, v_request
    );
  if v_admission_replay.decision <> 'replay'
    or v_admission_replay.admission_id <> v_admission.admission_id
    or v_admission_replay.admission_receipt_sha256 <>
      v_admission.admission_receipt_sha256 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: admission replay changed';
  end if;

  v_dispatch_idempotency := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_admission.admission_id::text || ':'
      || v_admission.admission_receipt_sha256 || ':' || v_shopping_scope
      || ':' || v_request || ':' || v_body, 'UTF8'
    ), 'sha256'
  ), 'hex');
  v_deadline := clock_timestamp() + interval '10 seconds';
  select * into strict v_dispatch
    from public.claim_flight_consumer_live_public_shopping_dispatch_v1(
      v_admission.admission_id,
      v_admission.admission_receipt_sha256,
      v_scope, v_policy, v_admission.admission_policy_sha256,
      v_cohort, v_subject, v_admission_idempotency, v_request,
      v_shopping_scope, v_dispatch_idempotency, v_body, v_deadline
    );
  if v_dispatch.decision <> 'created'
    or not v_dispatch.create_offer_request_dispatch_authorized
    or v_dispatch.attempt_state <> 'dispatching'
    or v_dispatch.attempt_revision <> 1
    or v_dispatch.provider_dispatch_authorized
    or v_dispatch.consumer_exposure_authorized
    or v_dispatch.order_authorized
    or v_dispatch.stripe_dispatch_authorized
    or v_dispatch.booking_authorized
    or v_dispatch.payment_authorized
    or v_dispatch.capture_authorized
    or v_dispatch.refund_authorized
    or v_dispatch.settlement_authorized
    or v_dispatch.ticketing_authorized
    or v_dispatch.servicing_authorized
    or v_dispatch.consumer_release_enabled
    or v_dispatch.blind_retry_authorized then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: atomic dispatch contract changed';
  end if;

  select * into strict v_recorded
    from public.record_flight_consumer_live_duffel_offer_sources_v1(
      v_dispatch.shopping_attempt_id, v_shopping_scope,
      repeat('a', 64), '[]'::jsonb
    );
  if v_recorded.recorded_source_count <> 0 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: zero source header changed';
  end if;
  v_observed := date_trunc('milliseconds', clock_timestamp());
  v_projection_batch := encode(extensions.digest(convert_to(
    public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
      'version', 'flight-consumer-production-public-offer-projection-batch-v1',
      'admissionId', v_admission.admission_id::text,
      'admissionReceiptSha256', v_admission.admission_receipt_sha256,
      'sourceShoppingAttemptId', v_dispatch.shopping_attempt_id::text,
      'sourceShoppingExecutionScopeSha256', v_shopping_scope,
      'sourceResponseSha256', repeat('a', 64),
      'sourceRequestBodySha256', v_body,
      'projected', '[]'::jsonb,
      'refused', '[]'::jsonb,
      'observedAt', to_char(
        v_observed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )), 'UTF8'), 'sha256'), 'hex');
  select * into strict v_completed
    from public.complete_flight_consumer_live_public_offer_projection_batch_v1(
      v_admission.admission_id,
      v_admission.admission_receipt_sha256,
      v_scope, v_policy, v_admission.admission_policy_sha256,
      v_cohort, v_subject, v_admission_idempotency, v_request, v_search,
      v_dispatch.shopping_attempt_id, v_shopping_scope, repeat('a', 64),
      v_body, v_projection_batch, v_observed, 64, '[]'::jsonb, '[]'::jsonb
    );
  if v_completed.decision <> 'created'
    or v_completed.projected_offer_count <> 0
    or v_completed.refused_offer_count <> 0
    or v_completed.provider_dispatch_authorized
    or v_completed.consumer_exposure_authorized
    or v_completed.order_authorized
    or v_completed.stripe_dispatch_authorized
    or v_completed.booking_authorized
    or v_completed.payment_authorized
    or v_completed.capture_authorized
    or v_completed.refund_authorized
    or v_completed.settlement_authorized
    or v_completed.ticketing_authorized
    or v_completed.servicing_authorized
    or v_completed.consumer_release_enabled
    or v_completed.blind_retry_authorized then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: zero projection completion changed';
  end if;
  select * into strict v_dispatch_replay
    from public.claim_flight_consumer_live_public_shopping_dispatch_v1(
      v_admission.admission_id,
      v_admission.admission_receipt_sha256,
      v_scope, v_policy, v_admission.admission_policy_sha256,
      v_cohort, v_subject, v_admission_idempotency, v_request,
      v_shopping_scope, v_dispatch_idempotency, v_body, v_deadline
    );
  if v_dispatch_replay.decision <> 'replay'
    or v_dispatch_replay.create_offer_request_dispatch_authorized
    or v_dispatch_replay.shopping_attempt_id <> v_dispatch.shopping_attempt_id
    or v_dispatch_replay.attempt_state <> 'succeeded'
    or v_dispatch_replay.attempt_revision <> 2 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: dispatch replay changed';
  end if;
  begin
    perform *
      from public.claim_flight_consumer_live_public_shopping_dispatch_v1(
        v_admission.admission_id,
        v_admission.admission_receipt_sha256,
        v_scope, v_policy, v_admission.admission_policy_sha256,
        v_cohort, v_subject, v_admission_idempotency, v_request,
        v_shopping_scope, v_dispatch_idempotency, repeat('b', 64), v_deadline
      );
  exception when others then
    v_collision_refused := true;
  end;
  if not v_collision_refused then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: dispatch collision was accepted';
  end if;

  -- A second admitted flow records one exact source and refuses it explicitly.
  -- This exercises Gate 118's non-empty header plus Gate 116's exact accounting
  -- without introducing a real provider reference or exposing an offer.
  select * into strict v_nonzero_admission
    from public.reserve_flight_consumer_live_public_shopping_admission_v1(
      v_scope, v_policy, v_cohort, v_subject,
      v_nonzero_admission_idempotency, v_request
    );
  v_nonzero_dispatch_idempotency := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_nonzero_admission.admission_id::text || ':'
      || v_nonzero_admission.admission_receipt_sha256 || ':'
      || v_shopping_scope || ':' || v_request || ':' || v_body,
      'UTF8'
    ), 'sha256'
  ), 'hex');
  select * into strict v_nonzero_dispatch
    from public.claim_flight_consumer_live_public_shopping_dispatch_v1(
      v_nonzero_admission.admission_id,
      v_nonzero_admission.admission_receipt_sha256,
      v_scope, v_policy, v_nonzero_admission.admission_policy_sha256,
      v_cohort, v_subject, v_nonzero_admission_idempotency, v_request,
      v_shopping_scope, v_nonzero_dispatch_idempotency, v_body,
      clock_timestamp() + interval '10 seconds'
    );
  v_nonzero_sources := jsonb_build_array(jsonb_build_object(
    'offerIdSha256', v_nonzero_offer,
    'expiresAt', to_char(
      (clock_timestamp() + interval '1 hour') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ));
  perform *
    from public.record_flight_consumer_live_duffel_offer_sources_v1(
      v_nonzero_dispatch.shopping_attempt_id, v_shopping_scope,
      v_nonzero_response, v_nonzero_sources
    );
  select * into strict v_nonzero_source
    from public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
      v_nonzero_dispatch.shopping_attempt_id,
      v_shopping_scope,
      v_nonzero_response
    );
  v_refused := jsonb_build_array(jsonb_build_object(
    'sourceId', v_nonzero_source.source_id::text,
    'sourceOfferEvidenceSha256',
      v_nonzero_source.source_offer_evidence_sha256,
    'offerIdSha256', v_nonzero_source.offer_id_sha256,
    'refusalCode', 'unsupported_contract'
  ));
  v_observed := date_trunc('milliseconds', clock_timestamp());
  v_projection_batch := encode(extensions.digest(convert_to(
    public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
      'version', 'flight-consumer-production-public-offer-projection-batch-v1',
      'admissionId', v_nonzero_admission.admission_id::text,
      'admissionReceiptSha256',
        v_nonzero_admission.admission_receipt_sha256,
      'sourceShoppingAttemptId', v_nonzero_dispatch.shopping_attempt_id::text,
      'sourceShoppingExecutionScopeSha256', v_shopping_scope,
      'sourceResponseSha256', v_nonzero_response,
      'sourceRequestBodySha256', v_body,
      'projected', '[]'::jsonb,
      'refused', v_refused,
      'observedAt', to_char(
        v_observed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )), 'UTF8'), 'sha256'), 'hex');
  select * into strict v_nonzero_completed
    from public.complete_flight_consumer_live_public_offer_projection_batch_v1(
      v_nonzero_admission.admission_id,
      v_nonzero_admission.admission_receipt_sha256,
      v_scope, v_policy, v_nonzero_admission.admission_policy_sha256,
      v_cohort, v_subject, v_nonzero_admission_idempotency, v_request, v_search,
      v_nonzero_dispatch.shopping_attempt_id, v_shopping_scope,
      v_nonzero_response, v_body, v_projection_batch, v_observed, 1024,
      '[]'::jsonb, v_refused
    );
  if v_nonzero_completed.projected_offer_count <> 0
    or v_nonzero_completed.refused_offer_count <> 1 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: non-empty source accounting changed';
  end if;
  select count(*)::integer into v_safe_count
    from public.read_flight_consumer_live_public_offer_projection_batch_v1(
      v_nonzero_admission.admission_id,
      v_nonzero_admission.admission_receipt_sha256,
      v_subject,
      v_request
    );
  if v_safe_count <> 0 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: refused source became public';
  end if;
end;
$flight_public_shopping_115_119_synthetic$;

reset role;

-- Create one expired encrypted-reference fixture using ordinary constrained
-- inserts (no trigger disable or replication-role bypass), then test Gate 117's
-- populated purge through its service RPC. All rows remain inside the savepoint.
do $flight_public_shopping_115_119_purge_fixture$
declare
  v_batch_id uuid;
  v_source public.flight_consumer_live_duffel_offer_sources;
  v_projection_id uuid := '00000000-0000-4000-8000-000000000119';
  v_now timestamptz := clock_timestamp();
begin
  select batch.id into strict v_batch_id
    from public.flight_consumer_live_public_offer_projection_batches as batch
   where batch.source_offer_count = 1
     and batch.projected_offer_count = 0
     and batch.refused_offer_count = 1;
  select source.* into strict v_source
    from public.flight_consumer_live_duffel_offer_sources as source
    join public.flight_consumer_live_public_offer_projection_dispositions
      as disposition on disposition.source_id = source.id
   where disposition.batch_id = v_batch_id
     and disposition.disposition = 'refused';
  insert into public.flight_consumer_live_public_offer_projections (
    id, batch_id, source_id, source_offer_evidence_sha256, offer_id_sha256,
    projection_sha256, display_rank, provider_code, owner_name,
    owner_iata_code, currency, base_amount_minor, tax_amount_minor,
    total_amount_minor, passenger_identity_documents_required,
    requires_instant_payment, offer_expires_at, presentation_expires_at,
    changeable, refundable, change_penalty_amount_minor,
    refund_penalty_amount_minor, terms_summary_sha256, created_at
  ) values (
    v_projection_id, v_batch_id, v_source.id,
    v_source.source_offer_evidence_sha256, v_source.offer_id_sha256,
    repeat('c', 64), 1, 'duffel', 'Synthetic Air', 'SY', 'USD',
    10000, 2000, 12000, false, true,
    v_now + interval '1 hour', v_now + interval '5 minutes',
    true, true, 5000, 7000, repeat('d', 64), v_now
  );
  insert into public.flight_consumer_live_public_offer_reference_vaults (
    projection_id, offer_id_sha256, provider_offer_reference_ciphertext,
    key_version, aad_sha256, ciphertext_sha256, record_hmac_sha256,
    retention_expires_at, created_at
  ) values (
    v_projection_id, v_source.offer_id_sha256,
    'enc:v1:abcdefghijklmnop', 'uat-synthetic-v1', repeat('e', 64),
    repeat('f', 64), repeat('0', 64),
    v_now - interval '1 day', v_now - interval '8 days'
  );
end;
$flight_public_shopping_115_119_purge_fixture$;

set local role service_role;

do $flight_public_shopping_115_119_purge$
declare
  v_purge record;
begin
  select * into strict v_purge
    from public.purge_flight_consumer_live_expired_offer_references_v1(500);
  if v_purge.decision <> 'purged'
    or v_purge.purged_count <> 1
    or v_purge.purge_receipt_id is null
    or v_purge.provider_dispatch_authorized
    or v_purge.consumer_exposure_authorized
    or v_purge.order_authorized
    or v_purge.stripe_dispatch_authorized
    or v_purge.booking_authorized
    or v_purge.payment_authorized
    or v_purge.capture_authorized
    or v_purge.refund_authorized
    or v_purge.settlement_authorized
    or v_purge.ticketing_authorized
    or v_purge.servicing_authorized
    or v_purge.consumer_release_enabled
    or v_purge.blind_retry_authorized then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: populated purge contract changed';
  end if;
end;
$flight_public_shopping_115_119_purge$;

reset role;

do $flight_public_shopping_115_119_synthetic_receipt$
begin
  if (select count(*) from public.flight_consumer_live_public_shopping_admissions) <> 2
    or (select count(*) from public.flight_consumer_live_public_shopping_dispatches) <> 2
    or (select count(*) from public.flight_consumer_live_duffel_shopping_attempts) <> 2
    or (select count(*) from public.flight_consumer_live_duffel_offer_source_batches) <> 2
    or (select count(*) from public.flight_consumer_live_public_offer_projection_batches) <> 2
    or (select count(*) from public.flight_consumer_live_public_offer_reference_vaults) <> 0
    or (select count(*) from public.flight_consumer_live_public_offer_reference_purge_receipts) <> 1 then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: synthetic accounting changed';
  end if;
end;
$flight_public_shopping_115_119_synthetic_receipt$;

rollback to savepoint flight_public_shopping_115_119_synthetic_rows;
release savepoint flight_public_shopping_115_119_synthetic_rows;

do $flight_public_shopping_115_119_zero_residue$
declare
  v_relation text;
  v_count bigint;
begin
  foreach v_relation in array array[
    'flight_consumer_live_duffel_shopping_attempts',
    'flight_consumer_live_duffel_offer_sources',
    'flight_consumer_live_public_shopping_admissions',
    'flight_consumer_live_public_shopping_dispatches',
    'flight_consumer_live_duffel_offer_source_batches',
    'flight_consumer_live_public_offer_projection_batches',
    'flight_consumer_live_public_offer_projection_dispositions',
    'flight_consumer_live_public_offer_projections',
    'flight_consumer_live_public_offer_segments',
    'flight_consumer_live_public_offer_reference_vaults',
    'flight_consumer_live_public_offer_reference_purge_receipts'
  ] loop
    execute format('select count(*) from public.%I', v_relation) into v_count;
    if v_count <> 0 then
      raise exception
        'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: synthetic row survived in %',
        v_relation;
    end if;
  end loop;
  if to_regnamespace('flight_public_shopping_115_119_harness') is not null then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: harness object survived';
  end if;
  if has_function_privilege(
    'service_role',
    'public.canonical_flight_consumer_public_offer_json_v1(jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: synthetic canonicalizer grant survived';
  end if;
  if exists (
    select 1 from supabase_migrations.schema_migrations
     where version::text = any(array[
       '202608260115', '202608260116', '202608260117',
       '202608260118', '202608260119'
     ])
  ) then
    raise exception
      'FLIGHT_PUBLIC_SHOPPING_115_119_VERIFY_FAILED: ledger changed during verification';
  end if;
end;
$flight_public_shopping_115_119_zero_residue$;

select jsonb_build_object(
  'gate', 'flight_consumer_public_shopping_115_119_managed_uat_verification',
  'result', 'PASS',
  'target_kind', current_setting('app.flight_managed_115_119_target_kind'),
  'project_ref', current_setting('app.flight_managed_115_119_project_ref'),
  'database', current_database(),
  'current_user', current_user,
  'server_version_num', current_setting('server_version_num')::integer,
  'apply_range', '202608260115-202608260119',
  'canonical_repository_tip', '202608260140',
  'catalog_rls_acl_append_only', 'passed',
  'zero_source_flow', 'passed',
  'nonzero_refused_source_flow', 'passed',
  'exact_replay_and_collision', 'passed',
  'populated_reference_purge', 'passed',
  'synthetic_rows_after_savepoint_rollback', 0,
  'verification_harness_objects', 0,
  'ledger_version_count', (select count(*) from supabase_migrations.schema_migrations),
  'ledger_versions_sha256', encode(extensions.digest(convert_to(coalesce((
    select string_agg(version::text, ',' order by version::text)
      from supabase_migrations.schema_migrations
  ), ''), 'UTF8'), 'sha256'), 'hex'),
  'gate_115_119_ledger_entries', 0,
  'provider_requests', 0,
  'stripe_requests', 0,
  'orders', 0,
  'charges', 0,
  'tickets', 0,
  'migration_ledger_mutation', false,
  'production_accessed', false,
  'deployment_or_route_change', false
) as flight_public_shopping_115_119_managed_uat_verification_receipt;

commit;
