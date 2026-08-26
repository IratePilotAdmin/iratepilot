begin;

-- Forward-only terminal recovery repair. This migration adds no provider or
-- payment dispatch authority. It permits a service-owned recovery worker to
-- rehydrate only the immutable offer-evidence chain that authorized one
-- already-succeeded Duffel TEST create-order request.
do $flight_consumer_preview_097_dependencies$
declare
  v_source text;
  v_actual_sha256 text;
  v_invalid_predicate_count integer;
  v_invalid_provider_field_count integer;
  v_current_time_expiry_count integer;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_searches') is null
    or to_regclass('public.flight_offers') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_offer_evidence_vault') is null
    or to_regclass('public.flight_order_response_evidence_vault') is null
    or to_regclass('public.flight_order_recovery_evidence_vault') is null
    or to_regclass('public.flight_consumer_webhook_ledger') is null
    or to_regprocedure(
      'public.load_flight_offer_evidence_v1(text,uuid,text)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null
    or to_regprocedure(
      'public.validate_flight_consumer_async_order_finalization_v1()'
    ) is null
    or to_regprocedure(
      'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)'
    ) is null then
    raise exception 'Flight Consumer Preview terminal evidence recovery requires migrations 068 through 096';
  end if;
  if to_regprocedure(
    'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
  ) is not null then
    raise exception 'Flight terminal offer-evidence recovery RPC already exists';
  end if;
  if to_regprocedure(
    'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)'
  ) is not null then
    raise exception 'Flight recovery-evidence observation RPC already exists';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight terminal offer-evidence recovery requires reviewed SHA-256 support';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_attribute as attribute
     where attribute.attrelid = 'public.flight_offer_evidence_vault'::regclass
       and attribute.attname in ('deleted_at', 'provider_offer_ref_sha256')
       and not attribute.attisdropped
  ) then
    raise exception 'Flight offer evidence terminal-recovery schema has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.load_flight_offer_evidence_v1(text,uuid,text)'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> '49da2999b8f76eb23e7b020447768829e5f138549da41ee078a8a55f57227860' then
    raise exception 'Flight offer evidence load-row predecessor has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> '057b3c28de09f78322b07166181cf1feeaf8d544a12743a8ba9822b1cbad2bda' then
    raise exception 'Flight Consumer Preview migration 096 predecessor has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   );
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_invalid_predicate_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.deleted_at is not null',
      ''
    ))
  ) / length('    or v_offer_evidence.deleted_at is not null');
  v_invalid_provider_field_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.provider_offer_ref_sha256'
        || chr(10)
        || '      is distinct from v_offer.provider_offer_ref_sha256',
      ''
    ))
  ) / length(
    '    or v_offer_evidence.provider_offer_ref_sha256'
      || chr(10)
      || '      is distinct from v_offer.provider_offer_ref_sha256'
  );
  v_current_time_expiry_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.retention_expires_at <= clock_timestamp()',
      ''
    ))
  ) / length(
    '    or v_offer_evidence.retention_expires_at <= clock_timestamp()'
  );
  if v_source is null
    or v_actual_sha256 <> '93c1e2eb79ba69f39d1ab7ad92ce1023e7b49712cbd0a2b13cccc46a63017533'
    or v_invalid_predicate_count <> 1
    or v_invalid_provider_field_count <> 1
    or v_current_time_expiry_count <> 1
    or position('or v_recovery.deleted_at is not null' in v_source) = 0 then
    raise exception 'Flight async Duffel finalizer predecessor has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.validate_flight_consumer_async_order_finalization_v1()'
   );
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_invalid_predicate_count := (
    length(v_source)
    - length(replace(
      v_source,
      '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
        || chr(10)
        || '     and evidence.deleted_at is null'
        || chr(10)
        || '     and evidence.retention_expires_at > clock_timestamp();',
      ''
    ))
  ) / length(
    '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
      || chr(10)
      || '     and evidence.deleted_at is null'
      || chr(10)
      || '     and evidence.retention_expires_at > clock_timestamp();'
  );
  v_invalid_provider_field_count := (
    length(v_source)
    - length(replace(v_source, 'evidence.provider_offer_ref_sha256', ''))
  ) / length('evidence.provider_offer_ref_sha256');
  v_current_time_expiry_count := (
    length(v_source)
    - length(replace(
      v_source,
      'evidence.retention_expires_at > clock_timestamp()',
      ''
    ))
  ) / length('evidence.retention_expires_at > clock_timestamp()');
  if v_source is null
    or v_actual_sha256 <> '5978f47bb4981847ba9272757415775d5b19643c0f95bcd135d9988d6c3a7b2f'
    or v_invalid_predicate_count <> 1
    or v_invalid_provider_field_count <> 2
    or v_current_time_expiry_count <> 2 then
    raise exception 'Flight async order-finalization validator predecessor has drifted';
  end if;
