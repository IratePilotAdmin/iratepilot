begin;

-- Forward repair for three Preview-only consumer search defects found by the
-- authenticated end-to-end rehearsal. This migration does not enable any
-- runtime capability, contact a provider, move money, or authorize Production.
do $flight_consumer_preview_084_dependencies$
declare
  v_complete_source text;
  v_fail_source text;
  v_settlement_constraint_definition text;
  v_settlement_constraint_validated boolean;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_offers') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_ticket_documents') is null
    or to_regprocedure(
      'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
    ) is null
    or to_regprocedure(
      'public.fail_flight_consumer_search_v1(uuid,integer)'
    ) is null
    then
    raise exception 'Flight Consumer Preview search repair requires migrations 068 through 083';
  end if;

  select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)),
         constraint_record.convalidated
    into v_settlement_constraint_definition, v_settlement_constraint_validated
    from pg_catalog.pg_constraint as constraint_record
   where constraint_record.conrelid = 'public.flight_runtime_controls'::regclass
     and constraint_record.conname =
       'flight_runtime_controls_provider_settlement_dependency_check'
     and constraint_record.contype = 'c';
  if v_settlement_constraint_definition is null
    or not coalesce(v_settlement_constraint_validated, false)
    or position(
      'bound_provider_settlement_processor_code is not null'
      in v_settlement_constraint_definition
    ) = 0
    or position('execution_kill_switch_engaged' in v_settlement_constraint_definition) = 0
    or position('not synthetic_execution_enabled' in v_settlement_constraint_definition) = 0
    or position(
      'not provider_sandbox_traffic_enabled' in v_settlement_constraint_definition
    ) = 0
    or position(
      'not provider_live_traffic_enabled' in v_settlement_constraint_definition
    ) = 0
    or position('not shopping_enabled' in v_settlement_constraint_definition) = 0
    or position('not order_enabled' in v_settlement_constraint_definition) = 0
    or position('not payment_enabled' in v_settlement_constraint_definition) = 0
    or position('not ticketing_enabled' in v_settlement_constraint_definition) = 0
    or position('not servicing_enabled' in v_settlement_constraint_definition) = 0
    or position('not provider_events_enabled' in v_settlement_constraint_definition) = 0
    or position('not production_release_enabled' in v_settlement_constraint_definition) = 0 then
    raise exception 'Flight Consumer Preview search repair requires validated migration 083';
  end if;

  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
   );
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_search_v1(uuid,integer)'
   );
  if v_complete_source is null
    or position(
      'Flight local offer identity must equal its durable UUID' in v_complete_source
    ) = 0
    or v_fail_source is null
    or position(
      'from public.flight_offers where search_id = v_search.id' in v_fail_source
    ) = 0 then
    raise exception 'Flight Consumer Preview search repair predecessor has drifted';
  end if;
end;
$flight_consumer_preview_084_dependencies$;

-- Function and repository privilege changes are installed only from the fully
-- relocked posture. Preview can be explicitly reactivated afterward with the
-- existing evidence-bound activation contract.
do $flight_consumer_preview_084_relocked_precondition$
declare
  v_safe_count integer;
begin
  select count(*)::integer into v_safe_count
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
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 084 requires relock before repair';
  end if;
end;
$flight_consumer_preview_084_relocked_precondition$;

