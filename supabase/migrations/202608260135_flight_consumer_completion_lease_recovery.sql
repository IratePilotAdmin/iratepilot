begin;

do $flight_consumer_preview_096_dependencies$
declare
  v_source text;
  v_actual_sha256 text;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_passenger_refs') is null
    or to_regclass('public.flight_ticket_documents') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_consumer_completion_leases') is null
    or to_regprocedure(
      'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)'
    ) is null
    or to_regprocedure(
      'public.protect_flight_consumer_completion_lease_v1()'
    ) is null then
    raise exception 'Flight Consumer Preview completion recovery requires migration 094';
  end if;
  if to_regprocedure(
    'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)'
  ) is not null then
    raise exception 'Flight Consumer Preview completion recovery RPC already exists';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.acquire_flight_consumer_completion_lease_v1(uuid,uuid,text,text,text,text,integer)'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> 'f3263f27218516e8418f3612b1ebbb681aa75996a90a3734fbcf77326069d914' then
    raise exception 'Flight completion acquire predecessor has drifted';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.protect_flight_consumer_completion_lease_v1()'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_source is null
    or v_actual_sha256 <> 'b6bfcdcb5968d63a2c4757d137759ed987cf2741f642399d88f902fa47c2c28b'
    or position('Flight completion lease identity is immutable' in v_source) = 0 then
    raise exception 'Flight completion lease identity guard has drifted';
  end if;
end;
$flight_consumer_preview_096_dependencies$;

do $flight_consumer_preview_096_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 096 requires relock before recovery hardening';
  end if;
end;
$flight_consumer_preview_096_relocked_precondition$;

