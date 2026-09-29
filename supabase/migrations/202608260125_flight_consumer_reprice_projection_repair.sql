begin;

-- Forward repair for the Preview-only offer-acceptance projection failure
-- found by the authenticated Duffel TEST rehearsal. The application repair
-- removes a redundant caller-controlled local_offer_id from the strict
-- refreshed-evidence envelope. This database repair makes the terminal
-- failure RPC executable when local projection fails. It does not enable a
-- runtime capability, contact a provider, move money, or authorize Production.
do $flight_consumer_preview_086_dependencies$
declare
  v_complete_source text;
  v_fail_source text;
  v_offer_constraint_definition text;
  v_offer_constraint_validated boolean;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_idempotency_records') is null
    or to_regclass('public.flight_reprice_receipts') is null
    or to_regprocedure(
      'public.complete_flight_consumer_reprice_v1(uuid,integer,text,text,text,text,bigint,bigint,timestamptz,jsonb)'
    ) is null
    or to_regprocedure(
      'public.fail_flight_consumer_reprice_v1(uuid,integer)'
    ) is null then
    raise exception 'Flight Consumer Preview reprice projection repair requires migrations 068 through 085';
  end if;

  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_reprice_v1(uuid,integer,text,text,text,text,bigint,bigint,timestamptz,jsonb)'
   );
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_reprice_v1(uuid,integer)'
   );
  if v_complete_source is null
    or position(
      'flight_jsonb_has_exact_keys_v1(p_refreshed_evidence' in v_complete_source
    ) = 0
    or position(
      '''stage'', ''predecessor_receipt_sha256'', ''observed_at'', ''retention_expires_at''' in v_complete_source
    ) = 0
    or position(
      '''ciphertext_base64url'', ''aad_sha256'', ''record_hmac_sha256''' in v_complete_source
    ) = 0
    or position('v_predecessor.local_offer_id' in v_complete_source) = 0
    or v_fail_source is null
    or position('#variable_conflict error' in v_fail_source) > 0
    or position('from public.flight_reprice_receipts' in v_fail_source) = 0
    or position('where offer_id = v_attempt.offer_id' in v_fail_source) = 0 then
    raise exception 'Flight Consumer Preview reprice projection predecessor has drifted';
  end if;

  select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)),
         constraint_record.convalidated
    into v_offer_constraint_definition, v_offer_constraint_validated
    from pg_catalog.pg_constraint as constraint_record
   where constraint_record.conrelid = 'public.flight_offers'::regclass
     and constraint_record.conname =
       'flight_offers_provider_offer_ref_ciphertext_check'
     and constraint_record.contype = 'c';
  if v_offer_constraint_definition is null
    or not coalesce(v_offer_constraint_validated, false)
    or position(
      '^enc:v[1-9][0-9]*:[a-za-z0-9_-]+$' in v_offer_constraint_definition
    ) = 0
    or position(
      'char_length(split_part(provider_offer_ref_ciphertext, '':''::text, 3))'
      in v_offer_constraint_definition
    ) = 0
    or position('{16,8176}' in v_offer_constraint_definition) > 0 then
    raise exception 'Flight Consumer Preview reprice projection repair requires migration 085';
  end if;
end;
$flight_consumer_preview_086_dependencies$;

-- Install the function repair only from the fully relocked posture. Preview
-- may be explicitly reactivated afterward by the existing evidence-bound
-- activation contract.
do $flight_consumer_preview_086_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 086 requires relock before repair';
  end if;
end;
$flight_consumer_preview_086_relocked_precondition$;

