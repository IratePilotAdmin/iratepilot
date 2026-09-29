begin;

-- Forward-only support identity hardening for the Production-dark 108 order
-- journal. This migration does not call Duffel, authorize a booking, move
-- money, issue a ticket, or expose a route. It makes the exact outbound client
-- correlation durable for every recorded POST /air/orders terminal outcome and
-- retains Duffel's x-request-id whenever an HTTP response was received.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_duffel_order_executions'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_order_execution_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_capture_attempts'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_order_execution_v1(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Duffel support identity requires exact 108 and 111 prerequisites';
  end if;

  -- Existing provider-call evidence cannot be losslessly backfilled because the
  -- plaintext support identifiers were intentionally not persisted by 108.
  -- Production and the isolated UAT are expected to be dark/zero-row here.
  if exists (
    select 1
      from public.flight_consumer_live_duffel_order_executions
     where provider_request_count = 1
  ) then
    raise exception
      'Flight Consumer Live Duffel support identity cannot backfill existing provider-call evidence';
  end if;
end;
$migration$;

lock table public.flight_consumer_live_duffel_order_executions
  in access exclusive mode;

alter table public.flight_consumer_live_duffel_order_executions
  add column client_correlation_id text,
  add column client_correlation_id_sha256 text,
  add column provider_request_id text,
  add column provider_request_id_sha256 text;

alter table public.flight_consumer_live_duffel_order_executions
  add constraint flight_consumer_live_duffel_support_identity_shape_112 check (
    (client_correlation_id is null) =
      (client_correlation_id_sha256 is null)
    and (provider_request_id is null) =
      (provider_request_id_sha256 is null)
    and (
      client_correlation_id is null
      or (
        char_length(client_correlation_id) between 8 and 128
        and client_correlation_id
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
        and client_correlation_id_sha256 ~ '^[0-9a-f]{64}$'
      )
    )
    and (
      provider_request_id is null
      or (
        char_length(provider_request_id) between 8 and 128
        and provider_request_id
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
        and provider_request_id_sha256 ~ '^[0-9a-f]{64}$'
      )
    )
    and (
      (provider_request_count = 0
        and client_correlation_id is null
        and client_correlation_id_sha256 is null
        and provider_request_id is null
        and provider_request_id_sha256 is null)
      or
      (provider_request_count = 1
        and client_correlation_id is not null
        and client_correlation_id_sha256 is not null
        and (
          (terminal_http_status is null
            and provider_request_id is null
            and provider_request_id_sha256 is null)
          or
          (terminal_http_status is not null
            and provider_request_id is not null
            and provider_request_id_sha256 is not null)
        ))
    )
  );

create function
  public.enforce_flight_consumer_live_duffel_support_identity_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $enforce_flight_consumer_live_duffel_support_identity_v1$
declare
  v_client_correlation_id text;
  v_client_correlation_id_sha256 text;
  v_provider_request_id text;
  v_provider_request_id_sha256 text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if old.provider_request_count = 0 and new.provider_request_count = 1 then
    v_client_correlation_id := nullif(current_setting(
      'iratepilot.duffel_client_correlation_id', true
    ), '');
    v_client_correlation_id_sha256 := nullif(current_setting(
      'iratepilot.duffel_client_correlation_id_sha256', true
    ), '');
    v_provider_request_id := nullif(current_setting(
      'iratepilot.duffel_provider_request_id', true
    ), '');
    v_provider_request_id_sha256 := nullif(current_setting(
      'iratepilot.duffel_provider_request_id_sha256', true
    ), '');

    new.client_correlation_id := v_client_correlation_id;
    new.client_correlation_id_sha256 := v_client_correlation_id_sha256;
    new.provider_request_id := v_provider_request_id;
    new.provider_request_id_sha256 := v_provider_request_id_sha256;
  elsif row(
    new.client_correlation_id, new.client_correlation_id_sha256,
    new.provider_request_id, new.provider_request_id_sha256
  ) is distinct from row(
    old.client_correlation_id, old.client_correlation_id_sha256,
    old.provider_request_id, old.provider_request_id_sha256
  ) then
    raise exception
      'Flight Consumer Live Duffel support identity is immutable';
  end if;

  return new;
end;
$enforce_flight_consumer_live_duffel_support_identity_v1$;

create trigger flight_consumer_live_duffel_order_execution_112_support_identity
before update or delete
on public.flight_consumer_live_duffel_order_executions
for each row execute function
  public.enforce_flight_consumer_live_duffel_support_identity_v1();