create or replace function public.complete_flight_consumer_search_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_normalized_offers jsonb
)
returns table (
  decision text,
  search_id uuid,
  search_status text,
  offer_count integer,
  offer_ids uuid[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_search_084$
#variable_conflict error
declare
  v_attempt public.flight_provider_request_attempts;
  v_search public.flight_searches;
  v_offer_json jsonb;
  v_segment_json jsonb;
  v_terms_json jsonb;
  v_evidence_json jsonb;
  v_offer_id uuid;
  v_offer_ids uuid[] := '{}'::uuid[];
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer search completion is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt
      on attempt.search_id = search.id
   where attempt.id = p_attempt_id
   for update of search;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_offer_request'
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.terminal_response_sha256 is null
    or v_search.status <> 'searching'
    or v_search.provider_request_sha256 is distinct from v_attempt.request_sha256 then
    raise exception 'Successful flight search terminal evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  if jsonb_typeof(p_normalized_offers) <> 'array'
    or jsonb_array_length(p_normalized_offers) > 5 then
    raise exception 'Flight normalized offers must be an array of at most five';
  end if;
  for v_offer_json in select value from jsonb_array_elements(p_normalized_offers)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_offer_json, array[
      'offer_id', 'local_offer_id', 'provider_offer_ref_ciphertext',
      'provider_offer_ref_sha256', 'provider_payload_sha256', 'currency',
      'base_fare_cents', 'tax_cents', 'fee_cents', 'total_cents',
      'validating_carrier', 'itinerary_sha256', 'fare_rules_sha256',
      'expires_at', 'segments', 'fare_terms', 'evidence'
    ]) then
      raise exception 'Flight normalized offer contains missing or unknown keys';
    end if;
    v_offer_id := (v_offer_json ->> 'offer_id')::uuid;
    if coalesce(v_offer_json ->> 'local_offer_id', '')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
      raise exception 'Flight local offer identity is malformed';
    end if;
    if jsonb_typeof(v_offer_json -> 'segments') <> 'array'
      or jsonb_array_length(v_offer_json -> 'segments') not between 1 and 16 then
      raise exception 'Flight normalized segments are invalid';
    end if;
    v_terms_json := v_offer_json -> 'fare_terms';
    if not public.flight_jsonb_has_exact_keys_v1(v_terms_json, array[
      'refundable', 'changeable', 'change_fee_cents',
      'cancellation_fee_cents', 'checked_bag_pieces', 'carry_on_pieces',
      'checked_bag_weight_kg', 'terms_summary_sha256'
    ]) then
      raise exception 'Flight normalized fare terms contain missing or unknown keys';
    end if;
    v_evidence_json := v_offer_json -> 'evidence';
    if not public.flight_jsonb_has_exact_keys_v1(v_evidence_json, array[
      'stage', 'predecessor_receipt_sha256', 'observed_at',
      'retention_expires_at', 'raw_body_sha256', 'evidence_sha256',
      'snapshot_sha256', 'record_sha256', 'receipt_sha256', 'key_version',
      'iv_base64url', 'auth_tag_base64url', 'ciphertext_base64url',
      'aad_sha256', 'record_hmac_sha256'
    ])
      or v_evidence_json ->> 'stage' <> 'initial'
      or v_evidence_json ->> 'predecessor_receipt_sha256' is not null
      or v_evidence_json ->> 'raw_body_sha256'
        is distinct from v_attempt.terminal_response_sha256 then
      raise exception 'Initial encrypted offer evidence is malformed';
    end if;
    insert into public.flight_offers (
      id, search_id, provider_code, execution_mode, execution_scope_sha256,
      provider_offer_ref_ciphertext, provider_offer_ref_sha256,
      provider_payload_sha256, currency, base_fare_cents, tax_cents, fee_cents,
      total_cents, validating_carrier, segment_count, itinerary_sha256,
      fare_rules_sha256, status, expires_at
    ) values (
      v_offer_id, v_search.id, 'duffel', 'test', v_search.execution_scope_sha256,
      v_offer_json ->> 'provider_offer_ref_ciphertext',
      v_offer_json ->> 'provider_offer_ref_sha256',
      v_offer_json ->> 'provider_payload_sha256', upper(v_offer_json ->> 'currency'),
      (v_offer_json ->> 'base_fare_cents')::bigint,
      (v_offer_json ->> 'tax_cents')::bigint,
      (v_offer_json ->> 'fee_cents')::bigint,
      (v_offer_json ->> 'total_cents')::bigint,
      upper(v_offer_json ->> 'validating_carrier'),
      jsonb_array_length(v_offer_json -> 'segments')::smallint,
      v_offer_json ->> 'itinerary_sha256', v_offer_json ->> 'fare_rules_sha256',
      'offered', (v_offer_json ->> 'expires_at')::timestamptz
    );
    for v_segment_json in
      select value from jsonb_array_elements(v_offer_json -> 'segments')
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_segment_json, array[
        'segment_sequence', 'journey_direction', 'origin_iata', 'destination_iata',
        'marketing_carrier', 'operating_carrier', 'marketing_flight_number',
        'departure_at', 'arrival_at', 'departure_local_date', 'arrival_local_date',
        'cabin', 'booking_class', 'duration_minutes', 'aircraft_code'
      ]) then
        raise exception 'Flight normalized segment contains missing or unknown keys';
      end if;
      insert into public.flight_offer_segments (
        offer_id, execution_mode, execution_scope_sha256, segment_sequence,
        journey_direction, origin_iata, destination_iata, marketing_carrier,
        operating_carrier, marketing_flight_number, departure_at, arrival_at,
        departure_local_date, arrival_local_date, cabin, booking_class,
        duration_minutes, aircraft_code
      ) values (
        v_offer_id, 'test', v_search.execution_scope_sha256,
        (v_segment_json ->> 'segment_sequence')::smallint,
        v_segment_json ->> 'journey_direction', upper(v_segment_json ->> 'origin_iata'),
        upper(v_segment_json ->> 'destination_iata'),
        upper(v_segment_json ->> 'marketing_carrier'),
        upper(v_segment_json ->> 'operating_carrier'),
        upper(v_segment_json ->> 'marketing_flight_number'),
        (v_segment_json ->> 'departure_at')::timestamptz,
        (v_segment_json ->> 'arrival_at')::timestamptz,
        (v_segment_json ->> 'departure_local_date')::date,
        (v_segment_json ->> 'arrival_local_date')::date,
        v_segment_json ->> 'cabin', v_segment_json ->> 'booking_class',
        (v_segment_json ->> 'duration_minutes')::integer,
        v_segment_json ->> 'aircraft_code'
      );
    end loop;
    insert into public.flight_offer_fare_terms (
      offer_id, execution_mode, execution_scope_sha256, refundable, changeable,
      change_fee_cents, cancellation_fee_cents, checked_bag_pieces,
      carry_on_pieces, checked_bag_weight_kg, terms_summary_sha256
    ) values (
      v_offer_id, 'test', v_search.execution_scope_sha256,
      (v_terms_json ->> 'refundable')::boolean,
      (v_terms_json ->> 'changeable')::boolean,
      case when jsonb_typeof(v_terms_json -> 'change_fee_cents') = 'null'
        then null else (v_terms_json ->> 'change_fee_cents')::bigint end,
      case when jsonb_typeof(v_terms_json -> 'cancellation_fee_cents') = 'null'
        then null else (v_terms_json ->> 'cancellation_fee_cents')::bigint end,
      (v_terms_json ->> 'checked_bag_pieces')::smallint,
      (v_terms_json ->> 'carry_on_pieces')::smallint,
      case when jsonb_typeof(v_terms_json -> 'checked_bag_weight_kg') = 'null'
        then null else (v_terms_json ->> 'checked_bag_weight_kg')::numeric end,
      v_terms_json ->> 'terms_summary_sha256'
    );
    insert into public.flight_offer_evidence_vault (
      customer_id, search_id, offer_id, provider_code, execution_mode,
      execution_scope_sha256, stage, predecessor_receipt_sha256, local_offer_id,
      reprice_receipt_id, observed_at, retention_expires_at, raw_body_sha256,
      evidence_sha256, snapshot_sha256, record_sha256, receipt_sha256,
      key_version, iv_base64url, auth_tag_base64url, ciphertext_base64url,
      aad_sha256, record_hmac_sha256
    ) values (
      v_search.customer_id, v_search.id, v_offer_id, 'duffel', 'test',
      v_search.execution_scope_sha256, 'initial', null,
      v_offer_json ->> 'local_offer_id', null,
      (v_evidence_json ->> 'observed_at')::timestamptz,
      (v_evidence_json ->> 'retention_expires_at')::timestamptz,
      v_evidence_json ->> 'raw_body_sha256', v_evidence_json ->> 'evidence_sha256',
      v_evidence_json ->> 'snapshot_sha256', v_evidence_json ->> 'record_sha256',
      v_evidence_json ->> 'receipt_sha256', v_evidence_json ->> 'key_version',
      v_evidence_json ->> 'iv_base64url', v_evidence_json ->> 'auth_tag_base64url',
      v_evidence_json ->> 'ciphertext_base64url', v_evidence_json ->> 'aad_sha256',
      v_evidence_json ->> 'record_hmac_sha256'
    );
    v_offer_ids := array_append(v_offer_ids, v_offer_id);
    v_count := v_count + 1;
  end loop;
  update public.flight_searches set status = 'complete'
   where id = v_search.id and status = 'searching'
  returning * into v_search;
  if not found then raise exception 'Flight search completion CAS failed'; end if;
  return query select 'completed'::text, v_search.id, v_search.status,
    v_count, v_offer_ids;