-- Browser-close recovery never supplies a replacement idempotency or request
-- identity. This service-owned boundary reuses the immutable request digest
-- already bound to the order lease. It serializes application recovery only:
-- every Stripe/Duffel claim RPC remains the sole dispatch authority, and this
-- projection always returns provider_redispatch_authorized = false.
create function public.recover_flight_consumer_completion_lease_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_execution_scope_sha256 text,
  p_lease_token_sha256 text,
  p_lease_duration_seconds integer
)
returns table (
  decision text,
  lease_revision integer,
  lease_state text,
  lease_token_sha256 text,
  lease_expires_at timestamptz,
  request_sha256 text,
  order_status text,
  issued_ticket_count integer,
  provider_attempt_state text,
  provider_attempt_revision integer,
  payment_attempt_state text,
  payment_attempt_revision integer,
  provider_redispatch_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $recover_flight_consumer_completion_lease$
#variable_conflict error
declare
  v_order public.flight_orders;
  v_lease public.flight_consumer_completion_leases;
  v_provider public.flight_provider_request_attempts;
  v_capture public.flight_payment_operation_attempts;
  v_expected integer;
  v_issued integer;
  v_exact_ticketed boolean;
  v_now timestamptz := clock_timestamp();
  v_reclaim_at timestamptz;
  v_auto_outcome_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion recovery lease is service-role only';
  end if;
  if p_customer_id is null or p_order_id is null
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null
    or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_duration_seconds is null
    or p_lease_duration_seconds not between 30 and 300 then
    raise exception 'Flight completion recovery lease input is invalid';
  end if;

  -- Preserve the completion contract's global lock order: order, lease,
  -- provider create-order journal, then Stripe capture journal.
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
   for update;
  if not found
    or v_order.customer_id is distinct from p_customer_id
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.execution_scope_sha256 is distinct from p_execution_scope_sha256 then
    raise exception 'Flight completion recovery order owner or execution scope does not match';
  end if;

  select * into v_lease
    from public.flight_consumer_completion_leases as completion_lease
   where completion_lease.order_id = p_order_id
   for update;
  if not found then
    raise exception 'Flight completion recovery requires an existing lease identity';
  end if;
  if v_lease.customer_id is distinct from p_customer_id
    or v_lease.execution_mode <> 'test'
    or v_lease.execution_scope_sha256 is distinct from p_execution_scope_sha256 then
    raise exception 'Flight completion recovery lease owner or execution scope does not match';
  end if;

  select * into v_provider
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  select * into v_capture
    from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.operation = 'capture'
   for update;

  -- Rows are accepted only in an exact durable journal shape. Adverse or
  -- ambiguous terminal states may be inspected by application recovery, but
  -- are never converted into provider authority here.
  if v_provider.id is not null and (
      v_provider.customer_id is distinct from p_customer_id
      or v_provider.order_id is distinct from p_order_id
      or v_provider.consumer_flow_version <> 1
      or v_provider.operation <> 'create_order'
      or v_provider.provider_code <> 'duffel'
      or v_provider.execution_mode <> 'test'
      or v_provider.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or v_provider.retry_authorized
      or not (
        (v_provider.state = 'prepared' and v_provider.revision = 0)
        or (v_provider.state in ('dispatching', 'blocked') and v_provider.revision = 1)
        or (v_provider.state in ('succeeded', 'failed', 'ambiguous')
          and v_provider.revision = 2)
      )
    ) then
    raise exception 'Flight completion recovery provider journal is malformed';
  end if;
  if v_capture.id is not null and (
      v_capture.customer_id is distinct from p_customer_id
      or v_capture.order_id is distinct from p_order_id
      or v_capture.operation <> 'capture'
      or v_capture.processor_code <> 'stripe'
      or v_capture.execution_mode <> 'test'
      or v_capture.processor_environment <> 'test'
      or v_capture.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or not (
        (v_capture.state = 'prepared' and v_capture.revision = 0)
        or (v_capture.state in ('dispatching', 'blocked') and v_capture.revision = 1)
        or (v_capture.state in ('succeeded', 'failed', 'ambiguous')
          and v_capture.revision = 2)
      )
    ) then
    raise exception 'Flight completion recovery payment journal is malformed';
  end if;

  select count(*)::integer into v_expected
    from public.flight_passenger_refs as passenger
   where passenger.order_id = p_order_id;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = p_order_id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  v_exact_ticketed := v_order.status = 'ticketed'
    and v_order.provider_order_ref_ciphertext is not null
    and v_order.provider_order_ref_sha256 is not null
    and v_expected > 0
    and v_issued = v_expected
    and not exists (
      select 1
        from public.flight_passenger_refs as passenger
       where passenger.order_id = p_order_id
         and (select count(*)
                from public.flight_ticket_documents as document
               where document.order_id = p_order_id
                 and document.passenger_ref_id = passenger.id
                 and document.document_type = 'electronic_ticket'
                 and document.status = 'issued') <> 1
    )
    and v_provider.id is not null
    and v_provider.state = 'succeeded'
    and v_provider.revision = 2
    and v_capture.id is not null
    and v_capture.state = 'succeeded'
    and v_capture.revision = 2;

  if v_lease.lease_state = 'completed' then
    if not v_exact_ticketed
      or v_lease.result_order_status <> 'ticketed'
      or v_lease.result_issued_ticket_count is distinct from v_issued then
      raise exception 'Flight completion recovery replay result is malformed';
    end if;
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, null::timestamptz, v_lease.request_sha256,
      v_lease.result_order_status, v_lease.result_issued_ticket_count,
      v_provider.state, v_provider.revision, v_capture.state,
      v_capture.revision, false;
    return;
  end if;

  if v_order.status = 'ticketed' and not v_exact_ticketed then
    raise exception 'Ticketed Flight completion recovery lacks exact durable evidence';
  end if;
  if v_exact_ticketed then
    v_auto_outcome_sha256 := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'domain', 'iratepilot.flight.consumer-completion-durable-recovery.v1',
            'order_id', p_order_id::text,
            'customer_id', p_customer_id::text,
            'request_sha256', v_lease.request_sha256,
            'issued_ticket_count', v_issued
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    update public.flight_consumer_completion_leases as completion_lease
       set lease_state = 'completed',
           lease_revision = v_lease.lease_revision + 1,
           completed_owner_token_sha256 = v_lease.lease_token_sha256,
           lease_token_sha256 = null,
           lease_expires_at = null,
           outcome_sha256 = v_auto_outcome_sha256,
           result_order_status = 'ticketed',
           result_issued_ticket_count = v_issued,
           completed_at = v_now,
           updated_at = greatest(v_now, v_lease.updated_at + interval '1 microsecond')
     where completion_lease.order_id = p_order_id
       and completion_lease.lease_revision = v_lease.lease_revision
       and completion_lease.lease_state = v_lease.lease_state
       and completion_lease.lease_token_sha256
         is not distinct from v_lease.lease_token_sha256
    returning completion_lease.* into v_lease;
    if not found then
      raise exception 'Flight completion durable recovery CAS failed';
    end if;
    return query select
      'replayed'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, null::timestamptz, v_lease.request_sha256,
      v_lease.result_order_status, v_lease.result_issued_ticket_count,
      v_provider.state, v_provider.revision, v_capture.state,
      v_capture.revision, false;
    return;
  end if;

  if v_lease.lease_state = 'processing'
    and v_lease.lease_expires_at > v_now then
    return query select
      'processing'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, v_lease.lease_expires_at, v_lease.request_sha256,
      v_order.status, null::integer, v_provider.state, v_provider.revision,
      v_capture.state, v_capture.revision, false;
    return;
  end if;

  -- A still-active dispatch is owned by its journal claim, even when the
  -- completion lease was released. Expired dispatches and every prepared or
  -- terminal state are handed to the application-owned recovery path, which
  -- must use the journal-specific claim/retrieve/review RPCs.
  if (v_provider.state = 'dispatching' and v_provider.dispatch_not_after > v_now)
    or (v_capture.state = 'dispatching' and v_capture.dispatch_not_after > v_now) then
    return query select
      'processing'::text, v_lease.lease_revision, v_lease.lease_state,
      null::text, v_lease.lease_expires_at, v_lease.request_sha256,
      v_order.status, null::integer, v_provider.state, v_provider.revision,
      v_capture.state, v_capture.revision, false;
    return;
  end if;

  if v_lease.lease_state <> 'released'
    and not (
      v_lease.lease_state = 'processing'
      and v_lease.lease_expires_at <= v_now
    ) then
    raise exception 'Flight completion recovery lease state is unavailable';
  end if;

  v_reclaim_at := greatest(v_now, v_lease.updated_at + interval '1 microsecond');
  update public.flight_consumer_completion_leases as completion_lease
     set lease_state = 'processing',
         lease_revision = v_lease.lease_revision + 1,
         lease_token_sha256 = p_lease_token_sha256,
         completed_owner_token_sha256 = null,
         lease_acquired_at = v_reclaim_at,
         lease_expires_at =
           v_reclaim_at + make_interval(secs => p_lease_duration_seconds),
         heartbeat_at = v_reclaim_at,
         processing_attempt_count = v_lease.processing_attempt_count + 1,
         updated_at = v_reclaim_at
   where completion_lease.order_id = p_order_id
     and completion_lease.lease_revision = v_lease.lease_revision
     and completion_lease.lease_state = v_lease.lease_state
     and completion_lease.lease_token_sha256
       is not distinct from v_lease.lease_token_sha256
  returning completion_lease.* into v_lease;
  if not found then
    raise exception 'Flight completion recovery lease CAS failed';
  end if;
  return query select
    'reclaimed'::text, v_lease.lease_revision, v_lease.lease_state,
    v_lease.lease_token_sha256, v_lease.lease_expires_at,
    v_lease.request_sha256, v_order.status, null::integer,
    v_provider.state, v_provider.revision, v_capture.state,
    v_capture.revision, false;
end;
$recover_flight_consumer_completion_lease$;

revoke all on function public.recover_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.recover_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, integer
) to service_role;

