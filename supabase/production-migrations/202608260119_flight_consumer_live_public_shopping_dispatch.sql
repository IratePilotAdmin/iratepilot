begin;

do $migration$
begin
  if to_regclass('public.flight_consumer_live_public_shopping_admissions') is null
    or to_regclass('public.flight_consumer_live_duffel_shopping_attempts') is null
    or to_regprocedure('public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(text,text,text,text,timestamp with time zone)') is null
    or to_regprocedure('public.claim_flight_consumer_live_duffel_shopping_attempt_v1(uuid,integer,text)') is null
    or to_regclass('public.flight_consumer_live_duffel_offer_source_batches') is null
    or to_regprocedure('public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)') is null
    or to_regprocedure('public.list_flight_consumer_live_duffel_pending_offer_sources_v1(uuid,text,text)') is null
    or to_regprocedure('public.read_flight_consumer_live_public_offer_projection_batch_v1(uuid,text,text,text)') is null
    or to_regproc('public.complete_flight_consumer_live_public_offer_projection_batch_v1') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Live public-shopping dispatch prerequisites are missing';
  end if;
end;
$migration$;

create table public.flight_consumer_live_public_shopping_dispatches (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null unique references
    public.flight_consumer_live_public_shopping_admissions(id) on delete restrict,
  admission_receipt_sha256 text not null check (admission_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  admission_execution_scope_sha256 text not null check (admission_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  admission_policy_sha256 text not null check (admission_policy_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  admission_idempotency_sha256 text not null check (admission_idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  public_request_sha256 text not null check (public_request_sha256 ~ '^[0-9a-f]{64}$'),
  shopping_attempt_id uuid not null unique references
    public.flight_consumer_live_duffel_shopping_attempts(id) on delete restrict,
  shopping_execution_scope_sha256 text not null check (shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  shopping_idempotency_sha256 text not null unique check (shopping_idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  dispatch_not_after timestamptz not null,
  capability_operation text not null check (capability_operation = 'create_offer_request'),
  capability_consumed boolean not null check (capability_consumed),
  create_offer_request_dispatch_authorized boolean not null
    check (create_offer_request_dispatch_authorized),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  dispatch_receipt_sha256 text not null unique check (dispatch_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  consumer_exposure_authorized boolean not null default false check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  check (dispatch_not_after > created_at),
  check (admission_execution_scope_sha256 <> shopping_execution_scope_sha256),
  check (dispatch_receipt_sha256 <> admission_receipt_sha256)
);

alter table public.flight_consumer_live_public_shopping_dispatches enable row level security;
alter table public.flight_consumer_live_public_shopping_dispatches force row level security;
revoke all on table public.flight_consumer_live_public_shopping_dispatches
  from public, anon, authenticated, service_role;

create function public.refuse_flight_consumer_live_public_shopping_dispatch_mutation_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $body$
begin
  raise exception 'Flight Consumer Live public-shopping dispatch evidence is immutable';
end;
$body$;

create trigger flight_consumer_live_public_shopping_dispatches_immutable
before update or delete on public.flight_consumer_live_public_shopping_dispatches
for each row execute function public.refuse_flight_consumer_live_public_shopping_dispatch_mutation_v1();

create function public.claim_flight_consumer_live_public_shopping_dispatch_v1(
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_admission_execution_scope_sha256 text,
  p_policy_sha256 text,
  p_admission_policy_sha256 text,
  p_cohort_sha256 text,
  p_subject_sha256 text,
  p_admission_idempotency_sha256 text,
  p_public_request_sha256 text,
  p_shopping_execution_scope_sha256 text,
  p_shopping_idempotency_sha256 text,
  p_request_body_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text, dispatch_id uuid, shopping_attempt_id uuid,
  dispatch_receipt_sha256 text, attempt_state text, attempt_revision integer,
  create_offer_request_dispatch_authorized boolean,
  provider_dispatch_authorized boolean,
  consumer_exposure_authorized boolean, order_authorized boolean,
  stripe_dispatch_authorized boolean, booking_authorized boolean,
  payment_authorized boolean, capture_authorized boolean,
  refund_authorized boolean, settlement_authorized boolean,
  ticketing_authorized boolean, servicing_authorized boolean,
  consumer_release_enabled boolean, blind_retry_authorized boolean
)
language plpgsql security definer set search_path = pg_catalog, public, extensions
as $claim$
declare
  v_admission public.flight_consumer_live_public_shopping_admissions;
  v_existing public.flight_consumer_live_public_shopping_dispatches;
  v_prepared record;
  v_claimed record;
  v_replay_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz;
  v_expected_idempotency text;
  v_receipt text;
  v_id uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live public-shopping dispatch is service-role only';
  end if;
  if p_admission_id is null or p_dispatch_not_after is null
    or p_admission_receipt_sha256 is null or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_execution_scope_sha256 is null or p_admission_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_policy_sha256 is null or p_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_policy_sha256 is null or p_admission_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_cohort_sha256 is null or p_cohort_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 is null or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_idempotency_sha256 is null or p_admission_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_public_request_sha256 is null or p_public_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_shopping_execution_scope_sha256 is null or p_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_shopping_idempotency_sha256 is null or p_shopping_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_body_sha256 is null or p_request_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_execution_scope_sha256 = p_shopping_execution_scope_sha256 then
    raise exception 'Flight Consumer Live public-shopping dispatch envelope is invalid';
  end if;

  select * into v_admission
    from public.flight_consumer_live_public_shopping_admissions as admission
   where admission.id = p_admission_id for update;
  if not found then
    raise exception 'Flight Consumer Live public-shopping admission is missing';
  end if;

  select * into v_existing
    from public.flight_consumer_live_public_shopping_dispatches as dispatch
   where dispatch.admission_id = p_admission_id;
  if found then
    if v_existing.admission_receipt_sha256 is distinct from p_admission_receipt_sha256
      or v_existing.admission_execution_scope_sha256 is distinct from p_admission_execution_scope_sha256
      or v_existing.policy_sha256 is distinct from p_policy_sha256
      or v_existing.admission_policy_sha256 is distinct from p_admission_policy_sha256
      or v_existing.cohort_sha256 is distinct from p_cohort_sha256
      or v_existing.subject_sha256 is distinct from p_subject_sha256
      or v_existing.admission_idempotency_sha256 is distinct from p_admission_idempotency_sha256
      or v_existing.public_request_sha256 is distinct from p_public_request_sha256
      or v_existing.shopping_execution_scope_sha256 is distinct from p_shopping_execution_scope_sha256
      or v_existing.shopping_idempotency_sha256 is distinct from p_shopping_idempotency_sha256
      or v_existing.request_body_sha256 is distinct from p_request_body_sha256 then
      raise exception 'Flight Consumer Live public-shopping dispatch replay collision';
    end if;
    select * into v_replay_attempt
      from public.flight_consumer_live_duffel_shopping_attempts as attempt
     where attempt.id = v_existing.shopping_attempt_id
       and attempt.execution_scope_sha256 = v_existing.shopping_execution_scope_sha256
       and attempt.idempotency_sha256 = v_existing.shopping_idempotency_sha256
       and attempt.request_sha256 = v_existing.public_request_sha256
       and attempt.request_body_sha256 = v_existing.request_body_sha256
       and attempt.operation = 'create_offer_request'
     for share;
    if not found then
      raise exception 'Flight Consumer Live public-shopping replay attempt is invalid';
    end if;
    return query select 'replay'::text, v_existing.id,
      v_existing.shopping_attempt_id, v_existing.dispatch_receipt_sha256,
      v_replay_attempt.attempt_state, v_replay_attempt.attempt_revision,
      false, false,
      false,false,false,false,false,false,false,false,false,false,false,false;
    return;
  end if;

  v_now := clock_timestamp();
  if v_admission.admission_receipt_sha256 is distinct from p_admission_receipt_sha256
    or v_admission.execution_scope_sha256 is distinct from p_admission_execution_scope_sha256
    or v_admission.policy_sha256 is distinct from p_policy_sha256
    or v_admission.admission_policy_sha256 is distinct from p_admission_policy_sha256
    or v_admission.cohort_sha256 is distinct from p_cohort_sha256
    or v_admission.subject_sha256 is distinct from p_subject_sha256
    or v_admission.idempotency_sha256 is distinct from p_admission_idempotency_sha256
    or v_admission.request_sha256 is distinct from p_public_request_sha256
    or v_admission.admission_state is distinct from 'admitted'
    or not v_admission.budget_claimed or v_admission.claim_expires_at is null
    or v_admission.claim_expires_at <= v_now
    or v_admission.provider_dispatch_authorized
    or v_admission.consumer_exposure_authorized or v_admission.order_authorized
    or v_admission.stripe_dispatch_authorized or v_admission.booking_authorized
    or v_admission.payment_authorized or v_admission.capture_authorized
    or v_admission.refund_authorized or v_admission.settlement_authorized
    or v_admission.ticketing_authorized or v_admission.servicing_authorized
    or v_admission.consumer_release_enabled or v_admission.blind_retry_authorized
    or p_dispatch_not_after <= v_now
    or p_dispatch_not_after > least(v_admission.claim_expires_at, v_now + interval '15 seconds') then
    raise exception 'Flight Consumer Live public-shopping admission cannot dispatch';
  end if;

  v_expected_idempotency := encode(extensions.digest(
    convert_to('iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1','UTF8')
      || decode('00','hex') || convert_to(
        p_admission_id::text || ':' || p_admission_receipt_sha256 || ':'
        || p_shopping_execution_scope_sha256 || ':' || p_public_request_sha256
        || ':' || p_request_body_sha256, 'UTF8'), 'sha256'), 'hex');
  if p_shopping_idempotency_sha256 is distinct from v_expected_idempotency then
    raise exception 'Flight Consumer Live public-shopping dispatch idempotency is invalid';
  end if;

  select * into v_prepared from public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
    p_shopping_execution_scope_sha256, p_shopping_idempotency_sha256,
    p_public_request_sha256, p_request_body_sha256, p_dispatch_not_after);
  if v_prepared.decision is distinct from 'created'
    or v_prepared.attempt_state is distinct from 'prepared'
    or v_prepared.attempt_revision is distinct from 0 then
    raise exception 'Flight Consumer Live public-shopping attempt collision';
  end if;
  select * into v_claimed from public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
    v_prepared.attempt_id, 0, p_shopping_execution_scope_sha256);

  v_receipt := encode(extensions.digest(
    convert_to('iratepilot:flight-consumer-production:public-shopping-dispatch-receipt:v1','UTF8')
      || decode('00','hex') || convert_to(
        v_id::text || ':' || p_admission_id::text || ':' || p_admission_receipt_sha256
        || ':' || v_prepared.attempt_id::text || ':' || p_shopping_execution_scope_sha256
        || ':' || p_shopping_idempotency_sha256 || ':' || p_request_body_sha256
        || ':' || to_char(p_dispatch_not_after at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'), 'sha256'), 'hex');

  insert into public.flight_consumer_live_public_shopping_dispatches (
    id, admission_id, admission_receipt_sha256, admission_execution_scope_sha256,
    admission_policy_sha256, policy_sha256, cohort_sha256, subject_sha256,
    admission_idempotency_sha256, public_request_sha256, shopping_attempt_id,
    shopping_execution_scope_sha256, shopping_idempotency_sha256,
    request_body_sha256, dispatch_not_after, capability_operation,
    capability_consumed, create_offer_request_dispatch_authorized,
    dispatch_receipt_sha256, created_at
  ) values (
    v_id, p_admission_id, p_admission_receipt_sha256,
    p_admission_execution_scope_sha256, p_admission_policy_sha256, p_policy_sha256,
    p_cohort_sha256, p_subject_sha256, p_admission_idempotency_sha256,
    p_public_request_sha256, v_prepared.attempt_id,
    p_shopping_execution_scope_sha256, p_shopping_idempotency_sha256,
    p_request_body_sha256, p_dispatch_not_after, 'create_offer_request',
    true, true, v_receipt, v_now);

  return query select 'created'::text, v_id, v_prepared.attempt_id, v_receipt,
    v_claimed.attempt_state, v_claimed.attempt_revision, true, false,
    false,false,false,false,false,false,false,false,false,false,false,false;
end;
$claim$;

revoke all on function public.claim_flight_consumer_live_public_shopping_dispatch_v1(
  uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_flight_consumer_live_public_shopping_dispatch_v1(
  uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz)
  to service_role;

commit;