create function
  public.complete_flight_consumer_live_duffel_order_execution_v2(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_order_execution_binding_sha256 text,
  p_order_request_sha256 text,
  p_dispatch_token_sha256 text,
  p_terminal_state text,
  p_provider_request_count integer,
  p_air_orders_post_count integer,
  p_terminal_error_code text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_provider_order_reference_ciphertext text,
  p_provider_order_reference_sha256 text,
  p_provider_booking_reference_ciphertext text,
  p_provider_booking_reference_sha256 text,
  p_completion_evidence_sha256 text,
  p_ambiguity_evidence_sha256 text,
  p_client_correlation_id text,
  p_client_correlation_id_sha256 text,
  p_provider_request_id text,
  p_provider_request_id_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
  booking_authorized boolean,
  order_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $complete_flight_consumer_live_duffel_order_execution_v2$
declare
  v_attempt public.flight_consumer_live_duffel_order_executions;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel order completion is service-role only';
  end if;

  if p_provider_request_count = 0 then
    if p_client_correlation_id is not null
      or p_client_correlation_id_sha256 is not null
      or p_provider_request_id is not null
      or p_provider_request_id_sha256 is not null then
      raise exception
        'Flight Consumer Live Duffel local outcome cannot carry support identity';
    end if;
  elsif p_provider_request_count = 1 then
    if p_client_correlation_id is null
      or p_client_correlation_id
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      or p_client_correlation_id_sha256 !~ '^[0-9a-f]{64}$'
      or encode(extensions.digest(
        convert_to(p_client_correlation_id, 'UTF8'), 'sha256'
      ), 'hex') <> p_client_correlation_id_sha256
      or (p_provider_request_id is null) <>
        (p_provider_request_id_sha256 is null)
      or (p_terminal_http_status is null) <>
        (p_provider_request_id is null)
      or (
        p_provider_request_id is not null
        and (
          p_provider_request_id
            !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
          or p_provider_request_id_sha256 !~ '^[0-9a-f]{64}$'
          or encode(extensions.digest(
            convert_to(p_provider_request_id, 'UTF8'), 'sha256'
          ), 'hex') <> p_provider_request_id_sha256
        )
      ) then
      raise exception
        'Flight Consumer Live Duffel provider support identity is invalid';
    end if;
  else
    raise exception
      'Flight Consumer Live Duffel provider request count is invalid';
  end if;

  -- Lock first so an exact replay cannot race support-identity comparison.
  select execution.* into v_attempt
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_attempt_id
   for update;
  if found and v_attempt.attempt_revision >= 2 and row(
    v_attempt.client_correlation_id,
    v_attempt.client_correlation_id_sha256,
    v_attempt.provider_request_id,
    v_attempt.provider_request_id_sha256
  ) is distinct from row(
    p_client_correlation_id,
    p_client_correlation_id_sha256,
    p_provider_request_id,
    p_provider_request_id_sha256
  ) then
    raise exception
      'Flight Consumer Live Duffel support identity replay collision';
  end if;

  perform set_config(
    'iratepilot.duffel_client_correlation_id',
    coalesce(p_client_correlation_id, ''), true
  );
  perform set_config(
    'iratepilot.duffel_client_correlation_id_sha256',
    coalesce(p_client_correlation_id_sha256, ''), true
  );
  perform set_config(
    'iratepilot.duffel_provider_request_id',
    coalesce(p_provider_request_id, ''), true
  );
  perform set_config(
    'iratepilot.duffel_provider_request_id_sha256',
    coalesce(p_provider_request_id_sha256, ''), true
  );

  return query
    select result.*
      from public.complete_flight_consumer_live_duffel_order_execution_v1(
        p_attempt_id, p_expected_revision, p_execution_scope_sha256,
        p_order_execution_binding_sha256, p_order_request_sha256,
        p_dispatch_token_sha256, p_terminal_state,
        p_provider_request_count, p_air_orders_post_count,
        p_terminal_error_code, p_terminal_http_status,
        p_terminal_response_sha256,
        p_provider_order_reference_ciphertext,
        p_provider_order_reference_sha256,
        p_provider_booking_reference_ciphertext,
        p_provider_booking_reference_sha256,
        p_completion_evidence_sha256, p_ambiguity_evidence_sha256
      ) as result;

  perform set_config('iratepilot.duffel_client_correlation_id', '', true);
  perform set_config(
    'iratepilot.duffel_client_correlation_id_sha256', '', true
  );
  perform set_config('iratepilot.duffel_provider_request_id', '', true);
  perform set_config(
    'iratepilot.duffel_provider_request_id_sha256', '', true
  );
end;
$complete_flight_consumer_live_duffel_order_execution_v2$;

create function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
  p_attempt_id uuid,
  p_execution_scope_sha256 text,
  p_order_execution_binding_sha256 text,
  p_order_request_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  provider_order_reference_sha256 text,
  provider_booking_reference_sha256 text,
  provider_request_count integer,
  air_orders_post_count integer,
  terminal_http_status integer,
  client_correlation_id text,
  client_correlation_id_sha256 text,
  provider_request_id text,
  provider_request_id_sha256 text,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
  booking_authorized boolean,
  order_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $read_flight_consumer_live_duffel_order_support_identity_v1$
declare
  v_attempt public.flight_consumer_live_duffel_order_executions;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Duffel support identity read is service-role only';
  end if;
  if p_attempt_id is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_execution_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception
      'Flight Consumer Live Duffel support identity read is invalid';
  end if;

  select execution.* into v_attempt
    from public.flight_consumer_live_duffel_order_executions as execution
   where execution.id = p_attempt_id
     and execution.execution_scope_sha256 = p_execution_scope_sha256
     and execution.order_execution_binding_sha256 =
       p_order_execution_binding_sha256
     and execution.order_request_sha256 = p_order_request_sha256
     and execution.provider_request_count = execution.air_orders_post_count
     and (
       execution.client_correlation_id is null
       or encode(extensions.digest(
         convert_to(execution.client_correlation_id, 'UTF8'), 'sha256'
       ), 'hex') = execution.client_correlation_id_sha256
     )
     and (
       execution.provider_request_id is null
       or encode(extensions.digest(
         convert_to(execution.provider_request_id, 'UTF8'), 'sha256'
       ), 'hex') = execution.provider_request_id_sha256
     )
     and exists (
       select 1
         from public.flight_consumer_live_duffel_order_execution_receipts
           as receipt
        where receipt.attempt_id = execution.id
          and receipt.attempt_revision = execution.attempt_revision
          and receipt.attempt_state = execution.attempt_state
          and receipt.receipt_sha256 = execution.latest_state_receipt_sha256
     )
   for key share;
  if not found then
    raise exception
      'Flight Consumer Live Duffel support identity evidence is unavailable';
  end if;

  return query select
    v_attempt.id, v_attempt.attempt_state, v_attempt.attempt_revision,
    v_attempt.provider_order_reference_sha256,
    v_attempt.provider_booking_reference_sha256,
    v_attempt.provider_request_count, v_attempt.air_orders_post_count,
    v_attempt.terminal_http_status,
    v_attempt.client_correlation_id, v_attempt.client_correlation_id_sha256,
    v_attempt.provider_request_id, v_attempt.provider_request_id_sha256,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized, v_attempt.booking_authorized,
    v_attempt.order_authorized, v_attempt.payment_authorized,
    v_attempt.capture_authorized, v_attempt.refund_authorized,
    v_attempt.settlement_authorized, v_attempt.ticketing_authorized,
    v_attempt.servicing_authorized, v_attempt.consumer_release_enabled,
    v_attempt.blind_retry_authorized;
end;
$read_flight_consumer_live_duffel_order_support_identity_v1$;

alter function
  public.enforce_flight_consumer_live_duffel_support_identity_v1()
  owner to postgres;
alter function public.complete_flight_consumer_live_duffel_order_execution_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text, text, text, text, text
) owner to postgres;
alter function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  ) owner to postgres;