create or replace function public.fail_flight_consumer_reprice_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer
)
returns table (offer_id uuid, terminal_state text, idempotency_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $fail_flight_consumer_reprice_086$
#variable_conflict error
declare
  v_search public.flight_searches;
  v_attempt public.flight_provider_request_attempts;
  v_idempotency public.flight_idempotency_records;
  v_outcome text;
  v_outcome_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer reprice failure is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt
      on attempt.search_id = search.id
   where attempt.id = p_attempt_id for update of search;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'retrieve_offer'
    or v_attempt.state not in ('succeeded', 'failed', 'ambiguous', 'blocked')
    or v_attempt.revision <> p_expected_terminal_revision
    or exists (
      select 1 from public.flight_reprice_receipts as reprice
       where reprice.offer_id = v_attempt.offer_id
    ) then
    raise exception 'Flight reprice terminal failure evidence does not match';
  end if;
  if v_attempt.state = 'succeeded' and v_attempt.revision <> 2 then
    raise exception 'Local reprice projection failure requires a succeeded terminal attempt';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_attempt.execution_scope_sha256, 'shopping'
  );
  select * into v_idempotency from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_attempt.execution_scope_sha256
     and idempotency.execution_mode = 'test' and idempotency.scope = 'reprice'
     and idempotency.key_sha256 = v_attempt.consumer_idempotency_key_sha256
   for update;
  if not found or v_idempotency.status <> 'in_progress'
    or v_idempotency.request_sha256
      is distinct from v_attempt.consumer_idempotency_request_sha256 then
    raise exception 'Flight reprice idempotency evidence is unavailable';
  end if;
  v_outcome := case when v_attempt.state = 'ambiguous' then 'ambiguous' else 'failed' end;
  v_outcome_sha256 := coalesce(
    v_attempt.terminal_response_sha256,
    v_attempt.terminal_receipt_sha256
  );
  update public.flight_idempotency_records
     set status = v_outcome, response_sha256 = v_outcome_sha256,
         locked_until = greatest(locked_until, clock_timestamp() + interval '5 minutes')
   where id = v_idempotency.id and status = 'in_progress'
  returning * into v_idempotency;
  if not found then raise exception 'Flight reprice failure CAS failed'; end if;
  -- A consumer offer has exactly one retrieve_offer attempt. Once that attempt
  -- is terminal without a materialized receipt, the offer cannot be retried
  -- safely and must no longer be presented as actionable.
  update public.flight_offers as offer
     set status = 'expired'
   where offer.id = v_attempt.offer_id and offer.status = 'offered';
  return query select v_attempt.offer_id, v_attempt.state, v_idempotency.status;
end;
$fail_flight_consumer_reprice_086$;

revoke all on function public.fail_flight_consumer_reprice_v1(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_flight_consumer_reprice_v1(uuid, integer)
  to service_role;

do $flight_consumer_preview_086_postcondition$
declare
  v_complete_source text;
  v_fail_source text;
  v_safe_count integer;
begin
  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_reprice_v1(uuid,integer,text,text,text,text,bigint,bigint,timestamptz,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_reprice_v1(uuid,integer)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  if v_complete_source is null
    or position(
      'flight_jsonb_has_exact_keys_v1(p_refreshed_evidence' in v_complete_source
    ) = 0
    or position(
      '''stage'', ''predecessor_receipt_sha256'', ''observed_at'', ''retention_expires_at''' in v_complete_source
    ) = 0
    or position(
      '''ciphertext_base64url'', ''aad_sha256'', ''record_hmac_sha256''' in v_complete_source
    ) = 0
    or position('v_predecessor.local_offer_id' in v_complete_source) = 0
    or v_fail_source is null
    or position('#variable_conflict error' in v_fail_source) = 0
    or position(
      'from public.flight_reprice_receipts as reprice' in v_fail_source
    ) = 0
    or position(
      'where reprice.offer_id = v_attempt.offer_id' in v_fail_source
    ) = 0
    or position('where offer_id = v_attempt.offer_id' in v_fail_source) > 0
    or position('update public.flight_offers as offer' in v_fail_source) = 0
    or position(
      'where offer.id = v_attempt.offer_id and offer.status = ''offered'''
      in v_fail_source
    ) = 0 then
    raise exception 'Flight Consumer Preview migration 086 did not install the reprice projection repair';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.fail_flight_consumer_reprice_v1(uuid,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fail_flight_consumer_reprice_v1(uuid,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.fail_flight_consumer_reprice_v1(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Flight Consumer Preview migration 086 function grants are unsafe';
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
    raise exception 'Flight Consumer Preview migration 086 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_086_postcondition$;

comment on function public.fail_flight_consumer_reprice_v1(uuid, integer) is
  'Service-role Preview reprice failure with migration-086 output-parameter-safe receipt lookup.';

commit;