end;
$complete_flight_consumer_search_084$;

create or replace function public.fail_flight_consumer_search_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer
)
returns table (search_id uuid, search_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $fail_flight_consumer_search_084$
#variable_conflict error
declare
  v_attempt public.flight_provider_request_attempts;
  v_search public.flight_searches;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer search failure is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt on attempt.search_id = search.id
   where attempt.id = p_attempt_id for update of search;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.operation <> 'create_offer_request'
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.state not in ('succeeded', 'failed', 'ambiguous', 'blocked')
    or v_attempt.revision <> p_expected_terminal_revision
    or v_search.status not in ('created', 'searching') then
    raise exception 'Flight search terminal failure evidence does not match';
  end if;
  if v_attempt.state = 'succeeded' and (
    v_attempt.revision <> 2 or v_search.status <> 'searching'
    or exists (
      select 1 from public.flight_offers as offer
       where offer.search_id = v_search.id
    )
  ) then
    raise exception 'Successful provider response may fail locally only before any offer materializes';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  update public.flight_searches set status = 'failed'
   where id = v_search.id and status in ('created', 'searching')
  returning * into v_search;
  return query select v_search.id, v_search.status;
end;
$fail_flight_consumer_search_084$;

revoke all on function public.complete_flight_consumer_search_v1(uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_flight_consumer_search_v1(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_flight_consumer_search_v1(uuid, integer, jsonb)
  to service_role;
grant execute on function public.fail_flight_consumer_search_v1(uuid, integer)
  to service_role;

-- These are filter-only privileges required by the owner-scoped PostgREST
-- repository queries. Sensitive provider/payment/ticket references remain
-- excluded from the authenticated role's column grants.
grant select (execution_scope_sha256) on public.flight_offers to authenticated;
grant select (execution_scope_sha256) on public.flight_orders to authenticated;
grant select (execution_scope_sha256) on public.flight_payments to authenticated;
grant select (execution_scope_sha256) on public.flight_ticket_documents to authenticated;

do $flight_consumer_preview_084_postcondition$
declare
  v_complete_source text;
  v_fail_source text;
  v_safe_count integer;
begin
  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_search_v1(uuid,integer)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  if v_complete_source is null
    or position('#variable_conflict error' in v_complete_source) = 0
    or position(
      'coalesce(v_offer_json ->> ''local_offer_id'', '''')' in v_complete_source
    ) = 0
    or position(
      '!~ ''^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$''' in v_complete_source
    ) = 0
    or position('Flight local offer identity is malformed' in v_complete_source) = 0
    or position(
      'v_offer_json ->> ''local_offer_id'', null' in v_complete_source
    ) = 0
    or position(
      'Flight local offer identity must equal its durable UUID' in v_complete_source
    ) > 0
    or v_fail_source is null
    or position('#variable_conflict error' in v_fail_source) = 0
    or position('public.flight_offers as offer' in v_fail_source) = 0
    or position('where offer.search_id = v_search.id' in v_fail_source) = 0
    or position(
      'from public.flight_offers where search_id = v_search.id' in v_fail_source
    ) > 0 then
    raise exception 'Flight Consumer Preview migration 084 did not install the search repair';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.fail_flight_consumer_search_v1(uuid,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fail_flight_consumer_search_v1(uuid,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.fail_flight_consumer_search_v1(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Flight Consumer Preview migration 084 function grants are unsafe';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.flight_offers', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_orders', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_payments', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_ticket_documents', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers', 'provider_offer_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers', 'provider_offer_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers', 'provider_payload_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_orders', 'provider_order_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_orders', 'provider_order_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_payments', 'processor_reference_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_payments', 'processor_reference_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_ticket_documents', 'document_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_ticket_documents', 'document_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_offers', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_orders', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_payments', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_ticket_documents', 'execution_scope_sha256', 'SELECT'
  ) then
    raise exception 'Flight Consumer Preview migration 084 repository grants are unsafe';
  end if;

  select count(*)::integer into v_safe_count
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
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 084 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_084_postcondition$;

comment on function public.complete_flight_consumer_search_v1(uuid, integer, jsonb) is
  'Service-role Preview search completion with migration-084 sanitized local-offer identity validation.';
comment on function public.fail_flight_consumer_search_v1(uuid, integer) is
  'Service-role Preview search failure with migration-084 output-parameter-safe offer lookup.';

commit;