end;
$flight_consumer_preview_097_dependencies$;

do $flight_consumer_preview_097_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 097 requires relock before repair';
  end if;
end;
$flight_consumer_preview_097_relocked_precondition$;

-- The retained migration-087 finalizer references two columns that have never
-- existed on the append-preserving offer vault and also applies current offer
-- retention to an already-dispatched request. Rebuild the exact reviewed
-- predecessor with those two field references removed and with immutable
-- dispatch-time validity. Recovery evidence remains current and tombstoned.
do $flight_consumer_preview_097_finalizer_repair$
declare
  v_signature constant text :=
    'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)';
  v_oid oid;
  v_source text;
  v_definition text;
  v_actual_sha256 text;
  v_invalid_predicate_count integer;
  v_invalid_provider_field_count integer;
  v_current_time_expiry_count integer;
begin
  v_oid := to_regprocedure(v_signature)::oid;
  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = v_oid;
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_invalid_predicate_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.deleted_at is not null',
      ''
    ))
  ) / length('    or v_offer_evidence.deleted_at is not null');
  v_invalid_provider_field_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.provider_offer_ref_sha256'
        || chr(10)
        || '      is distinct from v_offer.provider_offer_ref_sha256',
      ''
    ))
  ) / length(
    '    or v_offer_evidence.provider_offer_ref_sha256'
      || chr(10)
      || '      is distinct from v_offer.provider_offer_ref_sha256'
  );
  v_current_time_expiry_count := (
    length(v_source)
    - length(replace(
      v_source,
      '    or v_offer_evidence.retention_expires_at <= clock_timestamp()',
      ''
    ))
  ) / length(
    '    or v_offer_evidence.retention_expires_at <= clock_timestamp()'
  );
  if v_source is null
    or v_actual_sha256 <> '93c1e2eb79ba69f39d1ab7ad92ce1023e7b49712cbd0a2b13cccc46a63017533'
    or v_invalid_predicate_count <> 1
    or v_invalid_provider_field_count <> 1
    or v_current_time_expiry_count <> 1 then
    raise exception 'Flight async Duffel finalizer repair source has drifted';
  end if;

  v_definition := regexp_replace(
    pg_get_functiondef(v_oid),
    chr(13) || chr(10),
    chr(10),
    'g'
  );
  v_definition := replace(
    v_definition,
    '    or v_offer_evidence.deleted_at is not null',
    ''
  );
  v_definition := replace(
    v_definition,
    '    or v_offer_evidence.provider_offer_ref_sha256'
      || chr(10)
      || '      is distinct from v_offer.provider_offer_ref_sha256',
    ''
  );
  v_definition := replace(
    v_definition,
    '    or v_offer_evidence.retention_expires_at <= clock_timestamp()',
    '    or v_attempt.dispatch_started_at is null'
      || chr(10)
      || '    or v_attempt.dispatch_started_at < v_offer_evidence.observed_at'
      || chr(10)
      || '    or v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at'
      || chr(10)
      || '    or clock_timestamp() > v_attempt.dispatch_started_at + interval ''7 days'''
  );
  execute v_definition;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(v_signature);
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> 'dfff2494bc5c12a91b2893f5b72efba77d5137dab0d96dcfd30664f602877825'
    or position('v_offer_evidence.deleted_at' in v_source) > 0
    or position(
      'v_offer_evidence.provider_offer_ref_sha256' in v_source
    ) > 0
    or position(
      'v_offer_evidence.retention_expires_at <= clock_timestamp()'
      in v_source
    ) > 0
    or position(
      'v_attempt.dispatch_started_at < v_offer_evidence.observed_at'
      in v_source
    ) = 0
    or position(
      'v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at'
      in v_source
    ) = 0
    or position(
      'clock_timestamp() > v_attempt.dispatch_started_at + interval ''7 days'''
      in v_source
    ) = 0
    or position('or v_recovery.deleted_at is not null' in v_source) = 0 then
    raise exception 'Flight async Duffel finalizer repair did not produce the exact reviewed source';
  end if;
