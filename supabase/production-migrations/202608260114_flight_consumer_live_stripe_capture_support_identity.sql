begin;

-- Forward-only support identity hardening for the Production-dark Stripe
-- capture journal. This migration calls no provider, moves no money, exposes
-- no route, and grants no capture, settlement, ticketing, or release authority.
do $migration$
begin
  if to_regclass(
    'public.flight_consumer_live_stripe_capture_attempts'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_stripe_capture_receipts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_booking_settlements'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_live_booking_settlement_v1(uuid,integer,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_order_execution_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_stripe_capture_v1(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Stripe capture support identity requires exact 111, 112, and 113 predecessors';
  end if;

end;
$migration$;

lock table public.flight_consumer_live_stripe_capture_attempts
  in access exclusive mode;

do $provider_evidence_guard$
begin
  -- This guard runs under ACCESS EXCLUSIVE so a concurrent 111 claim cannot
  -- race a clean snapshot and become dispatching while 114 is installed.
  if exists (
    select 1
      from public.flight_consumer_live_stripe_capture_attempts
     where attempt_state = 'dispatching'
        or stripe_capture_request_count = 1
        or external_capture_request_made
  ) then
    raise exception
      'Flight Consumer Live Stripe capture support identity cannot backfill in-flight or provider-call evidence';
  end if;
end;
$provider_evidence_guard$;

alter table public.flight_consumer_live_stripe_capture_attempts
  add column client_correlation_id text,
  add column client_correlation_id_sha256 text,
  add column stripe_request_id text,
  add column stripe_request_id_sha256 text,
  add column stripe_transport_outcome text;

alter table public.flight_consumer_live_stripe_capture_attempts
  add constraint flight_consumer_live_stripe_capture_support_identity_114
  check (
    (client_correlation_id is null) =
      (client_correlation_id_sha256 is null)
    and (stripe_request_id is null) =
      (stripe_request_id_sha256 is null)
    and (
      stripe_transport_outcome is null
      or stripe_transport_outcome in ('http_response', 'no_response')
    )
    and (
      client_correlation_id is null
      or (
        client_correlation_id ~ '^flt_capture_[0-9a-f]{48}$'
        and client_correlation_id =
          'flt_capture_' || left(capture_request_sha256, 48)
        and client_correlation_id_sha256 ~ '^[0-9a-f]{64}$'
        and client_correlation_id_sha256 = encode(extensions.digest(
          convert_to(client_correlation_id, 'UTF8'), 'sha256'
        ), 'hex')
      )
    )
    and (
      stripe_request_id is null
      or (
        stripe_request_id ~ '^req_[A-Za-z0-9]{8,128}$'
        and stripe_request_id_sha256 ~ '^[0-9a-f]{64}$'
        and stripe_request_id_sha256 = encode(extensions.digest(
          convert_to(stripe_request_id, 'UTF8'), 'sha256'
        ), 'hex')
      )
    )
    and (
      (stripe_capture_request_count = 0
        and client_correlation_id is null
        and client_correlation_id_sha256 is null
        and stripe_request_id is null
        and stripe_request_id_sha256 is null
        and stripe_transport_outcome is null)
      or
      (stripe_capture_request_count = 1
        and client_correlation_id is not null
        and client_correlation_id_sha256 is not null
        and stripe_transport_outcome is not null
        and (
          (stripe_transport_outcome = 'no_response'
            and terminal_http_status is null
            and terminal_response_sha256 is null
            and stripe_request_id is null
            and stripe_request_id_sha256 is null)
          or
          (stripe_transport_outcome = 'http_response'
            and terminal_http_status is not null
            and stripe_request_id is not null
            and stripe_request_id_sha256 is not null)
        ))
    )
  );

create function
  public.enforce_flight_consumer_live_stripe_capture_support_identity_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $enforce_flight_consumer_live_stripe_capture_support_identity_v1$
declare
  v_wrapper_marker text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if old.attempt_revision = 1 and new.attempt_revision = 2 then
    v_wrapper_marker := nullif(current_setting(
      'iratepilot.stripe_capture_support_identity_v2', true
    ), '');
    if v_wrapper_marker is distinct from old.id::text then
      raise exception
        'Flight Consumer Live Stripe capture v1 completion bypass refused';
    end if;

    new.client_correlation_id := nullif(current_setting(
      'iratepilot.stripe_capture_client_correlation_id', true
    ), '');
    new.client_correlation_id_sha256 := nullif(current_setting(
      'iratepilot.stripe_capture_client_correlation_id_sha256', true
    ), '');
    new.stripe_request_id := nullif(current_setting(
      'iratepilot.stripe_capture_request_id', true
    ), '');
    new.stripe_request_id_sha256 := nullif(current_setting(
      'iratepilot.stripe_capture_request_id_sha256', true
    ), '');
    new.stripe_transport_outcome := nullif(current_setting(
      'iratepilot.stripe_capture_transport_outcome', true
    ), '');
  elsif row(
    new.client_correlation_id, new.client_correlation_id_sha256,
    new.stripe_request_id, new.stripe_request_id_sha256,
    new.stripe_transport_outcome
  ) is distinct from row(
    old.client_correlation_id, old.client_correlation_id_sha256,
    old.stripe_request_id, old.stripe_request_id_sha256,
    old.stripe_transport_outcome
  ) then
    raise exception
      'Flight Consumer Live Stripe capture support identity is immutable';
  end if;

  return new;
end;
$enforce_flight_consumer_live_stripe_capture_support_identity_v1$;

create trigger flight_consumer_live_stripe_capture_114_support_identity
before update or delete
on public.flight_consumer_live_stripe_capture_attempts
for each row execute function
  public.enforce_flight_consumer_live_stripe_capture_support_identity_v1();

create function public.complete_flight_consumer_live_stripe_capture_v2(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_capture_binding_sha256 text,
  p_capture_request_sha256 text,
  p_dispatch_token_sha256 text,
  p_terminal_state text,
  p_stripe_capture_request_count integer,
  p_stripe_mutation_count integer,
  p_terminal_error_code text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_completion_evidence_sha256 text,
  p_ambiguity_evidence_sha256 text,
  p_observed_payment_intent_status text,
  p_observed_payment_intent_reference_sha256 text,
  p_observed_amount_received_cents bigint,
  p_observed_currency text,
  p_observed_livemode boolean,
  p_observed_capture_method text,
  p_charge_reference_ciphertext text,
  p_charge_reference_sha256 text,
  p_client_correlation_id text,
  p_client_correlation_id_sha256 text,
  p_stripe_request_id text,
  p_stripe_request_id_sha256 text,
  p_stripe_transport_outcome text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
  stripe_dispatch_authorized boolean,
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
as $complete_flight_consumer_live_stripe_capture_v2$
declare
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe capture completion is service-role only';
  end if;

  if p_stripe_capture_request_count = 0 then
    if p_client_correlation_id is not null
      or p_client_correlation_id_sha256 is not null
      or p_stripe_request_id is not null
      or p_stripe_request_id_sha256 is not null
      or p_stripe_transport_outcome is not null then
      raise exception
        'Flight Consumer Live Stripe local outcome cannot carry support identity';
    end if;
  elsif p_stripe_capture_request_count = 1 then
    if p_client_correlation_id is null
      or p_client_correlation_id !~ '^flt_capture_[0-9a-f]{48}$'
      or p_client_correlation_id <>
        'flt_capture_' || left(p_capture_request_sha256, 48)
      or p_client_correlation_id_sha256 !~ '^[0-9a-f]{64}$'
      or encode(extensions.digest(
        convert_to(p_client_correlation_id, 'UTF8'), 'sha256'
      ), 'hex') <> p_client_correlation_id_sha256
      or p_stripe_transport_outcome is null
      or p_stripe_transport_outcome not in ('http_response', 'no_response')
      or (p_stripe_request_id is null) <>
        (p_stripe_request_id_sha256 is null)
      or (
        p_stripe_transport_outcome = 'no_response'
        and (
          p_terminal_http_status is not null
          or p_terminal_response_sha256 is not null
          or p_stripe_request_id is not null
          or p_stripe_request_id_sha256 is not null
        )
      )
      or (
        p_stripe_transport_outcome = 'http_response'
        and (
          p_terminal_http_status is null
          or p_stripe_request_id is null
          or p_stripe_request_id_sha256 is null
        )
      )
      or (
        p_stripe_request_id is not null
        and (
          p_stripe_request_id !~ '^req_[A-Za-z0-9]{8,128}$'
          or p_stripe_request_id_sha256 !~ '^[0-9a-f]{64}$'
          or encode(extensions.digest(
            convert_to(p_stripe_request_id, 'UTF8'), 'sha256'
          ), 'hex') <> p_stripe_request_id_sha256
        )
      ) then
      raise exception
        'Flight Consumer Live Stripe capture support identity is invalid';
    end if;
  else
    raise exception
      'Flight Consumer Live Stripe capture request count is invalid';
  end if;

  -- Lock before replay comparison. Exact terminal replay must carry the same
  -- human-usable Stripe support identity, not merely matching hashes.
  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_capture_attempts as attempt
   where attempt.id = p_attempt_id
   for update;
  if found and v_attempt.attempt_revision >= 2 and row(
    v_attempt.client_correlation_id,
    v_attempt.client_correlation_id_sha256,
    v_attempt.stripe_request_id,
    v_attempt.stripe_request_id_sha256,
    v_attempt.stripe_transport_outcome
  ) is distinct from row(
    p_client_correlation_id,
    p_client_correlation_id_sha256,
    p_stripe_request_id,
    p_stripe_request_id_sha256,
    p_stripe_transport_outcome
  ) then
    raise exception
      'Flight Consumer Live Stripe capture support identity replay collision';
  end if;

  perform set_config(
    'iratepilot.stripe_capture_support_identity_v2',
    p_attempt_id::text, true
  );
  perform set_config(
    'iratepilot.stripe_capture_client_correlation_id',
    coalesce(p_client_correlation_id, ''), true
  );
  perform set_config(
    'iratepilot.stripe_capture_client_correlation_id_sha256',
    coalesce(p_client_correlation_id_sha256, ''), true
  );
  perform set_config(
    'iratepilot.stripe_capture_request_id',
    coalesce(p_stripe_request_id, ''), true
  );
  perform set_config(
    'iratepilot.stripe_capture_request_id_sha256',
    coalesce(p_stripe_request_id_sha256, ''), true
  );
  perform set_config(
    'iratepilot.stripe_capture_transport_outcome',
    coalesce(p_stripe_transport_outcome, ''), true
  );

  return query
    select result.*
      from public.complete_flight_consumer_live_stripe_capture_v1(
        p_attempt_id, p_expected_revision, p_execution_scope_sha256,
        p_capture_binding_sha256, p_capture_request_sha256,
        p_dispatch_token_sha256, p_terminal_state,
        p_stripe_capture_request_count, p_stripe_mutation_count,
        p_terminal_error_code, p_terminal_http_status,
        p_terminal_response_sha256, p_completion_evidence_sha256,
        p_ambiguity_evidence_sha256, p_observed_payment_intent_status,
        p_observed_payment_intent_reference_sha256,
        p_observed_amount_received_cents, p_observed_currency,
        p_observed_livemode, p_observed_capture_method,
        p_charge_reference_ciphertext, p_charge_reference_sha256
      ) as result;

  perform set_config(
    'iratepilot.stripe_capture_support_identity_v2', '', true
  );
  perform set_config(
    'iratepilot.stripe_capture_client_correlation_id', '', true
  );
  perform set_config(
    'iratepilot.stripe_capture_client_correlation_id_sha256', '', true
  );
  perform set_config('iratepilot.stripe_capture_request_id', '', true);
  perform set_config(
    'iratepilot.stripe_capture_request_id_sha256', '', true
  );
  perform set_config(
    'iratepilot.stripe_capture_transport_outcome', '', true
  );
end;
$complete_flight_consumer_live_stripe_capture_v2$;

create function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
  p_attempt_id uuid,
  p_execution_scope_sha256 text,
  p_capture_binding_sha256 text,
  p_capture_request_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  payment_intent_reference_sha256 text,
  provider_order_reference_sha256 text,
  charge_reference_sha256 text,
  stripe_capture_request_count integer,
  stripe_mutation_count integer,
  stripe_retrieval_request_count integer,
  state_receipt_sha256 text,
  livemode boolean,
  provider_dispatch_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
  order_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean,
  terminal_http_status integer,
  terminal_response_sha256 text,
  client_correlation_id text,
  client_correlation_id_sha256 text,
  stripe_request_id text,
  stripe_request_id_sha256 text,
  stripe_transport_outcome text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $read_flight_consumer_live_stripe_capture_support_identity_v1$
declare
  v_attempt public.flight_consumer_live_stripe_capture_attempts;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Flight Consumer Live Stripe capture support identity read is service-role only';
  end if;
  if p_attempt_id is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_capture_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception
      'Flight Consumer Live Stripe capture support identity read is invalid';
  end if;

  select attempt.* into v_attempt
    from public.flight_consumer_live_stripe_capture_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.capture_binding_sha256 = p_capture_binding_sha256
     and attempt.capture_request_sha256 = p_capture_request_sha256
     and exists (
       select 1
         from public.flight_consumer_live_stripe_capture_receipts as receipt
        where receipt.attempt_id = attempt.id
          and receipt.attempt_revision = attempt.attempt_revision
          and receipt.attempt_state = attempt.attempt_state
          and receipt.receipt_sha256 = attempt.latest_state_receipt_sha256
     )
   for key share;
  if not found then
    raise exception
      'Flight Consumer Live Stripe capture support identity binding is invalid';
  end if;

  return query select
    'observed'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision,
    v_attempt.payment_intent_reference_sha256,
    v_attempt.provider_order_reference_sha256,
    v_attempt.charge_reference_sha256,
    v_attempt.stripe_capture_request_count,
    v_attempt.stripe_mutation_count,
    v_attempt.stripe_retrieval_request_count,
    v_attempt.latest_state_receipt_sha256, v_attempt.livemode,
    v_attempt.provider_dispatch_authorized,
    v_attempt.stripe_dispatch_authorized,
    v_attempt.booking_authorized, v_attempt.order_authorized,
    v_attempt.payment_authorized, v_attempt.capture_authorized,
    v_attempt.refund_authorized, v_attempt.settlement_authorized,
    v_attempt.ticketing_authorized, v_attempt.servicing_authorized,
    v_attempt.consumer_release_enabled, v_attempt.blind_retry_authorized,
    v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256,
    v_attempt.client_correlation_id,
    v_attempt.client_correlation_id_sha256,
    v_attempt.stripe_request_id,
    v_attempt.stripe_request_id_sha256,
    v_attempt.stripe_transport_outcome;
end;
$read_flight_consumer_live_stripe_capture_support_identity_v1$;

alter table public.flight_consumer_live_stripe_capture_attempts
  enable row level security;
alter table public.flight_consumer_live_stripe_capture_attempts
  force row level security;

revoke all on table
  public.flight_consumer_live_stripe_capture_attempts
from public, anon, authenticated, service_role;

alter function
  public.enforce_flight_consumer_live_stripe_capture_support_identity_v1()
  owner to postgres;
alter function public.complete_flight_consumer_live_stripe_capture_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text, text, text, text, text, text
) owner to postgres;
alter function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  ) owner to postgres;

