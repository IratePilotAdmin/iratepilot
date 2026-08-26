begin;

-- Forward-only repair for the private 089 Duffel create-order claim body retained
-- behind the 092 active-reconciliation wrapper. flight_offer_evidence_vault is
-- retention-deleted and has never had a deleted_at column, so the inherited
-- predicate fails before its dispatch CAS can be evaluated.
do $flight_consumer_preview_095_dependencies$
declare
  v_source text;
  v_actual_sha256 text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_offer_evidence_vault') is null
    or to_regprocedure(
      'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)'
    ) is null
    or to_regprocedure(
      'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview Duffel claim repair requires migrations 068 through 094';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_attribute as attribute
     where attribute.attrelid = 'public.flight_offer_evidence_vault'::regclass
       and attribute.attname = 'deleted_at'
       and not attribute.attisdropped
  ) then
    raise exception 'Flight offer evidence retention contract has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> '88c882ace38574d0e82f06aabbda85f4eda2502c91afcf9eab6e1d4dd9983b64' then
    raise exception 'Flight Consumer Preview migration 094 predecessor has drifted';
  end if;
end;
$flight_consumer_preview_095_dependencies$;

do $flight_consumer_preview_095_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 095 requires relock before repair';
  end if;
end;
$flight_consumer_preview_095_relocked_precondition$;

-- Rebuild only the exact retained 089 body. The full normalized source hash and
-- one-item predicate inventory prevent this textual repair from widening any
-- other provider authority or changing the public 092 wrapper.
do $flight_consumer_preview_095_repair$
declare
  v_private_signature constant text :=
    'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)';
  v_public_signature constant text :=
    'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)';
  v_oid oid;
  v_source text;
  v_public_source text;
  v_definition text;
  v_normalized_source text;
  v_actual_sha256 text;
  v_invalid_predicate_count integer;
begin
  v_oid := to_regprocedure(v_private_signature)::oid;
  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = v_oid;
  select routine.prosrc into v_public_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(v_public_signature);
  if v_source is null or v_public_source is null then
    raise exception 'Flight Duffel claim repair source is unavailable';
  end if;

  v_normalized_source := replace(v_source, chr(13) || chr(10), chr(10));
  v_actual_sha256 := encode(
    extensions.digest(convert_to(v_normalized_source, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_actual_sha256 <> '5689a862cbc518ffe3df2c343b103954e624755fe08e73983bcf775f388d1852' then
    raise exception 'Flight Duffel private claim predecessor has drifted';
  end if;

  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_public_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  if v_actual_sha256 <> 'ca1bda0019b1f4302fdb1ddadb762d12909a153afd67f28375a204bd35532561' then
    raise exception 'Flight Duffel public claim wrapper has drifted';
  end if;

  v_invalid_predicate_count := (
    length(v_source)
    - length(replace(
      v_source,
      'and evidence.deleted_at is null for share;',
      ''
    ))
  ) / length('and evidence.deleted_at is null for share;');
  if v_invalid_predicate_count <> 1 then
    raise exception 'Flight Duffel invalid evidence predicate inventory has drifted';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_definition := replace(
    v_definition,
    'and evidence.deleted_at is null for share;',
    'for share;'
  );
  execute v_definition;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(v_private_signature);
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> '0ab4de525bb7a4f53cf307a837701da434f052573233cae8b57f00b68f8c75c3' then
    raise exception 'Flight Duffel private claim repair did not produce the exact reviewed source';
  end if;
end;
$flight_consumer_preview_095_repair$;

revoke all on function public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) to service_role;

comment on function public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
  uuid, integer, text, text, text, text, text
) is 'Private 089 Duffel TEST claim authority retained behind the 092 wrapper; offer evidence is proven by exact identity, refreshed stage, scope, and unexpired retention.';
comment on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) is 'Claims one Duffel TEST create-order attempt only when no active order/payment reconciliation exists; the repaired private authority checks exact unexpired offer evidence without referencing a nonexistent tombstone column.';

do $flight_consumer_preview_095_postcondition$
declare
  v_safe_count integer;
  v_private_source text;
  v_public_source text;
  v_private_sha256 text;
  v_public_sha256 text;
  v_private_security_definer boolean;
  v_public_security_definer boolean;
  v_private_config text[];
  v_public_config text[];
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
    into v_private_source, v_private_security_definer, v_private_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)'
   );
  select routine.prosrc, routine.prosecdef, routine.proconfig
    into v_public_source, v_public_security_definer, v_public_config
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)'
   );
  v_private_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_private_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_public_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_public_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_safe_count <> 1
    or v_private_source is null
    or v_private_sha256 <> '0ab4de525bb7a4f53cf307a837701da434f052573233cae8b57f00b68f8c75c3'
    or position('evidence.deleted_at' in v_private_source) > 0
    or position('evidence.retention_expires_at > v_now' in v_private_source) = 0
    or position('evidence.reprice_receipt_id = v_order.reprice_receipt_id' in v_private_source) = 0
    or position('evidence.stage = ''refreshed''' in v_private_source) = 0
    or position('#variable_conflict error' in v_private_source) = 0
    or not v_private_security_definer
    or not ('search_path=pg_catalog, public, extensions' = any(v_private_config))
    or v_public_source is null
    or v_public_sha256 <> 'ca1bda0019b1f4302fdb1ddadb762d12909a153afd67f28375a204bd35532561'
    or position(
      'claim_flight_consumer_duffel_order_attempt_pre092_v1'
      in v_public_source
    ) = 0
    or position('Active Flight reconciliation blocks Duffel dispatch' in v_public_source) = 0
    or not v_public_security_definer
    or not ('search_path=pg_catalog, public, extensions' = any(v_public_config))
    or has_function_privilege(
      'service_role',
      'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    or exists (
      select 1
        from pg_catalog.pg_attribute as attribute
       where attribute.attrelid = 'public.flight_offer_evidence_vault'::regclass
         and attribute.attname = 'deleted_at'
         and not attribute.attisdropped
    ) then
    raise exception 'Flight Consumer Preview migration 095 postcondition failed';
  end if;
end;
$flight_consumer_preview_095_postcondition$;

commit;