end;
$flight_consumer_preview_097_finalizer_repair$;

-- The order-transition trigger is an independent fail-closed boundary, so it
-- receives the same historical validity repair. The exact multi-line source
-- replacement cannot match the later recovery-evidence predicates, which
-- continue to require provider identity, an untombstoned row, and live
-- retention at finalization time.
do $flight_consumer_preview_097_validator_repair$
declare
  v_signature constant text :=
    'public.validate_flight_consumer_async_order_finalization_v1()';
  v_oid oid;
  v_source text;
  v_definition text;
  v_actual_sha256 text;
  v_offer_block_count integer;
begin
  v_oid := to_regprocedure(v_signature)::oid;
  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = v_oid;
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_offer_block_count := (
    length(v_source)
    - length(replace(
      v_source,
      '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
        || chr(10)
        || '     and evidence.deleted_at is null'
        || chr(10)
        || '     and evidence.retention_expires_at > clock_timestamp();',
      ''
    ))
  ) / length(
    '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
      || chr(10)
      || '     and evidence.deleted_at is null'
      || chr(10)
      || '     and evidence.retention_expires_at > clock_timestamp();'
  );
  if v_source is null
    or v_actual_sha256 <> '5978f47bb4981847ba9272757415775d5b19643c0f95bcd135d9988d6c3a7b2f'
    or v_offer_block_count <> 1 then
    raise exception 'Flight async order-finalization validator repair source has drifted';
  end if;

  v_definition := regexp_replace(
    pg_get_functiondef(v_oid),
    chr(13) || chr(10),
    chr(10),
    'g'
  );
  v_definition := replace(
    v_definition,
    '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
      || chr(10)
      || '     and evidence.deleted_at is null'
      || chr(10)
      || '     and evidence.retention_expires_at > clock_timestamp();',
    '     and v_attempt.dispatch_started_at is not null'
      || chr(10)
      || '     and evidence.observed_at <= v_attempt.dispatch_started_at'
      || chr(10)
      || '     and v_attempt.dispatch_started_at < evidence.retention_expires_at'
      || chr(10)
      || '     and clock_timestamp() <= v_attempt.dispatch_started_at + interval ''7 days'';'
  );
  execute v_definition;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(v_signature);
  v_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(v_source, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> '88784c581dbef9dc342a199cb8bd77cb3e9cc30b4f2cd4c6a0d98a4c41e1c850'
    or position(
      '     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'
        || chr(10)
        || '     and evidence.deleted_at is null'
        || chr(10)
        || '     and evidence.retention_expires_at > clock_timestamp();'
      in v_source
    ) > 0
    or position(
      'evidence.observed_at <= v_attempt.dispatch_started_at' in v_source
    ) = 0
    or position(
      'v_attempt.dispatch_started_at < evidence.retention_expires_at'
      in v_source
    ) = 0
    or position(
      'clock_timestamp() <= v_attempt.dispatch_started_at + interval ''7 days'''
      in v_source
    ) = 0
    or (
      length(v_source)
      - length(replace(v_source, 'evidence.deleted_at is null', ''))
    ) / length('evidence.deleted_at is null') <> 1
    or (
      length(v_source)
      - length(replace(
        v_source,
        'evidence.retention_expires_at > clock_timestamp()',
        ''
      ))
    ) / length('evidence.retention_expires_at > clock_timestamp()') <> 1 then
    raise exception 'Flight async order-finalization validator repair did not produce the exact reviewed source';
  end if;
end;
$flight_consumer_preview_097_validator_repair$;

-- This read-only boundary deliberately does not consult current offer or
-- reprice validity. It can return an expired encrypted offer envelope only
-- when the immutable provider dispatch instant proves that the exact two-row
-- evidence chain was valid when the already-successful request was sent.
create function public.load_flight_offer_evidence_for_terminal_recovery_v1(
  p_attempt_id uuid,
  p_order_id uuid,
  p_customer_id uuid,
  p_execution_scope_sha256 text,
  p_receipt_sha256 text
)
returns table (
  evidence_id uuid,
  customer_id uuid,
  search_id uuid,
  offer_id uuid,
  stage text,
  predecessor_receipt_sha256 text,
  observed_at timestamptz,
  retention_expires_at timestamptz,
  raw_body_sha256 text,
  evidence_sha256 text,
  snapshot_sha256 text,
  record_sha256 text,
  receipt_sha256 text,
  key_version text,
  iv_base64url text,
  auth_tag_base64url text,
  ciphertext_base64url text,
  aad_sha256 text,
  record_hmac_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $load_flight_offer_evidence_for_terminal_recovery$
#variable_conflict error
declare
  v_now timestamptz := clock_timestamp();
  v_order public.flight_orders;
  v_search public.flight_searches;
  v_offer public.flight_offers;
  v_attempt public.flight_provider_request_attempts;
  v_payment public.flight_payments;
  v_response public.flight_order_response_evidence_vault;
  v_refreshed public.flight_offer_evidence_vault;
  v_predecessor public.flight_offer_evidence_vault;
  v_selected public.flight_offer_evidence_vault;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight terminal offer evidence recovery is service-role only';
  end if;
  if p_attempt_id is null or p_order_id is null or p_customer_id is null
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_receipt_sha256 is null
    or p_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight terminal offer evidence recovery input is invalid';
  end if;

  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
   for share;
  if v_order.id is null
    or v_order.customer_id is distinct from p_customer_id
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_order.provider_code <> 'duffel'
    or v_order.status not in ('order_creating', 'requires_review')
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null then
    raise exception 'Flight terminal offer evidence recovery order is unavailable';
  end if;

  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id
   for share;
  if v_attempt.id is null
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> 2
    or v_attempt.retry_authorized
    or v_attempt.dispatch_started_at is null
    or v_attempt.completed_at is null
    or v_attempt.completed_at < v_attempt.dispatch_started_at
    or v_attempt.terminal_http_status not between 200 and 299
    or v_attempt.terminal_response_sha256 is null
    or v_attempt.terminal_response_sha256 !~ '^[0-9a-f]{64}$'
    or v_attempt.terminal_response_bytes is null
    or v_attempt.terminal_response_bytes <= 0
    or v_attempt.terminal_receipt_sha256 is null
    or v_attempt.terminal_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or v_now < v_attempt.dispatch_started_at
    or v_now > v_attempt.dispatch_started_at + interval '7 days' then
    raise exception 'Flight terminal offer evidence recovery attempt is unavailable';
  end if;

  select payment.* into v_payment
    from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.status = 'captured'
   for share;
  if v_payment.id is null
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency is distinct from v_order.currency
    or v_payment.authorized_cents is distinct from v_order.total_cents
    or v_payment.captured_cents is distinct from v_order.total_cents
    or v_payment.refunded_cents <> 0
    or v_payment.authorized_at is null
    or v_payment.captured_at is null then
    raise exception 'Flight terminal offer evidence recovery payment is unavailable';
  end if;

  select search.* into v_search
    from public.flight_searches as search
   where search.id = v_order.search_id
   for share;
  select offer.* into v_offer
    from public.flight_offers as offer
   where offer.id = v_order.offer_id
   for share;
  if v_search.id is null
    or v_search.customer_id is distinct from v_order.customer_id
    or v_search.execution_mode <> 'test'
    or v_search.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_offer.id is null
    or v_offer.search_id is distinct from v_search.id
    or v_offer.provider_code <> 'duffel'
    or v_offer.execution_mode <> 'test'
    or v_offer.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256 then
    raise exception 'Flight terminal offer evidence recovery search or offer is unavailable';
  end if;

  select evidence.* into v_response
    from public.flight_order_response_evidence_vault as evidence
   where evidence.attempt_id = v_attempt.id
   for share;
  if v_response.id is null
    or v_response.order_id is distinct from v_order.id
    or v_response.customer_id is distinct from v_order.customer_id
    or v_response.execution_mode <> 'test'
    or v_response.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_response.provider_response_sha256
      is distinct from v_attempt.terminal_response_sha256
    or v_response.evidence_receipt_sha256 is null
    or v_response.key_version is null
    or v_response.iv_base64url is null
    or v_response.auth_tag_base64url is null
    or v_response.ciphertext_base64url is null
    or v_response.aad_sha256 is null
    or v_response.ciphertext_sha256 is null
    or v_response.deleted_at is not null
    or v_response.retention_expires_at <= v_now
    or v_response.created_at < v_attempt.completed_at
    or v_response.created_at > v_now then
    raise exception 'Flight terminal offer evidence recovery original response is unavailable';
  end if;

  select evidence.* into v_refreshed
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
   for share;
  if v_refreshed.id is null
    or v_refreshed.customer_id is distinct from v_order.customer_id
    or v_refreshed.search_id is distinct from v_order.search_id
    or v_refreshed.offer_id is distinct from v_order.offer_id
    or v_refreshed.provider_code <> 'duffel'
    or v_refreshed.execution_mode <> 'test'
    or v_refreshed.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_refreshed.stage <> 'refreshed'
    or v_refreshed.reprice_receipt_id
      is distinct from v_order.reprice_receipt_id
    or v_refreshed.predecessor_receipt_sha256 is null
    or v_refreshed.local_offer_id is null
    or v_attempt.dispatch_started_at < v_refreshed.observed_at
    or v_attempt.dispatch_started_at >= v_refreshed.retention_expires_at
    or v_refreshed.retention_expires_at
      > v_refreshed.observed_at + interval '7 days' then
    raise exception 'Flight terminal refreshed offer evidence is unavailable';
  end if;

  select evidence.* into v_predecessor
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_refreshed.predecessor_receipt_sha256
   for share;
  if v_predecessor.id is null
    or v_predecessor.customer_id is distinct from v_refreshed.customer_id
    or v_predecessor.search_id is distinct from v_refreshed.search_id
    or v_predecessor.offer_id is distinct from v_refreshed.offer_id
    or v_predecessor.provider_code <> 'duffel'
    or v_predecessor.execution_mode <> 'test'
    or v_predecessor.execution_scope_sha256
      is distinct from v_refreshed.execution_scope_sha256
    or v_predecessor.stage <> 'initial'
    or v_predecessor.predecessor_receipt_sha256 is not null
    or v_predecessor.reprice_receipt_id is not null
    or v_predecessor.local_offer_id is distinct from v_refreshed.local_offer_id
    or v_predecessor.retention_expires_at
      is distinct from v_refreshed.retention_expires_at
    or v_predecessor.observed_at > v_refreshed.observed_at
    or v_attempt.dispatch_started_at < v_predecessor.observed_at
    or v_attempt.dispatch_started_at >= v_predecessor.retention_expires_at
    or v_predecessor.retention_expires_at
      > v_predecessor.observed_at + interval '7 days' then
    raise exception 'Flight terminal initial offer evidence is unavailable';
  end if;

  if p_receipt_sha256 = v_refreshed.receipt_sha256 then
    v_selected := v_refreshed;
  elsif p_receipt_sha256 = v_predecessor.receipt_sha256 then
    v_selected := v_predecessor;
  else
    raise exception 'Flight terminal offer evidence receipt is outside the authorized chain';
  end if;

  return query select
    v_selected.id, v_selected.customer_id, v_selected.search_id,
    v_selected.offer_id, v_selected.stage,
    v_selected.predecessor_receipt_sha256, v_selected.observed_at,
    v_selected.retention_expires_at, v_selected.raw_body_sha256,
    v_selected.evidence_sha256, v_selected.snapshot_sha256,
    v_selected.record_sha256, v_selected.receipt_sha256,
    v_selected.key_version, v_selected.iv_base64url,
    v_selected.auth_tag_base64url, v_selected.ciphertext_base64url,
    v_selected.aad_sha256, v_selected.record_hmac_sha256;
end;
$load_flight_offer_evidence_for_terminal_recovery$;

-- A recovered GET-order envelope's immutable observation instant is part of
-- its authenticated application artifact. Expose only that timestamp through
-- the same exact terminal chain; direct vault access and ciphertext disclosure
-- remain prohibited.
create function public.get_flight_consumer_duffel_recovery_evidence_observation_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text
)
returns table (created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $get_flight_consumer_duffel_recovery_evidence_observation$
#variable_conflict error
declare
  v_now timestamptz := clock_timestamp();
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_ledger public.flight_consumer_webhook_ledger;
  v_evidence public.flight_order_recovery_evidence_vault;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight recovery evidence observation is service-role only';
  end if;
  if p_customer_id is null or p_order_id is null or p_ledger_id is null
    or p_recovery_evidence_receipt_sha256 is null
    or p_recovery_evidence_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight recovery evidence observation input is invalid';
  end if;

  select flight_order.* into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for share;
  if v_order.id is null
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status not in ('requires_review', 'ticketed') then
    raise exception 'Flight recovery evidence observation order is unavailable';
  end if;

  select ledger.* into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id
   for share;
  if v_ledger.id is null
    or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_ledger.order_id is distinct from v_order.id
    or v_ledger.provider_attempt_id is null
    or v_ledger.provider_offer_ref_sha256 is null
    or v_ledger.provider_order_ref_sha256 is null
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.state <> 'processed'
    or v_ledger.revision <> 2 then
    raise exception 'Flight recovery evidence observation ledger is unavailable';
  end if;

  select attempt.* into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = v_ledger.provider_attempt_id
   for share;
  if v_attempt.id is null
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> 2
    or v_attempt.retry_authorized
    or v_attempt.terminal_response_sha256 is null then
    raise exception 'Flight recovery evidence observation attempt is unavailable';
  end if;

  select evidence.* into v_evidence
    from public.flight_order_recovery_evidence_vault as evidence
   where evidence.ledger_id = v_ledger.id
     and evidence.recovery_evidence_receipt_sha256
       = p_recovery_evidence_receipt_sha256
   for share;
  if v_evidence.id is null
    or v_evidence.attempt_id is distinct from v_attempt.id
    or v_evidence.order_id is distinct from v_order.id
    or v_evidence.customer_id is distinct from v_order.customer_id
    or v_evidence.execution_mode <> 'test'
    or v_evidence.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_evidence.provider_offer_ref_sha256
      is distinct from v_ledger.provider_offer_ref_sha256
    or v_evidence.provider_order_ref_sha256
      is distinct from v_ledger.provider_order_ref_sha256
    or v_evidence.webhook_verification_receipt_sha256
      is distinct from v_ledger.verification_receipt_sha256
    or v_evidence.recovery_request_sha256 is null
    or v_evidence.provider_response_sha256 is null
    or v_evidence.recovery_authority_receipt_sha256 is null
    or v_evidence.key_version is null
    or v_evidence.iv_base64url is null
    or v_evidence.auth_tag_base64url is null
    or v_evidence.ciphertext_base64url is null
    or v_evidence.aad_sha256 is null
    or v_evidence.ciphertext_sha256 is null
    or v_evidence.deleted_at is not null
    or v_evidence.created_at > v_now
    or v_evidence.retention_expires_at <= v_now
    or v_evidence.retention_expires_at
      > v_evidence.created_at + interval '7 days' then
    raise exception 'Flight recovery evidence observation is unavailable';
  end if;

  return query select v_evidence.created_at;
end;
$get_flight_consumer_duffel_recovery_evidence_observation$;

revoke all on function public.load_flight_offer_evidence_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.load_flight_offer_evidence_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) to service_role;

revoke all on function public.get_flight_consumer_duffel_recovery_evidence_observation_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_flight_consumer_duffel_recovery_evidence_observation_v1(
  uuid, uuid, uuid, text
) to service_role;

revoke all on function public.validate_flight_consumer_async_order_finalization_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;

comment on function public.load_flight_offer_evidence_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) is 'Read-only service-role recovery of one initial/refreshed encrypted offer envelope after a succeeded Duffel TEST request; immutable dispatch-time validity is required and provider redispatch is never authorized.';
comment on function public.get_flight_consumer_duffel_recovery_evidence_observation_v1(
  uuid, uuid, uuid, text
) is 'Returns only the immutable created_at of one current, untombstoned Duffel TEST recovery envelope through its exact order/ledger/receipt chain; ciphertext and provider dispatch authority are never exposed.';
comment on function public.validate_flight_consumer_async_order_finalization_v1()
  is 'Migration-085 order-finalization trigger validator with migration-097 immutable dispatch-time offer-evidence recovery.';
