begin;

do $flight_consumer_preview_094_dependencies$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_consumer_completion_leases') is null
    or to_regprocedure(
      'public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)'
    ) is null
    or to_regprocedure(
      'public.heartbeat_flight_consumer_completion_lease_v1(uuid,integer,text,integer)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)'
    ) is null
    or to_regprocedure(
      'public.release_flight_consumer_completion_lease_v1(uuid,integer,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview completion lease repair requires migrations 068 through 093';
  end if;
end;
$flight_consumer_preview_094_dependencies$;

do $flight_consumer_preview_094_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 094 requires relock before repair';
  end if;
end;
$flight_consumer_preview_094_relocked_precondition$;

-- The four 091 lease RPCs deliberately use #variable_conflict error. Six
-- UPDATE predicates were not relation-qualified, so PostgreSQL interpreted ten
-- OUT-parameter/table-column references as ambiguous before any workflow work.
-- Rebuild only those exact installed function definitions, adding an UPDATE
-- alias and explicit CAS predicate qualification. Normalized source hashes make
-- the predecessor proof independent of LF/CRLF transport through SQL editors.
do $flight_consumer_preview_094_repair$
declare
  v_expected record;
  v_oid oid;
  v_source text;
  v_definition text;
  v_normalized_source text;
  v_actual_sha256 text;
  v_count integer;
begin
  for v_expected in
    select *
      from (values
        (
          'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)',
          'e5cdbca26fdd2c017eb855baf19660bb4f66ef4624cf0ee64c214f0701e94a0e',
          'f3263f27218516e8418f3612b1ebbb681aa75996a90a3734fbcf77326069d914',
          2, 2, 2, 1, 0
        ),
        (
          'public.heartbeat_flight_consumer_completion_lease_v1(uuid,integer,text,integer)',
          '4ee0ed9156f1f9aa7dc44379d33351e237ebd3ddfaf07b45e4f473834de68cc7',
          '467af39b293c6bc70df3c65d064ccc9b76e1587e37c8b53e0dd870307a461d28',
          1, 1, 1, 1, 1
        ),
        (
          'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)',
          '2cb86d091933c89fc7f9baf7f8535a6e80411f37cba759476de43a4f313a8fb8',
          '88c882ace38574d0e82f06aabbda85f4eda2502c91afcf9eab6e1d4dd9983b64',
          1, 1, 1, 1, 1
        ),
        (
          'public.release_flight_consumer_completion_lease_v1(uuid,integer,text,text)',
          '389c25a81d1d82771898069f0bf66301a5eb814afc06a271e382b13f2cfbcd37',
          '9df55dc3b6c719a3c6c3c261746910287df346cfcfd2c6be9a9fd30d42426c93',
          2, 2, 2, 1, 1
        )
      ) as expected(
        signature,
        predecessor_sha256,
        repaired_sha256,
        update_count,
        order_predicate_count,
        revision_predicate_count,
        state_predicate_count,
        token_predicate_count
      )
  loop
    v_oid := to_regprocedure(v_expected.signature)::oid;
    select routine.prosrc into v_source
      from pg_catalog.pg_proc as routine
     where routine.oid = v_oid;
    if v_source is null then
      raise exception 'Flight completion lease repair source is unavailable';
    end if;

    v_normalized_source := replace(v_source, chr(13) || chr(10), chr(10));
    v_actual_sha256 := encode(
      extensions.digest(convert_to(v_normalized_source, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_actual_sha256 <> v_expected.predecessor_sha256 then
      raise exception 'Flight completion lease predecessor has drifted';
    end if;

    v_count := (
      length(v_source)
      - length(replace(v_source, 'update public.flight_consumer_completion_leases', ''))
    ) / length('update public.flight_consumer_completion_leases');
    if v_count <> v_expected.update_count then
      raise exception 'Flight completion lease UPDATE inventory has drifted';
    end if;
    v_count := (
      length(v_source) - length(replace(v_source, 'where order_id = p_order_id', ''))
    ) / length('where order_id = p_order_id');
    if v_count <> v_expected.order_predicate_count then
      raise exception 'Flight completion lease order predicate inventory has drifted';
    end if;
    v_count := (
      length(v_source) - length(replace(v_source, 'and lease_revision =', ''))
    ) / length('and lease_revision =');
    if v_count <> v_expected.revision_predicate_count then
      raise exception 'Flight completion lease revision predicate inventory has drifted';
    end if;
    v_count := (
      length(v_source) - length(replace(v_source, 'and lease_state =', ''))
    ) / length('and lease_state =');
    if v_count <> v_expected.state_predicate_count then
      raise exception 'Flight completion lease state predicate inventory has drifted';
    end if;
    v_count := (
      length(v_source) - length(replace(v_source, 'and lease_token_sha256 =', ''))
    ) / length('and lease_token_sha256 =');
    if v_count <> v_expected.token_predicate_count then
      raise exception 'Flight completion lease token predicate inventory has drifted';
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_definition := replace(
      v_definition,
      'update public.flight_consumer_completion_leases',
      'update public.flight_consumer_completion_leases as completion_lease'
    );
    v_definition := replace(
      v_definition,
      'where order_id = p_order_id',
      'where completion_lease.order_id = p_order_id'
    );
    v_definition := replace(
      v_definition,
      'and lease_revision =',
      'and completion_lease.lease_revision ='
    );
    v_definition := replace(
      v_definition,
      'and lease_state =',
      'and completion_lease.lease_state ='
    );
    v_definition := replace(
      v_definition,
      'and lease_token_sha256 =',
      'and completion_lease.lease_token_sha256 ='
    );
    execute v_definition;

    select routine.prosrc into v_source
      from pg_catalog.pg_proc as routine
     where routine.oid = to_regprocedure(v_expected.signature);
    v_normalized_source := replace(v_source, chr(13) || chr(10), chr(10));
    v_actual_sha256 := encode(
      extensions.digest(convert_to(v_normalized_source, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_actual_sha256 <> v_expected.repaired_sha256 then
      raise exception 'Flight completion lease repair did not produce the exact reviewed source';
    end if;
  end loop;
end;
$flight_consumer_preview_094_repair$;

revoke all on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) to service_role;
grant execute on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) to service_role;
grant execute on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) to service_role;
grant execute on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) to service_role;

comment on function public.acquire_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, text, text, integer
) is 'Acquires/reclaims one exact completion owner with relation-qualified CAS predicates; redispatch authority is always false.';
comment on function public.heartbeat_flight_consumer_completion_lease_v1(
  uuid, integer, text, integer
) is 'Extends only the exact unexpired completion owner through relation-qualified CAS predicates.';
comment on function public.complete_flight_consumer_completion_lease_v1(
  uuid, integer, text, text, integer
) is 'Closes a completion lease only after exact ticket/capture/provider evidence through relation-qualified CAS predicates.';
comment on function public.release_flight_consumer_completion_lease_v1(
  uuid, integer, text, text
) is 'Releases/replays one completion lease without supplier redispatch through relation-qualified CAS predicates.';

do $flight_consumer_preview_094_postcondition$
declare
  v_safe_count integer;
  v_signature text;
  v_source text;
  v_expected_sha256 text;
  v_actual_sha256 text;
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
    raise exception 'Flight Consumer Preview migration 094 changed the relocked posture';
  end if;

  for v_signature, v_expected_sha256 in
    select * from (values
      (
        'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)',
        'f3263f27218516e8418f3612b1ebbb681aa75996a90a3734fbcf77326069d914'
      ),
      (
        'public.heartbeat_flight_consumer_completion_lease_v1(uuid,integer,text,integer)',
        '467af39b293c6bc70df3c65d064ccc9b76e1587e37c8b53e0dd870307a461d28'
      ),
      (
        'public.complete_flight_consumer_completion_lease_v1(uuid,integer,text,text,integer)',
        '88c882ace38574d0e82f06aabbda85f4eda2502c91afcf9eab6e1d4dd9983b64'
      ),
      (
        'public.release_flight_consumer_completion_lease_v1(uuid,integer,text,text)',
        '9df55dc3b6c719a3c6c3c261746910287df346cfcfd2c6be9a9fd30d42426c93'
      )
    ) as expected(signature, source_sha256)
  loop
    select routine.prosrc into v_source
      from pg_catalog.pg_proc as routine
     where routine.oid = to_regprocedure(v_signature);
    v_actual_sha256 := encode(
      extensions.digest(
        convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if v_source is null
      or v_actual_sha256 <> v_expected_sha256
      or position('#variable_conflict error' in v_source) = 0
      or position('update public.flight_consumer_completion_leases as completion_lease' in v_source) = 0
      or position('where order_id = p_order_id' in v_source) > 0
      or position('and lease_revision =' in v_source) > 0
      or position('and lease_state =' in v_source) > 0
      or not has_function_privilege('service_role', v_signature, 'EXECUTE')
      or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'Flight Consumer Preview migration 094 function postcondition failed';
    end if;
  end loop;

  if not exists (
      select 1 from pg_catalog.pg_class as relation
       where relation.oid = 'public.flight_consumer_completion_leases'::regclass
         and relation.relrowsecurity
         and relation.relforcerowsecurity
    )
    or has_table_privilege('service_role', 'public.flight_consumer_completion_leases', 'SELECT')
    or has_table_privilege('authenticated', 'public.flight_consumer_completion_leases', 'SELECT')
    or has_table_privilege('anon', 'public.flight_consumer_completion_leases', 'SELECT') then
    raise exception 'Flight Consumer Preview migration 094 table boundary changed';
  end if;
end;
$flight_consumer_preview_094_postcondition$;

commit;
