begin;

-- Default-off database foundation only. This migration does not enable flight
-- execution, authorize provider traffic, read credentials, or dispatch requests.
do $$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_runtime_control_receipts') is null
    or to_regprocedure(
      'public.flight_runtime_capability_enabled(text,text,text,text,text)'
    ) is null then
    raise exception 'Flight provider request attempts require migration 068';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight provider request attempts require reviewed SHA-256 support';
  end if;
end;
$$;

create table public.flight_provider_request_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null
    check (tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  commerce_id text not null
    check (commerce_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  operation text not null check (operation in (
    'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'
  )),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null check (execution_mode in ('test', 'live')),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  activation_evidence_sha256 text not null
    check (activation_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_version_sha256 text not null
    check (adapter_version_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_source_sha256 text not null
    check (adapter_source_sha256 ~ '^[0-9a-f]{64}$'),
  provider_account_sha256 text not null
    check (provider_account_sha256 ~ '^[0-9a-f]{64}$'),
  point_of_sale_sha256 text not null
    check (point_of_sale_sha256 ~ '^[0-9a-f]{64}$'),
  content_scope_sha256 text not null
    check (content_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_binding_receipt_sha256 text not null
    check (provider_binding_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  request_plan_sha256 text not null
    check (request_plan_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null
    check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  operation_authority_receipt_sha256 text not null
    check (operation_authority_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  dispatch_not_after timestamptz not null,
  state text not null default 'prepared'
    check (state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked')),
  revision integer not null default 0 check (revision >= 0),
  retry_authorized boolean not null default false check (retry_authorized = false),
  prepared_at timestamptz not null default clock_timestamp(),
  dispatch_started_at timestamptz,
  completed_at timestamptz,
  terminal_http_status smallint
    check (terminal_http_status is null or terminal_http_status between 100 and 599),
  terminal_response_sha256 text
    check (
      terminal_response_sha256 is null
      or terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    ),
  terminal_response_bytes bigint
    check (
      terminal_response_bytes is null
      or terminal_response_bytes between 0 and 1048576
    ),
  terminal_receipt_sha256 text
    check (
      terminal_receipt_sha256 is null
      or terminal_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  check (dispatch_not_after > prepared_at),
  check (
    (state = 'prepared'
      and revision = 0
      and dispatch_started_at is null
      and completed_at is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is null)
    or
    (state = 'dispatching'
      and revision = 1
      and dispatch_started_at is not null
      and completed_at is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is null)
    or
    (state = 'blocked'
      and revision = 1
      and dispatch_started_at is null
      and completed_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'succeeded'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status between 200 and 299
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'failed'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status between 300 and 599
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'ambiguous'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is not null)
  ),
  check (dispatch_started_at is null or dispatch_started_at >= prepared_at),
  check (completed_at is null or completed_at >= prepared_at),
  check (
    completed_at is null
    or dispatch_started_at is null
    or completed_at >= dispatch_started_at
  )
);

-- Current transport operations are shopping-only. Exact request identity is
-- unique within the same commerce and execution identity; no retry is implied.
create unique index flight_provider_request_attempts_request_uidx
  on public.flight_provider_request_attempts (
    tenant_id, commerce_id, provider_account_sha256, execution_mode,
    provider_code, operation, request_sha256
  );

create index flight_provider_request_attempts_state_idx
  on public.flight_provider_request_attempts (state, prepared_at);

create function public.protect_flight_provider_request_attempt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight provider request-attempt evidence is append-preserving';
  end if;

  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.commerce_id is distinct from old.commerce_id
    or new.operation is distinct from old.operation
    or new.provider_code is distinct from old.provider_code
    or new.execution_mode is distinct from old.execution_mode
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.activation_evidence_sha256 is distinct from old.activation_evidence_sha256
    or new.adapter_version_sha256 is distinct from old.adapter_version_sha256
    or new.adapter_source_sha256 is distinct from old.adapter_source_sha256
    or new.provider_account_sha256 is distinct from old.provider_account_sha256
    or new.point_of_sale_sha256 is distinct from old.point_of_sale_sha256
    or new.content_scope_sha256 is distinct from old.content_scope_sha256
    or new.provider_binding_receipt_sha256 is distinct from old.provider_binding_receipt_sha256
    or new.request_plan_sha256 is distinct from old.request_plan_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.operation_authority_receipt_sha256
      is distinct from old.operation_authority_receipt_sha256
    or new.dispatch_not_after is distinct from old.dispatch_not_after
    or new.retry_authorized is distinct from old.retry_authorized
    or new.prepared_at is distinct from old.prepared_at then
    raise exception 'Flight provider request-attempt identity is immutable';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Flight provider request-attempt revision must advance by exact CAS';
  end if;

  if old.state = 'prepared' and new.state = 'dispatching' then
    if new.dispatch_started_at is null
      or new.completed_at is not null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is not null then
      raise exception 'Prepared-to-dispatching transition evidence is malformed';
    end if;
    return new;
  end if;

  if old.state = 'prepared' and new.state = 'blocked' then
    if new.dispatch_started_at is not null
      or new.completed_at is null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Prepared-to-blocked transition evidence is malformed';
    end if;
    return new;
  end if;

  if old.state = 'dispatching'
    and new.state in ('succeeded', 'failed', 'ambiguous') then
    if new.dispatch_started_at is distinct from old.dispatch_started_at
      or new.completed_at is null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Dispatch terminal transition evidence is malformed';
    end if;
    return new;
  end if;

  raise exception 'Flight provider request-attempt transition is not authorized';
end;
$$;

create trigger flight_provider_request_attempts_transition_guard
before update or delete on public.flight_provider_request_attempts
for each row execute function public.protect_flight_provider_request_attempt();

create function public.prepare_flight_provider_request_attempt(
  p_tenant_id text,
  p_commerce_id text,
  p_operation text,
  p_provider_code text,
  p_execution_mode text,
  p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_account_sha256 text,
  p_point_of_sale_sha256 text,
  p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_capability text;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request-attempt preparation is service-role only';
  end if;

  if p_operation = 'create_order' then
    raise exception 'Flight create_order HTTP dispatch requires a later durable authority migration';
  end if;
  v_capability := case p_operation
    when 'create_offer_request' then 'shopping'
    when 'retrieve_offer' then 'shopping'
    when 'list_orders_by_offer' then 'shopping'
    else null
  end;
  if v_capability is null then
    raise exception 'Flight provider HTTP operation is not allowlisted';
  end if;
  if p_execution_mode not in ('test', 'live') then
    raise exception 'Flight provider HTTP execution mode must be test or live';
  end if;
  -- The global control row is locked in the same transaction as preparation.
  -- The runtime helper also validates its administrator receipt and session,
  -- project, database, environment, and production bindings.
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    p_execution_mode,
    v_capability,
    p_provider_code,
    null,
    p_execution_scope_sha256
  ) then
    raise exception 'Flight provider runtime capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from p_activation_evidence_sha256
    or v_control.bound_provider_code is distinct from p_provider_code
    or v_control.bound_execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from p_adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from p_provider_account_sha256
    or v_point_of_sale_sha256 is distinct from p_point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from p_content_scope_sha256 then
    raise exception 'Flight provider request binding does not match the locked runtime control';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from p_adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from p_provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from p_operation_authority_receipt_sha256 then
    raise exception 'Flight provider opaque receipt digests are not exactly session-bound';
  end if;

  -- Read the trusted database clock only after all potentially blocking locks.
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight provider request dispatch deadline is invalid';
  end if;

  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at
  ) values (
    p_tenant_id, p_commerce_id, p_operation, p_provider_code, p_execution_mode,
    p_execution_scope_sha256, p_activation_evidence_sha256,
    p_adapter_version_sha256, p_adapter_source_sha256,
    p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
    p_provider_binding_receipt_sha256,
    p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
    p_operation_authority_receipt_sha256, p_dispatch_not_after,
    'prepared', 0, false, v_now
  )
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Flight provider request identity already has an attempt; retry is not authorized';
end;
$$;

create function public.claim_flight_provider_request_attempt_for_dispatch(
  p_attempt_id uuid,
  p_expected_revision integer
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_capability text;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request dispatch claim is service-role only';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight provider request dispatch CAS failed';
  end if;
  v_capability := case v_attempt.operation
    when 'create_offer_request' then 'shopping'
    when 'retrieve_offer' then 'shopping'
    when 'list_orders_by_offer' then 'shopping'
    else null
  end;
  if v_capability is null then
    raise exception 'Flight provider HTTP operation is not allowlisted';
  end if;

  -- The credential must already have been validated while this row remained
  -- prepared. This is the final database claim immediately before HTTP dispatch.
  -- A committed dispatch claim is the explicit in-flight boundary: a later
  -- kill-switch change cannot retroactively revoke that already-claimed attempt.
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    v_attempt.execution_mode,
    v_capability,
    v_attempt.provider_code,
    null,
    v_attempt.execution_scope_sha256
  ) then
    raise exception 'Flight provider runtime capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_provider_code is distinct from v_attempt.provider_code
    or v_control.bound_execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight provider request binding changed before dispatch';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from v_attempt.adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from v_attempt.provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from v_attempt.operation_authority_receipt_sha256 then
    raise exception 'Flight provider opaque receipt digests changed before dispatch';
  end if;

  -- Do not let time spent waiting on either row lock consume authority unseen.
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight provider request dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching',
         revision = revision + 1,
         dispatch_started_at = v_now
   where id = p_attempt_id
     and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight provider request dispatch CAS failed';
  end if;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

create function public.complete_flight_provider_request_attempt(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request completion is service-role only';
  end if;
  if p_terminal_receipt_sha256 is null
    or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight provider request terminal receipt is required';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight provider request completion CAS failed';
  end if;

  if v_attempt.state = 'prepared' then
    if p_terminal_state <> 'blocked'
      or p_terminal_http_status is not null
      or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null then
      raise exception 'Only a never-dispatched prepared attempt may become blocked';
    end if;
  elsif v_attempt.state = 'dispatching' then
    if p_terminal_state not in ('succeeded', 'failed', 'ambiguous') then
      raise exception 'Dispatching attempt requires an exact terminal outcome';
    end if;
    if p_terminal_state = 'succeeded'
      and (
        p_terminal_http_status is null
        or p_terminal_http_status not between 200 and 299
        or p_terminal_response_sha256 is null
        or p_terminal_response_bytes is null
      ) then
      raise exception 'Successful provider response evidence is incomplete';
    end if;
    if p_terminal_state = 'failed' and p_terminal_http_status is null then
      raise exception 'Dispatched uncertainty must be recorded as ambiguous';
    end if;
    if p_terminal_state = 'failed'
      and (
        p_terminal_http_status not between 300 and 599
        or p_terminal_response_sha256 is null
        or p_terminal_response_bytes is null
      ) then
      raise exception 'Known provider failure response evidence is incomplete';
    end if;
    if p_terminal_state = 'ambiguous'
      and (
        p_terminal_http_status is not null
        or p_terminal_response_sha256 is not null
        or p_terminal_response_bytes is not null
      ) then
      raise exception 'Ambiguous provider dispatch cannot claim a response';
    end if;
  else
    raise exception 'Terminal flight provider request-attempt evidence is immutable';
  end if;

  v_now := clock_timestamp();
  update public.flight_provider_request_attempts
     set state = p_terminal_state,
         revision = revision + 1,
         completed_at = v_now,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         terminal_receipt_sha256 = p_terminal_receipt_sha256
   where id = p_attempt_id
     and state = v_attempt.state
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight provider request completion CAS failed';
  end if;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

alter table public.flight_provider_request_attempts enable row level security;
alter table public.flight_provider_request_attempts force row level security;

revoke all on table public.flight_provider_request_attempts
  from public, anon, authenticated, service_role;
grant select on table public.flight_provider_request_attempts to service_role;

revoke all on function public.protect_flight_provider_request_attempt()
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer)
  to service_role;
grant execute on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) to service_role;

comment on table public.flight_provider_request_attempts is
  'Digest-only outbound flight HTTP attempt journal. No request/response bodies, URLs, credentials, PII, or provider resource identifiers.';
comment on column public.flight_provider_request_attempts.provider_binding_receipt_sha256 is
  'Opaque receipt digest exact-matched to the service session; this migration does not authenticate or mint it.';
comment on column public.flight_provider_request_attempts.operation_authority_receipt_sha256 is
  'Opaque operation-gate receipt digest exact-matched to the service session; this migration does not authenticate or mint it.';
comment on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) is
  'Prepares one exact shopping request after locked runtime/provider and exact session-bound opaque receipt-digest rechecks; create_order and retries remain unauthorized.';
comment on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer) is
  'Exact CAS claim after credential validation and immediately before HTTP dispatch; rechecks kill switch, bindings, opaque receipt digests, and expiry.';
comment on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) is
  'Records only digest-bound terminal evidence. Any uncertain dispatch must become ambiguous and cannot be retried here.';

commit;