revoke all on function
  public.enforce_flight_consumer_live_duffel_support_identity_v1()
from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_duffel_order_execution_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  ) from public, anon, authenticated, service_role;

-- Retire the terminal-writing grant on 108 v1. Its implementation remains for
-- the v2 wrapper and dependency continuity, but new service-role callers must
-- supply exact support identity through v2.
revoke execute on function
  public.complete_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text
  ) from service_role;
grant execute on function
  public.complete_flight_consumer_live_duffel_order_execution_v2(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text, text, text, text, text
  ) to service_role;
grant execute on function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  ) to service_role;

comment on column
  public.flight_consumer_live_duffel_order_executions.client_correlation_id is
  'Validated non-secret outbound client correlation for Duffel support; present on every recorded POST /air/orders terminal outcome.';
comment on column
  public.flight_consumer_live_duffel_order_executions.provider_request_id is
  'Validated non-secret Duffel x-request-id for support; required whenever an HTTP response was received and unavailable only for no-response outcomes.';
comment on function public.complete_flight_consumer_live_duffel_order_execution_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text, text, text, text, text
) is
  'Completes the exact 108 journal while durably binding outbound client correlation and Duffel x-request-id support evidence. Grants no provider, booking, payment, capture, ticketing, retry, or release authority.';
comment on function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  ) is
  'Reads exact immutable Duffel support identity for restart/replay diagnostics only. It performs no provider call and grants no dispatch, booking, payment, capture, ticketing, retry, or release authority.';

commit;