comment on function public.recover_flight_consumer_completion_lease_v1(
  uuid, uuid, text, text, integer
) is 'Reclaims only an existing immutable completion identity for server-owned journal recovery; provider redispatch authority is always false.';

do $flight_consumer_preview_096_postcondition$
declare
  v_safe_count integer;
  v_source text;
  v_actual_sha256 text;
  v_security_definer boolean;
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
    raise exception 'Flight Consumer Preview migration 096 changed the relocked posture';
  end if;

  select routine.prosrc, routine.prosecdef
    into v_source, v_security_definer
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
    or not coalesce(v_security_definer, false)
    or v_actual_sha256 <> '057b3c28de09f78322b07166181cf1feeaf8d544a12743a8ba9822b1cbad2bda'
    or position('#variable_conflict error' in v_source) = 0
    or position('v_lease.request_sha256' in v_source) = 0
    or position('provider_redispatch_authorized' in pg_get_function_result(
      to_regprocedure(
        'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)'
      )
    )) = 0
    or position('update public.flight_consumer_completion_leases as completion_lease' in v_source) = 0
    or position('where completion_lease.order_id = p_order_id' in v_source) = 0
    or position('v_provider.state = ''dispatching''' in v_source) = 0
    or position('v_capture.state = ''dispatching''' in v_source) = 0
    or position('v_lease.lease_state <> ''released''' in v_source) = 0
    or position('provider redispatch authority is always false' in
      coalesce(obj_description(
        to_regprocedure(
          'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)'
        ),
        'pg_proc'
      ), '')
    ) = 0
    or not has_function_privilege(
      'service_role',
      'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 096 function postcondition failed';
  end if;

  select routine.prosrc into v_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.protect_flight_consumer_completion_lease_v1()'
   );
  v_actual_sha256 := encode(
    extensions.digest(
      convert_to(replace(v_source, chr(13) || chr(10), chr(10)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_actual_sha256 <> 'b6bfcdcb5968d63a2c4757d137759ed987cf2741f642399d88f902fa47c2c28b'
    or position('Flight completion lease identity is immutable' in v_source) = 0
    or not exists (
      select 1
        from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.flight_consumer_completion_leases'::regclass
         and trigger_row.tgname = 'flight_consumer_completion_lease_guard'
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled = 'O'
    )
    or not exists (
      select 1
        from pg_catalog.pg_class as relation
       where relation.oid = 'public.flight_consumer_completion_leases'::regclass
         and relation.relrowsecurity
         and relation.relforcerowsecurity
    )
    or has_table_privilege(
      'service_role', 'public.flight_consumer_completion_leases', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_consumer_completion_leases', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_consumer_completion_leases', 'SELECT'
    ) then
    raise exception 'Flight Consumer Preview migration 096 identity boundary changed';
  end if;
end;
$flight_consumer_preview_096_postcondition$;

commit;