comment on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) is 'Service-role Preview async Duffel convergence with migration-087 projection repairs and migration-097 immutable dispatch-time offer-evidence recovery.';

do $flight_consumer_preview_097_postcondition$
declare
  v_safe_count integer;
  v_loader_source text;
  v_observation_source text;
  v_validator_source text;
  v_finalizer_source text;
  v_loader_sha256 text;
  v_observation_sha256 text;
  v_validator_sha256 text;
  v_finalizer_sha256 text;
  v_loader_security_definer boolean;
  v_observation_security_definer boolean;
  v_validator_security_definer boolean;
  v_finalizer_security_definer boolean;
  v_loader_config text[];
  v_observation_config text[];
  v_validator_config text[];
  v_finalizer_config text[];
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

  select routine.prosrc, routine.prosecdef, routine.proconfig
    into v_loader_source, v_loader_security_definer, v_loader_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
   );
  v_loader_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_loader_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select routine.prosrc, routine.prosecdef, routine.proconfig
    into v_observation_source, v_observation_security_definer,
      v_observation_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)'
   );
  v_observation_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_observation_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select routine.prosrc, routine.prosecdef, routine.proconfig
    into v_validator_source, v_validator_security_definer,
      v_validator_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.validate_flight_consumer_async_order_finalization_v1()'
   );
  v_validator_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_validator_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select routine.prosrc, routine.prosecdef, routine.proconfig
    into v_finalizer_source, v_finalizer_security_definer,
      v_finalizer_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   );
  v_finalizer_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_finalizer_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_safe_count <> 1
    or v_loader_source is null
    or not coalesce(v_loader_security_definer, false)
    or v_loader_sha256 <> 'd1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172'
    or not ('search_path=pg_catalog, public, extensions' = any(v_loader_config))
    or position('#variable_conflict error' in v_loader_source) = 0
    or position(
      'v_order.status not in (''order_creating'', ''requires_review'')'
      in v_loader_source
    ) = 0
    or position('v_attempt.dispatch_started_at < v_refreshed.observed_at' in v_loader_source) = 0
    or position('v_attempt.dispatch_started_at >= v_refreshed.retention_expires_at' in v_loader_source) = 0
    or position('v_attempt.dispatch_started_at < v_predecessor.observed_at' in v_loader_source) = 0
    or position('v_attempt.dispatch_started_at >= v_predecessor.retention_expires_at' in v_loader_source) = 0
    or position('v_now > v_attempt.dispatch_started_at + interval ''7 days''' in v_loader_source) = 0
    or position('v_response.deleted_at is not null' in v_loader_source) = 0
    or position('v_response.retention_expires_at <= v_now' in v_loader_source) = 0
    or pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    )) is distinct from pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_v1(text,uuid,text)'
    ))
    or not has_function_privilege(
      'service_role',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_table_privilege(
      'service_role', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'service_role', 'public.flight_order_response_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_order_response_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_order_response_evidence_vault', 'SELECT'
    )
    or exists (
      select 1
        from pg_catalog.pg_attribute as attribute
       where attribute.attrelid = 'public.flight_offer_evidence_vault'::regclass
         and attribute.attname in ('deleted_at', 'provider_offer_ref_sha256')
         and not attribute.attisdropped
    ) then
    raise exception 'Flight Consumer Preview migration 097 loader postcondition failed';
  end if;

  if v_observation_source is null
    or not coalesce(v_observation_security_definer, false)
    or v_observation_sha256 <> 'b590fcdec6e55c09c23be2e42f026be010bc655b78ededeccee5c01d3d6fdde8'
    or not (
      'search_path=pg_catalog, public, extensions' = any(v_observation_config)
    )
    or position('#variable_conflict error' in v_observation_source) = 0
    or position('v_ledger.state <> ''processed''' in v_observation_source) = 0
    or position('v_ledger.revision <> 2' in v_observation_source) = 0
    or position('v_attempt.state <> ''succeeded''' in v_observation_source) = 0
    or position('v_attempt.revision <> 2' in v_observation_source) = 0
    or position('v_evidence.deleted_at is not null' in v_observation_source) = 0
    or position(
      'v_evidence.retention_expires_at <= v_now' in v_observation_source
    ) = 0
    or position(
      'return query select v_evidence.created_at' in v_observation_source
    ) = 0
    or position('ciphertext_base64url' in pg_get_function_result(
      to_regprocedure(
        'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)'
      )
    )) > 0
    or position('created_at' in pg_get_function_result(
      to_regprocedure(
        'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)'
      )
    )) = 0
    or not has_function_privilege(
      'service_role',
      'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or has_table_privilege(
      'service_role', 'public.flight_order_recovery_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_order_recovery_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_order_recovery_evidence_vault', 'SELECT'
    ) then
    raise exception 'Flight Consumer Preview migration 097 observation postcondition failed';
  end if;

  if v_validator_source is null
    or not coalesce(v_validator_security_definer, false)
    or v_validator_sha256 <> '88784c581dbef9dc342a199cb8bd77cb3e9cc30b4f2cd4c6a0d98a4c41e1c850'
    or not (
      'search_path=pg_catalog, public, extensions' = any(v_validator_config)
    )
    or position(
      'evidence.observed_at <= v_attempt.dispatch_started_at'
      in v_validator_source
    ) = 0
    or position(
      'v_attempt.dispatch_started_at < evidence.retention_expires_at'
      in v_validator_source
    ) = 0
    or position(
      'clock_timestamp() <= v_attempt.dispatch_started_at + interval ''7 days'''
      in v_validator_source
    ) = 0
    or (
      length(v_validator_source)
      - length(replace(
        v_validator_source,
        'evidence.provider_offer_ref_sha256',
        ''
      ))
    ) / length('evidence.provider_offer_ref_sha256') <> 1
    or (
      length(v_validator_source)
      - length(replace(
        v_validator_source,
        'evidence.deleted_at is null',
        ''
      ))
    ) / length('evidence.deleted_at is null') <> 1
    or (
      length(v_validator_source)
      - length(replace(
        v_validator_source,
        'evidence.retention_expires_at > clock_timestamp()',
        ''
      ))
    ) / length('evidence.retention_expires_at > clock_timestamp()') <> 1
    or has_function_privilege(
      'service_role',
      'public.validate_flight_consumer_async_order_finalization_v1()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.validate_flight_consumer_async_order_finalization_v1()',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.validate_flight_consumer_async_order_finalization_v1()',
      'EXECUTE'
    )
    or not exists (
      select 1
        from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.flight_orders'::regclass
         and trigger_row.tgname = 'flight_orders_async_finalization_guard'
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled = 'O'
         and trigger_row.tgfoid = to_regprocedure(
           'public.validate_flight_consumer_async_order_finalization_v1()'
         )
    ) then
    raise exception 'Flight Consumer Preview migration 097 validator postcondition failed';
  end if;

  if v_finalizer_source is null
    or not coalesce(v_finalizer_security_definer, false)
    or v_finalizer_sha256 <> 'dfff2494bc5c12a91b2893f5b72efba77d5137dab0d96dcfd30664f602877825'
    or not (
      'search_path=pg_catalog, public, extensions' = any(v_finalizer_config)
    )
    or position('v_offer_evidence.deleted_at' in v_finalizer_source) > 0
    or position(
      'v_offer_evidence.provider_offer_ref_sha256' in v_finalizer_source
    ) > 0
    or position(
      'v_offer_evidence.retention_expires_at <= clock_timestamp()'
      in v_finalizer_source
    ) > 0
    or position(
      'v_attempt.dispatch_started_at < v_offer_evidence.observed_at'
      in v_finalizer_source
    ) = 0
    or position(
      'v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at'
      in v_finalizer_source
    ) = 0
    or position(
      'clock_timestamp() > v_attempt.dispatch_started_at + interval ''7 days'''
      in v_finalizer_source
    ) = 0
    or position(
      'or v_recovery.deleted_at is not null' in v_finalizer_source
    ) = 0
    or not has_function_privilege(
      'service_role',
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 097 finalizer postcondition failed';
  end if;
end;
$flight_consumer_preview_097_postcondition$;

commit;