revoke all on function
  public.enforce_flight_consumer_live_stripe_capture_support_identity_v1()
from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_stripe_capture_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  ) from public, anon, authenticated, service_role;

-- Retire the v1 terminal writer. The trigger marker also refuses a direct v1
-- transition even for a privileged accidental caller.
revoke execute on function
  public.complete_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.complete_flight_consumer_live_stripe_capture_v2(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text, text, text, text, text, text
  ) to service_role;
grant execute on function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  ) to service_role;

comment on column
  public.flight_consumer_live_stripe_capture_attempts.client_correlation_id is
  'Validated non-secret local correlation retained for every attempted Stripe capture call.';
comment on column
  public.flight_consumer_live_stripe_capture_attempts.stripe_request_id is
  'Validated non-secret Stripe Request-Id retained for support whenever an HTTP response was resolved; null only for no-response transport exceptions or zero-call local outcomes.';
comment on column
  public.flight_consumer_live_stripe_capture_attempts.stripe_transport_outcome is
  'Explicit HTTP-response versus no-response discriminator for the single Stripe capture mutation; null only before a provider call or for zero-call local outcomes.';
comment on function public.complete_flight_consumer_live_stripe_capture_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text, text, text, text, text, text
) is
  'Completes the exact 111 capture journal through the 114 support-identity boundary. It grants no provider, payment, capture, refund, settlement, ticketing, retry, servicing, or consumer-release authority.';
comment on function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  ) is
  'Exact-bound read-only service RPC for terminal replay support identity and counters. It grants no dispatch, capture, retry, payment, settlement, ticketing, servicing, or release authority.';

commit;
