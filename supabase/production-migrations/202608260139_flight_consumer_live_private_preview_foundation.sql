begin;

-- Gate 139 is a route-free private-preview policy and evidence plane. It does
-- not call Duffel or Stripe and grants no order, payment, capture, refund,
-- settlement, ticketing, servicing, consumer-release, or retry authority.
do $migration$
begin
  if to_regclass('public.flight_consumer_live_public_shopping_admissions') is null
    or to_regclass('public.flight_consumer_live_public_shopping_dispatches') is null
    or to_regclass('public.flight_consumer_live_duffel_shopping_attempts') is null
    or to_regclass('public.flight_consumer_live_duffel_offer_source_batches') is null
    or to_regclass('public.flight_consumer_live_public_offer_projection_batches') is null
    or to_regprocedure(
      'public.canonical_flight_consumer_public_offer_json_v1(jsonb)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live private-preview foundation prerequisites are missing';
  end if;
end;
$migration$;

create table public.flight_consumer_live_private_preview_membership_events (
  id uuid primary key default gen_random_uuid(),
  policy_sha256 text not null check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  membership_key_sha256 text not null
    check (membership_key_sha256 ~ '^[0-9a-f]{64}$'),
  event_idempotency_sha256 text not null unique
    check (event_idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  event_sequence integer not null check (event_sequence between 1 and 2147483647),
  event_type text not null check (event_type in ('granted', 'revoked')),
  membership_not_after timestamptz,
  membership_receipt_sha256 text not null unique
    check (membership_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  unique (membership_key_sha256, event_sequence),
  check (policy_sha256 <> cohort_sha256),
  check (policy_sha256 <> subject_sha256),
  check (cohort_sha256 <> subject_sha256),
  check (
    (event_type = 'granted'
      and membership_not_after > created_at
      and membership_not_after <= created_at + interval '7 days')
    or (event_type = 'revoked' and membership_not_after is null)
  )
);

create index flight_consumer_live_private_preview_membership_latest_idx
  on public.flight_consumer_live_private_preview_membership_events (
    membership_key_sha256, event_sequence desc
  );

create table public.flight_consumer_live_private_preview_limiter_claims (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  admission_policy_sha256 text not null
    check (admission_policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  membership_event_id uuid not null references
    public.flight_consumer_live_private_preview_membership_events(id)
    on delete restrict,
  membership_receipt_sha256 text not null
    check (membership_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  membership_not_after timestamptz not null,
  claim_expires_at timestamptz not null,
  subject_minute_claim_count integer not null check (subject_minute_claim_count >= 1),
  subject_day_claim_count integer not null check (subject_day_claim_count >= 1),
  cohort_minute_claim_count integer not null check (cohort_minute_claim_count >= 1),
  cohort_day_claim_count integer not null check (cohort_day_claim_count >= 1),
  global_minute_claim_count integer not null check (global_minute_claim_count >= 1),
  global_day_claim_count integer not null check (global_day_claim_count >= 1),
  limiter_receipt_sha256 text not null unique
    check (limiter_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, idempotency_sha256),
  check (claim_expires_at = created_at + interval '60 seconds'),
  check (membership_not_after >= claim_expires_at)
);

create index flight_consumer_live_private_preview_limiter_subject_idx
  on public.flight_consumer_live_private_preview_limiter_claims (
    execution_scope_sha256, subject_sha256, created_at desc
  );
create index flight_consumer_live_private_preview_limiter_cohort_idx
  on public.flight_consumer_live_private_preview_limiter_claims (
    execution_scope_sha256, cohort_sha256, created_at desc
  );
create index flight_consumer_live_private_preview_limiter_global_idx
  on public.flight_consumer_live_private_preview_limiter_claims (
    execution_scope_sha256, created_at desc
  );

create table public.flight_consumer_live_private_preview_limiter_refusals (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  refusal_code text not null check (refusal_code in (
    'membership_inactive',
    'subject_minute_budget_exhausted',
    'subject_day_budget_exhausted',
    'cohort_minute_budget_exhausted',
    'cohort_day_budget_exhausted',
    'global_minute_budget_exhausted',
    'global_day_budget_exhausted'
  )),
  refusal_bucket_sha256 text not null unique
    check (refusal_bucket_sha256 ~ '^[0-9a-f]{64}$'),
  refusal_bucket_receipt_sha256 text not null unique
    check (refusal_bucket_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  refusal_window_ends_at timestamptz not null,
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  check (refusal_window_ends_at > created_at),
  check (refusal_window_ends_at <= created_at + interval '1 day 1 minute')
);

create table public.flight_consumer_live_private_preview_stale_dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references
    public.flight_consumer_live_public_shopping_dispatches(id) on delete restrict,
  dispatch_receipt_sha256 text not null
    check (dispatch_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  shopping_attempt_id uuid not null unique references
    public.flight_consumer_live_duffel_shopping_attempts(id) on delete restrict,
  shopping_execution_scope_sha256 text not null
    check (shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  dispatch_not_after timestamptz not null,
  classification text not null check (classification = 'stale_ambiguous'),
  classification_receipt_sha256 text not null unique
    check (classification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_redispatch_authorized boolean not null default false
    check (not provider_redispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  classified_at timestamptz not null default clock_timestamp(),
  check (dispatch_not_after <= classified_at)
);

create table public.flight_consumer_live_private_preview_exposures (
  id uuid primary key default gen_random_uuid(),
  preview_execution_scope_sha256 text not null
    check (preview_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  membership_event_id uuid not null references
    public.flight_consumer_live_private_preview_membership_events(id)
    on delete restrict,
  membership_receipt_sha256 text not null
    check (membership_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  limiter_claim_id uuid not null unique references
    public.flight_consumer_live_private_preview_limiter_claims(id)
    on delete restrict,
  limiter_receipt_sha256 text not null
    check (limiter_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  admission_id uuid not null unique references
    public.flight_consumer_live_public_shopping_admissions(id) on delete restrict,
  admission_receipt_sha256 text not null
    check (admission_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  dispatch_id uuid not null unique references
    public.flight_consumer_live_public_shopping_dispatches(id) on delete restrict,
  dispatch_receipt_sha256 text not null
    check (dispatch_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  shopping_attempt_id uuid not null unique references
    public.flight_consumer_live_duffel_shopping_attempts(id) on delete restrict,
  projection_batch_id uuid not null unique references
    public.flight_consumer_live_public_offer_projection_batches(id)
    on delete restrict,
  projection_batch_sha256 text not null unique
    check (projection_batch_sha256 ~ '^[0-9a-f]{64}$'),
  projection_receipt_sha256 text not null unique
    check (projection_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  source_offer_count integer not null check (source_offer_count between 0 and 1000),
  projected_offer_count integer not null check (projected_offer_count between 0 and 25),
  refused_offer_count integer not null check (refused_offer_count between 0 and 1000),
  reconciliation_mode text not null
    check (reconciliation_mode in ('direct', 'late_success_after_stale')),
  stale_classification_id uuid references
    public.flight_consumer_live_private_preview_stale_dispatches(id)
    on delete restrict,
  stale_classification_receipt_sha256 text
    check (stale_classification_receipt_sha256 is null
      or stale_classification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  exposure_not_after timestamptz not null,
  private_preview_exposure_authorized boolean not null check (
    private_preview_exposure_authorized
  ),
  consumer_public_release_authorized boolean not null default false
    check (not consumer_public_release_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  exposure_receipt_sha256 text not null unique
    check (exposure_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (source_offer_count = projected_offer_count + refused_offer_count),
  check (exposure_not_after > created_at),
  check (exposure_not_after <= created_at + interval '2 minutes'),
  check (
    (reconciliation_mode = 'direct'
      and stale_classification_id is null
      and stale_classification_receipt_sha256 is null)
    or (reconciliation_mode = 'late_success_after_stale'
      and stale_classification_id is not null
      and stale_classification_receipt_sha256 is not null)
  )
);

do $security$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_consumer_live_private_preview_membership_events',
    'flight_consumer_live_private_preview_limiter_claims',
    'flight_consumer_live_private_preview_limiter_refusals',
    'flight_consumer_live_private_preview_stale_dispatches',
    'flight_consumer_live_private_preview_exposures'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      v_table
    );
  end loop;
end;
$security$;

create function public.refuse_flight_consumer_live_private_preview_mutation_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $refuse$
begin
  raise exception 'Flight Consumer Live private-preview evidence is append-only';
end;
$refuse$;

do $immutability$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_consumer_live_private_preview_membership_events',
    'flight_consumer_live_private_preview_limiter_claims',
    'flight_consumer_live_private_preview_limiter_refusals',
    'flight_consumer_live_private_preview_stale_dispatches',
    'flight_consumer_live_private_preview_exposures'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.refuse_flight_consumer_live_private_preview_mutation_v1()',
      v_table || '_immutable', v_table
    );
  end loop;
end;
$immutability$;

create function public.record_flight_consumer_live_private_preview_membership_event_v1(
  p_policy_sha256 text,
  p_cohort_sha256 text,
  p_subject_sha256 text,
  p_event_idempotency_sha256 text,
  p_event_type text,
  p_membership_not_after timestamptz
)
returns table (
  decision text, membership_event_id uuid, event_sequence integer,
  event_type text, membership_not_after timestamptz,
  membership_receipt_sha256 text, membership_active boolean,
  provider_dispatch_authorized boolean, consumer_exposure_authorized boolean,
  order_authorized boolean, stripe_dispatch_authorized boolean,
  booking_authorized boolean, payment_authorized boolean,
  capture_authorized boolean, refund_authorized boolean,
  settlement_authorized boolean, ticketing_authorized boolean,
  servicing_authorized boolean, consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $record_membership$
declare
  v_existing public.flight_consumer_live_private_preview_membership_events;
  v_latest public.flight_consumer_live_private_preview_membership_events;
  v_event public.flight_consumer_live_private_preview_membership_events;
  v_now timestamptz;
  v_membership_key text;
  v_sequence integer;
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live private-preview membership is service-role only';
  end if;
  if p_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_cohort_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type not in ('granted', 'revoked')
    or cardinality(array(
      select distinct value from unnest(array[
        p_policy_sha256, p_cohort_sha256, p_subject_sha256,
        p_event_idempotency_sha256
      ]) as value
    )) <> 4 then
    raise exception 'Flight Consumer Live private-preview membership envelope is invalid';
  end if;

  v_membership_key := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-membership-key:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_policy_sha256 || ':' || p_cohort_sha256 || ':' || p_subject_sha256,
      'UTF8'
    ), 'sha256'
  ), 'hex');

  lock table public.flight_consumer_live_private_preview_membership_events
    in share row exclusive mode;
  v_now := clock_timestamp();
  if (p_event_type = 'granted' and (
      p_membership_not_after is null
      or p_membership_not_after <= v_now + interval '5 minutes'
      or p_membership_not_after > v_now + interval '7 days'
    )) or (p_event_type = 'revoked' and p_membership_not_after is not null) then
    raise exception 'Flight Consumer Live private-preview membership lifetime is invalid';
  end if;

  select * into v_existing
    from public.flight_consumer_live_private_preview_membership_events as event
   where event.event_idempotency_sha256 = p_event_idempotency_sha256;
  if found then
    if v_existing.policy_sha256 is distinct from p_policy_sha256
      or v_existing.cohort_sha256 is distinct from p_cohort_sha256
      or v_existing.subject_sha256 is distinct from p_subject_sha256
      or v_existing.membership_key_sha256 is distinct from v_membership_key
      or v_existing.event_type is distinct from p_event_type
      or v_existing.membership_not_after is distinct from p_membership_not_after then
      raise exception 'Flight Consumer Live private-preview membership replay collision';
    end if;
    select * into v_latest
      from public.flight_consumer_live_private_preview_membership_events as event
     where event.membership_key_sha256 = v_membership_key
     order by event.event_sequence desc limit 1;
    return query select 'replay'::text, v_existing.id,
      v_existing.event_sequence, v_existing.event_type,
      v_existing.membership_not_after, v_existing.membership_receipt_sha256,
      (v_latest.event_type = 'granted'
        and v_latest.membership_not_after > v_now),
      false,false,false,false,false,false,false,false,false,false,false,false,false;
    return;
  end if;

  select coalesce(max(event.event_sequence), 0) + 1 into v_sequence
    from public.flight_consumer_live_private_preview_membership_events as event
   where event.membership_key_sha256 = v_membership_key;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-membership-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_membership_key || ':' || p_event_idempotency_sha256 || ':'
      || v_sequence::text || ':' || p_event_type || ':'
      || coalesce(to_char(
        p_membership_not_after at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ), '-') || ':' || to_char(
        v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ), 'UTF8'
    ), 'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_private_preview_membership_events (
    policy_sha256, cohort_sha256, subject_sha256, membership_key_sha256,
    event_idempotency_sha256, event_sequence, event_type,
    membership_not_after, membership_receipt_sha256, created_at
  ) values (
    p_policy_sha256, p_cohort_sha256, p_subject_sha256, v_membership_key,
    p_event_idempotency_sha256, v_sequence, p_event_type,
    p_membership_not_after, v_receipt, v_now
  ) returning * into v_event;

  return query select 'created'::text, v_event.id, v_event.event_sequence,
    v_event.event_type, v_event.membership_not_after,
    v_event.membership_receipt_sha256, (v_event.event_type = 'granted'),
    false,false,false,false,false,false,false,false,false,false,false,false,false;
end;
$record_membership$;

create function public.consume_flight_consumer_live_private_preview_limiter_v1(
  p_execution_scope_sha256 text,
  p_policy_sha256 text,
  p_cohort_sha256 text,
  p_subject_sha256 text,
  p_idempotency_sha256 text,
  p_request_sha256 text
)
returns table (
  decision text, execution_scope_sha256 text, subject_sha256 text,
  idempotency_sha256 text, request_sha256 text,
  limiter_receipt_sha256 text, refusal_code text,
  claim_expires_at timestamptz,
  subject_minute_claim_count integer, subject_day_claim_count integer,
  cohort_minute_claim_count integer, cohort_day_claim_count integer,
  global_minute_claim_count integer, global_day_claim_count integer,
  provider_dispatch_authorized boolean, consumer_exposure_authorized boolean,
  order_authorized boolean, stripe_dispatch_authorized boolean,
  booking_authorized boolean, payment_authorized boolean,
  capture_authorized boolean, refund_authorized boolean,
  settlement_authorized boolean, ticketing_authorized boolean,
  servicing_authorized boolean, consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $consume_limiter$
declare
  v_existing public.flight_consumer_live_private_preview_limiter_claims;
  v_membership public.flight_consumer_live_private_preview_membership_events;
  v_claim public.flight_consumer_live_private_preview_limiter_claims;
  v_refusal public.flight_consumer_live_private_preview_limiter_refusals;
  v_now timestamptz;
  v_claim_expires_at timestamptz;
  v_subject_minute integer;
  v_subject_day integer;
  v_cohort_minute integer;
  v_cohort_day integer;
  v_global_minute integer;
  v_global_day integer;
  v_refusal_code text := null;
  v_refusal_key text;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_bucket text;
  v_bucket_receipt text;
  v_receipt text;
  v_admission_policy_sha256 text;
  v_existing_found boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live private-preview limiter is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_cohort_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or cardinality(array(
      select distinct value from unnest(array[
        p_execution_scope_sha256, p_policy_sha256, p_cohort_sha256,
        p_subject_sha256, p_idempotency_sha256, p_request_sha256
      ]) as value
    )) <> 6 then
    raise exception 'Flight Consumer Live private-preview limiter envelope is invalid';
  end if;

  -- Membership is always locked first, then limiter evidence. Every function
  -- follows this ordering so grant/revoke and budget consumption cannot race.
  lock table public.flight_consumer_live_private_preview_membership_events
    in share row exclusive mode;
  lock table public.flight_consumer_live_private_preview_limiter_claims
    in share row exclusive mode;
  lock table public.flight_consumer_live_private_preview_limiter_refusals
    in share row exclusive mode;
  v_now := clock_timestamp();
  v_claim_expires_at := v_now + interval '60 seconds';
  v_admission_policy_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-shopping-admission-policy:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_policy_sha256
      || ':subjectMinute=2'
      || ':subjectDay=10'
      || ':cohortMinute=10'
      || ':cohortDay=100'
      || ':globalMinute=20'
      || ':globalDay=250'
      || ':claimTtlSeconds=60',
      'UTF8'
    ), 'sha256'
  ), 'hex');

  select * into v_existing
    from public.flight_consumer_live_private_preview_limiter_claims as claim
   where claim.execution_scope_sha256 = p_execution_scope_sha256
     and claim.idempotency_sha256 = p_idempotency_sha256;
  v_existing_found := found;
  if v_existing_found and (
    v_existing.policy_sha256 is distinct from p_policy_sha256
    or v_existing.cohort_sha256 is distinct from p_cohort_sha256
    or v_existing.subject_sha256 is distinct from p_subject_sha256
    or v_existing.request_sha256 is distinct from p_request_sha256
    or v_existing.admission_policy_sha256
      is distinct from v_admission_policy_sha256
  ) then
    raise exception 'Flight Consumer Live private-preview limiter replay collision';
  end if;

  select * into v_membership
    from public.flight_consumer_live_private_preview_membership_events as event
   where event.policy_sha256 = p_policy_sha256
     and event.cohort_sha256 = p_cohort_sha256
     and event.subject_sha256 = p_subject_sha256
   order by event.event_sequence desc limit 1;

  if v_membership.id is null
    or v_membership.event_type <> 'granted'
    or v_membership.membership_not_after < v_claim_expires_at
    or (v_existing_found and v_existing.membership_event_id
      is distinct from v_membership.id) then
    v_refusal_code := 'membership_inactive';
  elsif v_existing_found and v_existing.claim_expires_at <= v_now then
    raise exception 'Flight Consumer Live private-preview limiter claim expired';
  elsif v_existing_found then
    return query select 'allowed'::text, p_execution_scope_sha256,
      p_subject_sha256, p_idempotency_sha256, p_request_sha256,
      v_existing.limiter_receipt_sha256, null::text,
      v_existing.claim_expires_at,
      v_existing.subject_minute_claim_count,
      v_existing.subject_day_claim_count,
      v_existing.cohort_minute_claim_count,
      v_existing.cohort_day_claim_count,
      v_existing.global_minute_claim_count,
      v_existing.global_day_claim_count,
      false,false,false,false,false,false,false,false,false,false,false,false,false;
    return;
  end if;

  select
    count(*) filter (where claim.subject_sha256 = p_subject_sha256
      and claim.created_at > v_now - interval '1 minute')::integer,
    count(*) filter (where claim.subject_sha256 = p_subject_sha256
      and claim.created_at > v_now - interval '1 day')::integer,
    count(*) filter (where claim.cohort_sha256 = p_cohort_sha256
      and claim.created_at > v_now - interval '1 minute')::integer,
    count(*) filter (where claim.cohort_sha256 = p_cohort_sha256
      and claim.created_at > v_now - interval '1 day')::integer,
    count(*) filter (where claim.created_at > v_now - interval '1 minute')::integer,
    count(*) filter (where claim.created_at > v_now - interval '1 day')::integer
  into v_subject_minute, v_subject_day, v_cohort_minute, v_cohort_day,
       v_global_minute, v_global_day
  from public.flight_consumer_live_private_preview_limiter_claims as claim
  where claim.execution_scope_sha256 = p_execution_scope_sha256;

  if v_refusal_code is null then
    if v_subject_minute >= 2 then
      v_refusal_code := 'subject_minute_budget_exhausted';
    elsif v_subject_day >= 10 then
      v_refusal_code := 'subject_day_budget_exhausted';
    elsif v_cohort_minute >= 10 then
      v_refusal_code := 'cohort_minute_budget_exhausted';
    elsif v_cohort_day >= 100 then
      v_refusal_code := 'cohort_day_budget_exhausted';
    elsif v_global_minute >= 20 then
      v_refusal_code := 'global_minute_budget_exhausted';
    elsif v_global_day >= 250 then
      v_refusal_code := 'global_day_budget_exhausted';
    end if;
  end if;

  if v_refusal_code is null then
    v_subject_minute := v_subject_minute + 1;
    v_subject_day := v_subject_day + 1;
    v_cohort_minute := v_cohort_minute + 1;
    v_cohort_day := v_cohort_day + 1;
    v_global_minute := v_global_minute + 1;
    v_global_day := v_global_day + 1;
    v_receipt := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:private-preview-limiter-receipt:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        p_execution_scope_sha256 || ':' || p_policy_sha256 || ':'
        || p_cohort_sha256 || ':' || p_subject_sha256 || ':'
        || p_idempotency_sha256 || ':' || p_request_sha256 || ':'
        || v_membership.membership_receipt_sha256 || ':'
        || to_char(v_claim_expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':'
        || v_subject_minute::text || ':' || v_subject_day::text || ':'
        || v_cohort_minute::text || ':' || v_cohort_day::text || ':'
        || v_global_minute::text || ':' || v_global_day::text,
        'UTF8'
      ), 'sha256'
    ), 'hex');
    insert into public.flight_consumer_live_private_preview_limiter_claims (
      execution_scope_sha256, policy_sha256, admission_policy_sha256,
      cohort_sha256, subject_sha256,
      idempotency_sha256, request_sha256, membership_event_id,
      membership_receipt_sha256, membership_not_after, claim_expires_at,
      subject_minute_claim_count, subject_day_claim_count,
      cohort_minute_claim_count, cohort_day_claim_count,
      global_minute_claim_count, global_day_claim_count,
      limiter_receipt_sha256, created_at
    ) values (
      p_execution_scope_sha256, p_policy_sha256, v_admission_policy_sha256,
      p_cohort_sha256,
      p_subject_sha256, p_idempotency_sha256, p_request_sha256,
      v_membership.id, v_membership.membership_receipt_sha256,
      v_membership.membership_not_after, v_claim_expires_at,
      v_subject_minute, v_subject_day, v_cohort_minute, v_cohort_day,
      v_global_minute, v_global_day, v_receipt, v_now
    ) returning * into v_claim;
    return query select 'allowed'::text, p_execution_scope_sha256,
      p_subject_sha256, p_idempotency_sha256, p_request_sha256,
      v_claim.limiter_receipt_sha256, null::text, v_claim.claim_expires_at,
      v_subject_minute, v_subject_day, v_cohort_minute, v_cohort_day,
      v_global_minute, v_global_day,
      false,false,false,false,false,false,false,false,false,false,false,false,false;
    return;
  end if;

  v_refusal_key := case
    when v_refusal_code like 'subject_%'
      or v_refusal_code = 'membership_inactive' then p_subject_sha256
    when v_refusal_code like 'cohort_%' then p_cohort_sha256
    else p_execution_scope_sha256
  end;
  if v_refusal_code like '%_minute_%' then
    v_window_start := date_trunc(
      'minute', v_now at time zone 'UTC'
    ) at time zone 'UTC';
    v_window_end := v_window_start + interval '1 minute';
  else
    v_window_start := date_trunc(
      'day', v_now at time zone 'UTC'
    ) at time zone 'UTC';
    v_window_end := v_window_start + interval '1 day';
  end if;
  v_bucket := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-limiter-refusal-bucket:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_execution_scope_sha256 || ':' || v_refusal_code || ':'
      || v_refusal_key || ':' || to_char(
        v_window_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ), 'UTF8'
    ), 'sha256'
  ), 'hex');
  v_bucket_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-limiter-refusal-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_bucket || ':' || v_refusal_code || ':' || to_char(
        v_window_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ), 'UTF8'
    ), 'sha256'
  ), 'hex');
  insert into public.flight_consumer_live_private_preview_limiter_refusals (
    execution_scope_sha256, refusal_code, refusal_bucket_sha256,
    refusal_bucket_receipt_sha256, refusal_window_ends_at, created_at
  ) values (
    p_execution_scope_sha256, v_refusal_code, v_bucket,
    v_bucket_receipt, v_window_end, v_now
  ) on conflict (refusal_bucket_sha256) do nothing;
  select * into v_refusal
    from public.flight_consumer_live_private_preview_limiter_refusals as refusal
   where refusal.refusal_bucket_sha256 = v_bucket;
  if not found
    or v_refusal.execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_refusal.refusal_code is distinct from v_refusal_code
    or v_refusal.refusal_bucket_receipt_sha256 is distinct from v_bucket_receipt
    or v_refusal.refusal_window_ends_at is distinct from v_window_end then
    raise exception 'Flight Consumer Live private-preview limiter refusal collision';
  end if;
  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-limiter-refused-call:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_bucket_receipt || ':' || p_subject_sha256 || ':'
      || p_idempotency_sha256 || ':' || p_request_sha256,
      'UTF8'
    ), 'sha256'
  ), 'hex');
  return query select 'refused'::text, p_execution_scope_sha256,
    p_subject_sha256, p_idempotency_sha256, p_request_sha256,
    v_receipt, v_refusal_code, null::timestamptz,
    0, 0, 0, 0, 0, 0,
    false,false,false,false,false,false,false,false,false,false,false,false,false;
end;
$consume_limiter$;

create function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(
  p_limit integer
)
returns table (
  decision text, stale_classification_id uuid, dispatch_id uuid,
  shopping_attempt_id uuid, classification text,
  classification_receipt_sha256 text,
  provider_redispatch_authorized boolean,
  consumer_exposure_authorized boolean, order_authorized boolean,
  stripe_dispatch_authorized boolean, booking_authorized boolean,
  payment_authorized boolean, capture_authorized boolean,
  refund_authorized boolean, settlement_authorized boolean,
  ticketing_authorized boolean, servicing_authorized boolean,
  consumer_release_enabled boolean, blind_retry_authorized boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $classify_stale$
declare
  v_candidate record;
  v_classification public.flight_consumer_live_private_preview_stale_dispatches;
  v_now timestamptz;
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live private-preview stale classification is service-role only';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Flight Consumer Live private-preview stale classification limit is invalid';
  end if;

  -- This locks only a bounded candidate set. It deliberately does not mutate
  -- the Gate 101 attempt: the consumed Gate 119 dispatch remains one-shot,
  -- while an already in-flight response may still complete as trusted late
  -- success. A success that wins the row lock is simply not classified.
  for v_candidate in
    select dispatch.id as dispatch_id,
           dispatch.dispatch_receipt_sha256,
           dispatch.shopping_attempt_id,
           dispatch.shopping_execution_scope_sha256,
           least(dispatch.dispatch_not_after, attempt.dispatch_not_after)
             as dispatch_not_after
      from public.flight_consumer_live_public_shopping_dispatches as dispatch
      join public.flight_consumer_live_duffel_shopping_attempts as attempt
        on attempt.id = dispatch.shopping_attempt_id
       and attempt.execution_scope_sha256 =
         dispatch.shopping_execution_scope_sha256
       and attempt.operation = 'create_offer_request'
     where attempt.attempt_state = 'dispatching'
       and attempt.attempt_revision = 1
       and least(dispatch.dispatch_not_after, attempt.dispatch_not_after)
         <= clock_timestamp()
       and not exists (
         select 1
           from public.flight_consumer_live_private_preview_stale_dispatches
             as stale
          where stale.dispatch_id = dispatch.id
       )
     order by least(dispatch.dispatch_not_after, attempt.dispatch_not_after),
              dispatch.id
     for update of dispatch, attempt skip locked
     limit p_limit
  loop
    v_now := clock_timestamp();
    if v_candidate.dispatch_not_after > v_now then
      continue;
    end if;
    v_receipt := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:private-preview-stale-dispatch-receipt:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        v_candidate.dispatch_id::text || ':'
        || v_candidate.dispatch_receipt_sha256 || ':'
        || v_candidate.shopping_attempt_id::text || ':'
        || v_candidate.shopping_execution_scope_sha256 || ':'
        || to_char(v_candidate.dispatch_not_after at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':'
        || to_char(v_now at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'
      ), 'sha256'
    ), 'hex');
    insert into public.flight_consumer_live_private_preview_stale_dispatches (
      dispatch_id, dispatch_receipt_sha256, shopping_attempt_id,
      shopping_execution_scope_sha256, dispatch_not_after,
      classification, classification_receipt_sha256, classified_at
    ) values (
      v_candidate.dispatch_id, v_candidate.dispatch_receipt_sha256,
      v_candidate.shopping_attempt_id,
      v_candidate.shopping_execution_scope_sha256,
      v_candidate.dispatch_not_after, 'stale_ambiguous', v_receipt, v_now
    ) returning * into v_classification;
    return query select 'classified'::text, v_classification.id,
      v_classification.dispatch_id, v_classification.shopping_attempt_id,
      v_classification.classification,
      v_classification.classification_receipt_sha256,
      false,false,false,false,false,false,false,false,false,false,false,false,false;
  end loop;
end;
$classify_stale$;

create function public.authorize_flight_consumer_live_private_preview_exposure_v1(
  p_preview_execution_scope_sha256 text,
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_subject_sha256 text,
  p_request_sha256 text,
  p_dispatch_id uuid,
  p_dispatch_receipt_sha256 text,
  p_projection_batch_sha256 text,
  p_projection_receipt_sha256 text,
  p_source_offer_count integer,
  p_projected_offer_count integer,
  p_refused_offer_count integer,
  p_exposure_not_after timestamptz
)
returns table (
  decision text, exposure_id uuid, exposure_receipt_sha256 text,
  reconciliation_mode text, exposure_not_after timestamptz,
  source_offer_count integer, projected_offer_count integer,
  refused_offer_count integer, private_preview_exposure_authorized boolean,
  consumer_public_release_authorized boolean, order_authorized boolean,
  stripe_dispatch_authorized boolean, booking_authorized boolean,
  payment_authorized boolean, capture_authorized boolean,
  refund_authorized boolean, settlement_authorized boolean,
  ticketing_authorized boolean, servicing_authorized boolean,
  consumer_release_enabled boolean, blind_retry_authorized boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $authorize_exposure$
declare
  v_admission public.flight_consumer_live_public_shopping_admissions;
  v_dispatch public.flight_consumer_live_public_shopping_dispatches;
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_source_batch public.flight_consumer_live_duffel_offer_source_batches;
  v_projection public.flight_consumer_live_public_offer_projection_batches;
  v_membership public.flight_consumer_live_private_preview_membership_events;
  v_limiter public.flight_consumer_live_private_preview_limiter_claims;
  v_stale public.flight_consumer_live_private_preview_stale_dispatches;
  v_existing public.flight_consumer_live_private_preview_exposures;
  v_exposure public.flight_consumer_live_private_preview_exposures;
  v_now timestamptz;
  v_expected_scope text;
  v_mode text;
  v_stale_id uuid := null;
  v_stale_receipt text := null;
  v_min_presentation timestamptz;
  v_min_offer timestamptz;
  v_receipt text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live private-preview exposure is service-role only';
  end if;
  if p_preview_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_id is null
    or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_id is null
    or p_dispatch_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_projection_batch_sha256 !~ '^[0-9a-f]{64}$'
    or p_projection_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_offer_count not between 0 and 1000
    or p_projected_offer_count not between 0 and 25
    or p_refused_offer_count not between 0 and 1000
    or p_source_offer_count <> p_projected_offer_count + p_refused_offer_count
    or p_exposure_not_after is null then
    raise exception 'Flight Consumer Live private-preview exposure envelope is invalid';
  end if;

  -- Serialize current membership against grants/revocations and serialize the
  -- one-receipt-per-admission decision. All trusted time is read after locks.
  lock table public.flight_consumer_live_private_preview_membership_events
    in share row exclusive mode;
  lock table public.flight_consumer_live_private_preview_exposures
    in share row exclusive mode;

  select * into v_admission
    from public.flight_consumer_live_public_shopping_admissions as admission
   where admission.id = p_admission_id for share;
  select * into v_dispatch
    from public.flight_consumer_live_public_shopping_dispatches as dispatch
   where dispatch.id = p_dispatch_id for share;
  if v_dispatch.id is not null then
    select * into v_attempt
      from public.flight_consumer_live_duffel_shopping_attempts as attempt
     where attempt.id = v_dispatch.shopping_attempt_id for share;
  end if;
  if v_attempt.id is not null then
    select * into v_source_batch
      from public.flight_consumer_live_duffel_offer_source_batches as batch
     where batch.source_shopping_attempt_id = v_attempt.id for share;
  end if;
  select * into v_projection
    from public.flight_consumer_live_public_offer_projection_batches as batch
   where batch.admission_id = p_admission_id for share;
  select * into v_limiter
    from public.flight_consumer_live_private_preview_limiter_claims as claim
   where claim.execution_scope_sha256 = v_admission.execution_scope_sha256
     and claim.idempotency_sha256 = v_admission.idempotency_sha256
   for share;
  select * into v_membership
    from public.flight_consumer_live_private_preview_membership_events as event
   where event.policy_sha256 = v_admission.policy_sha256
     and event.cohort_sha256 = v_admission.cohort_sha256
     and event.subject_sha256 = v_admission.subject_sha256
   order by event.event_sequence desc limit 1;
  select * into v_stale
    from public.flight_consumer_live_private_preview_stale_dispatches as stale
   where stale.dispatch_id = p_dispatch_id for share;
  select * into v_existing
    from public.flight_consumer_live_private_preview_exposures as exposure
   where exposure.admission_id = p_admission_id;
  v_now := clock_timestamp();

  if v_admission.id is null
    or v_admission.admission_receipt_sha256
      is distinct from p_admission_receipt_sha256
    or v_admission.subject_sha256 is distinct from p_subject_sha256
    or v_admission.request_sha256 is distinct from p_request_sha256
    or v_admission.admission_state <> 'admitted'
    or not v_admission.budget_claimed
    or v_admission.provider_dispatch_authorized
    or v_admission.consumer_exposure_authorized
    or v_admission.order_authorized or v_admission.stripe_dispatch_authorized
    or v_admission.booking_authorized or v_admission.payment_authorized
    or v_admission.capture_authorized or v_admission.refund_authorized
    or v_admission.settlement_authorized or v_admission.ticketing_authorized
    or v_admission.servicing_authorized or v_admission.consumer_release_enabled
    or v_admission.blind_retry_authorized then
    raise exception 'Flight Consumer Live private-preview admission binding is invalid';
  end if;

  v_expected_scope := encode(extensions.digest(convert_to(
    public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
      'version',
        'flight-consumer-production-private-preview-exposure-scope-v1',
      'migrationVersion', '202608260139',
      'admissionExecutionScopeSha256', v_admission.execution_scope_sha256,
      'policySha256', v_admission.policy_sha256,
      'admissionPolicySha256', v_admission.admission_policy_sha256,
      'cohortSha256', v_admission.cohort_sha256,
      'privatePreviewExposureOnly', true,
      'consumerPublicReleaseAuthorized', false,
      'orderAuthorized', false,
      'stripeDispatchAuthorized', false,
      'bookingAuthorized', false,
      'paymentAuthorized', false,
      'captureAuthorized', false,
      'refundAuthorized', false,
      'settlementAuthorized', false,
      'ticketingAuthorized', false,
      'servicingAuthorized', false,
      'consumerReleaseEnabled', false,
      'blindRetryAuthorized', false
    )), 'UTF8'), 'sha256'), 'hex');
  if p_preview_execution_scope_sha256 is distinct from v_expected_scope then
    raise exception 'Flight Consumer Live private-preview execution scope is invalid';
  end if;

  if v_membership.id is null or v_membership.event_type <> 'granted'
    or v_membership.membership_not_after <= p_exposure_not_after
    or v_limiter.id is null
    or v_limiter.policy_sha256 is distinct from v_admission.policy_sha256
    or v_limiter.admission_policy_sha256
      is distinct from v_admission.admission_policy_sha256
    or v_limiter.cohort_sha256 is distinct from v_admission.cohort_sha256
    or v_limiter.subject_sha256 is distinct from v_admission.subject_sha256
    or v_limiter.request_sha256 is distinct from v_admission.request_sha256
    or v_limiter.membership_event_id is distinct from v_membership.id
    or v_limiter.membership_receipt_sha256
      is distinct from v_membership.membership_receipt_sha256
    or v_limiter.created_at > v_admission.created_at
    or v_limiter.claim_expires_at < v_admission.created_at then
    raise exception 'Flight Consumer Live private-preview membership or limiter binding is invalid';
  end if;

  if v_dispatch.id is null or v_dispatch.admission_id <> v_admission.id
    or v_dispatch.admission_receipt_sha256
      is distinct from v_admission.admission_receipt_sha256
    or v_dispatch.admission_execution_scope_sha256
      is distinct from v_admission.execution_scope_sha256
    or v_dispatch.policy_sha256 is distinct from v_admission.policy_sha256
    or v_dispatch.admission_policy_sha256
      is distinct from v_admission.admission_policy_sha256
    or v_dispatch.cohort_sha256 is distinct from v_admission.cohort_sha256
    or v_dispatch.subject_sha256 is distinct from v_admission.subject_sha256
    or v_dispatch.admission_idempotency_sha256
      is distinct from v_admission.idempotency_sha256
    or v_dispatch.public_request_sha256
      is distinct from v_admission.request_sha256
    or v_dispatch.dispatch_receipt_sha256
      is distinct from p_dispatch_receipt_sha256
    or v_dispatch.provider_dispatch_authorized
    or v_dispatch.consumer_exposure_authorized
    or v_dispatch.order_authorized or v_dispatch.stripe_dispatch_authorized
    or v_dispatch.booking_authorized or v_dispatch.payment_authorized
    or v_dispatch.capture_authorized or v_dispatch.refund_authorized
    or v_dispatch.settlement_authorized or v_dispatch.ticketing_authorized
    or v_dispatch.servicing_authorized or v_dispatch.consumer_release_enabled
    or v_dispatch.blind_retry_authorized
    or v_attempt.id is null or v_attempt.attempt_state <> 'succeeded'
    or v_attempt.attempt_revision <> 2
    or v_attempt.execution_scope_sha256
      is distinct from v_dispatch.shopping_execution_scope_sha256
    or v_attempt.idempotency_sha256
      is distinct from v_dispatch.shopping_idempotency_sha256
    or v_attempt.request_sha256 is distinct from v_admission.request_sha256
    or v_attempt.request_body_sha256
      is distinct from v_dispatch.request_body_sha256 then
    raise exception 'Flight Consumer Live private-preview dispatch is not succeeded';
  end if;

  if v_source_batch.source_shopping_attempt_id is null
    or v_source_batch.source_shopping_execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_source_batch.source_response_sha256
      is distinct from v_attempt.terminal_response_sha256
    or v_source_batch.source_offer_count is distinct from v_attempt.offer_count
    or v_source_batch.source_offer_count is distinct from p_source_offer_count
    or v_source_batch.provider_dispatch_authorized
    or v_source_batch.consumer_exposure_authorized
    or v_source_batch.order_authorized
    or v_source_batch.stripe_dispatch_authorized
    or v_source_batch.booking_authorized or v_source_batch.payment_authorized
    or v_source_batch.capture_authorized or v_source_batch.refund_authorized
    or v_source_batch.settlement_authorized or v_source_batch.ticketing_authorized
    or v_source_batch.servicing_authorized
    or v_source_batch.consumer_release_enabled
    or v_source_batch.blind_retry_authorized then
    raise exception 'Flight Consumer Live private-preview source header is invalid';
  end if;

  if v_projection.id is null
    or v_projection.admission_receipt_sha256
      is distinct from v_admission.admission_receipt_sha256
    or v_projection.execution_scope_sha256
      is distinct from v_admission.execution_scope_sha256
    or v_projection.policy_sha256 is distinct from v_admission.policy_sha256
    or v_projection.admission_policy_sha256
      is distinct from v_admission.admission_policy_sha256
    or v_projection.cohort_sha256 is distinct from v_admission.cohort_sha256
    or v_projection.subject_sha256 is distinct from v_admission.subject_sha256
    or v_projection.idempotency_sha256
      is distinct from v_admission.idempotency_sha256
    or v_projection.request_sha256 is distinct from v_admission.request_sha256
    or v_projection.source_shopping_attempt_id is distinct from v_attempt.id
    or v_projection.source_shopping_execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_projection.source_request_body_sha256
      is distinct from v_attempt.request_body_sha256
    or v_projection.source_response_sha256
      is distinct from v_attempt.terminal_response_sha256
    or v_projection.terminal_response_bytes
      is distinct from v_attempt.terminal_response_bytes
    or v_projection.projection_batch_sha256
      is distinct from p_projection_batch_sha256
    or v_projection.projection_receipt_sha256
      is distinct from p_projection_receipt_sha256
    or v_projection.source_offer_count is distinct from p_source_offer_count
    or v_projection.projected_offer_count is distinct from p_projected_offer_count
    or v_projection.refused_offer_count is distinct from p_refused_offer_count
    or v_projection.provider_dispatch_authorized
    or v_projection.consumer_exposure_authorized
    or v_projection.order_authorized or v_projection.stripe_dispatch_authorized
    or v_projection.booking_authorized or v_projection.payment_authorized
    or v_projection.capture_authorized or v_projection.refund_authorized
    or v_projection.settlement_authorized or v_projection.ticketing_authorized
    or v_projection.servicing_authorized
    or v_projection.consumer_release_enabled
    or v_projection.blind_retry_authorized then
    raise exception 'Flight Consumer Live private-preview projection binding is invalid';
  end if;

  select min(projection.presentation_expires_at), min(projection.offer_expires_at)
    into v_min_presentation, v_min_offer
    from public.flight_consumer_live_public_offer_projections as projection
   where projection.batch_id = v_projection.id;
  if p_exposure_not_after <= v_now
    or p_exposure_not_after > v_now + interval '2 minutes'
    or (p_projected_offer_count = 0
      and (v_min_presentation is not null or v_min_offer is not null))
    or (p_projected_offer_count > 0 and (
      v_min_presentation is null or v_min_offer is null
      or p_exposure_not_after > v_min_presentation
      or p_exposure_not_after > v_min_offer
    )) then
    raise exception 'Flight Consumer Live private-preview exposure lifetime is invalid';
  end if;

  if v_stale.id is null then
    v_mode := 'direct';
  else
    if v_stale.dispatch_receipt_sha256
        is distinct from v_dispatch.dispatch_receipt_sha256
      or v_stale.shopping_attempt_id is distinct from v_attempt.id
      or v_stale.shopping_execution_scope_sha256
        is distinct from v_attempt.execution_scope_sha256
      or v_stale.classification <> 'stale_ambiguous'
      or v_stale.provider_redispatch_authorized
      or v_stale.consumer_exposure_authorized
      or v_stale.blind_retry_authorized
      or v_attempt.completed_at < v_stale.classified_at then
      raise exception 'Flight Consumer Live private-preview stale reconciliation is invalid';
    end if;
    v_mode := 'late_success_after_stale';
    v_stale_id := v_stale.id;
    v_stale_receipt := v_stale.classification_receipt_sha256;
  end if;

  if v_existing.id is not null then
    if v_existing.preview_execution_scope_sha256
        is distinct from p_preview_execution_scope_sha256
      or v_existing.policy_sha256 is distinct from v_admission.policy_sha256
      or v_existing.cohort_sha256 is distinct from v_admission.cohort_sha256
      or v_existing.subject_sha256 is distinct from p_subject_sha256
      or v_existing.membership_event_id is distinct from v_membership.id
      or v_existing.limiter_claim_id is distinct from v_limiter.id
      or v_existing.admission_receipt_sha256
        is distinct from p_admission_receipt_sha256
      or v_existing.request_sha256 is distinct from p_request_sha256
      or v_existing.dispatch_id is distinct from p_dispatch_id
      or v_existing.dispatch_receipt_sha256
        is distinct from p_dispatch_receipt_sha256
      or v_existing.shopping_attempt_id is distinct from v_attempt.id
      or v_existing.projection_batch_id is distinct from v_projection.id
      or v_existing.projection_batch_sha256
        is distinct from p_projection_batch_sha256
      or v_existing.projection_receipt_sha256
        is distinct from p_projection_receipt_sha256
      or v_existing.source_offer_count is distinct from p_source_offer_count
      or v_existing.projected_offer_count is distinct from p_projected_offer_count
      or v_existing.refused_offer_count is distinct from p_refused_offer_count
      or v_existing.reconciliation_mode is distinct from v_mode
      or v_existing.stale_classification_id is distinct from v_stale_id
      or v_existing.stale_classification_receipt_sha256
        is distinct from v_stale_receipt
      or v_existing.exposure_not_after is distinct from p_exposure_not_after then
      raise exception 'Flight Consumer Live private-preview exposure replay collision';
    end if;
    return query select 'replay'::text, v_existing.id,
      v_existing.exposure_receipt_sha256, v_existing.reconciliation_mode,
      v_existing.exposure_not_after, v_existing.source_offer_count,
      v_existing.projected_offer_count, v_existing.refused_offer_count,
      true,false,false,false,false,false,false,false,false,false,false,false,false;
    return;
  end if;

  v_receipt := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:private-preview-exposure-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_preview_execution_scope_sha256 || ':' || v_membership.id::text || ':'
      || v_membership.membership_receipt_sha256 || ':' || v_limiter.id::text
      || ':' || v_limiter.limiter_receipt_sha256 || ':'
      || v_admission.id::text || ':' || v_admission.admission_receipt_sha256
      || ':' || v_admission.request_sha256 || ':' || v_dispatch.id::text
      || ':' || v_dispatch.dispatch_receipt_sha256 || ':' || v_attempt.id::text
      || ':' || v_projection.id::text || ':'
      || v_projection.projection_batch_sha256 || ':'
      || v_projection.projection_receipt_sha256 || ':'
      || p_source_offer_count::text || ':' || p_projected_offer_count::text
      || ':' || p_refused_offer_count::text || ':' || v_mode || ':'
      || coalesce(v_stale_receipt, '-') || ':' || to_char(
        p_exposure_not_after at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ), 'UTF8'
    ), 'sha256'
  ), 'hex');
  insert into public.flight_consumer_live_private_preview_exposures (
    preview_execution_scope_sha256, policy_sha256, cohort_sha256,
    subject_sha256, membership_event_id, membership_receipt_sha256,
    limiter_claim_id, limiter_receipt_sha256, admission_id,
    admission_receipt_sha256, request_sha256, dispatch_id,
    dispatch_receipt_sha256, shopping_attempt_id, projection_batch_id,
    projection_batch_sha256, projection_receipt_sha256, source_offer_count,
    projected_offer_count, refused_offer_count, reconciliation_mode,
    stale_classification_id, stale_classification_receipt_sha256,
    exposure_not_after, private_preview_exposure_authorized,
    exposure_receipt_sha256, created_at
  ) values (
    p_preview_execution_scope_sha256, v_admission.policy_sha256,
    v_admission.cohort_sha256, p_subject_sha256, v_membership.id,
    v_membership.membership_receipt_sha256, v_limiter.id,
    v_limiter.limiter_receipt_sha256, v_admission.id,
    p_admission_receipt_sha256, p_request_sha256, p_dispatch_id,
    p_dispatch_receipt_sha256, v_attempt.id, v_projection.id,
    p_projection_batch_sha256, p_projection_receipt_sha256,
    p_source_offer_count, p_projected_offer_count, p_refused_offer_count,
    v_mode, v_stale_id, v_stale_receipt, p_exposure_not_after, true,
    v_receipt, v_now
  ) returning * into v_exposure;

  return query select 'created'::text, v_exposure.id,
    v_exposure.exposure_receipt_sha256, v_exposure.reconciliation_mode,
    v_exposure.exposure_not_after, v_exposure.source_offer_count,
    v_exposure.projected_offer_count, v_exposure.refused_offer_count,
    true,false,false,false,false,false,false,false,false,false,false,false,false;
end;
$authorize_exposure$;

create function public.read_flight_consumer_live_private_preview_offer_batch_v1(
  p_exposure_receipt_sha256 text,
  p_subject_sha256 text,
  p_request_sha256 text
)
returns table (
  local_offer_id uuid, display_rank integer, owner_name text,
  owner_iata_code text, currency text, base_amount_minor bigint,
  tax_amount_minor bigint, total_amount_minor bigint,
  offer_expires_at timestamptz, presentation_expires_at timestamptz,
  changeable boolean, refundable boolean,
  change_penalty_amount_minor bigint, refund_penalty_amount_minor bigint,
  segment_sequence integer, slice_sequence integer, journey_direction text,
  origin_iata text, destination_iata text, departing_at_local text,
  arriving_at_local text, origin_time_zone text, destination_time_zone text,
  marketing_carrier_name text, marketing_carrier_iata_code text,
  operating_carrier_name text, operating_carrier_iata_code text,
  marketing_flight_number text, duration_minutes integer, cabin text
)
language plpgsql security definer
set search_path = pg_catalog, public
as $read_private_preview$
declare
  v_exposure public.flight_consumer_live_private_preview_exposures;
  v_membership public.flight_consumer_live_private_preview_membership_events;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_exposure_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live private-preview read envelope is invalid';
  end if;
  lock table public.flight_consumer_live_private_preview_membership_events
    in share row exclusive mode;
  select * into v_exposure
    from public.flight_consumer_live_private_preview_exposures as exposure
   where exposure.exposure_receipt_sha256 = p_exposure_receipt_sha256
     and exposure.subject_sha256 = p_subject_sha256
     and exposure.request_sha256 = p_request_sha256
   for share;
  if v_exposure.id is not null then
    select * into v_membership
      from public.flight_consumer_live_private_preview_membership_events as event
     where event.policy_sha256 = v_exposure.policy_sha256
       and event.cohort_sha256 = v_exposure.cohort_sha256
       and event.subject_sha256 = v_exposure.subject_sha256
     order by event.event_sequence desc limit 1;
  end if;
  v_now := clock_timestamp();
  if v_exposure.id is null or not v_exposure.private_preview_exposure_authorized
    or v_exposure.consumer_public_release_authorized
    or v_exposure.order_authorized or v_exposure.stripe_dispatch_authorized
    or v_exposure.booking_authorized or v_exposure.payment_authorized
    or v_exposure.capture_authorized or v_exposure.refund_authorized
    or v_exposure.settlement_authorized or v_exposure.ticketing_authorized
    or v_exposure.servicing_authorized or v_exposure.consumer_release_enabled
    or v_exposure.blind_retry_authorized
    or v_exposure.exposure_not_after <= v_now
    or v_membership.id is null or v_membership.id <> v_exposure.membership_event_id
    or v_membership.membership_receipt_sha256
      is distinct from v_exposure.membership_receipt_sha256
    or v_membership.event_type <> 'granted'
    or v_membership.membership_not_after <= v_now then
    raise exception 'Flight Consumer Live private-preview exposure is unavailable';
  end if;

  return query
  select projection.id, projection.display_rank, projection.owner_name,
         projection.owner_iata_code, projection.currency,
         projection.base_amount_minor, projection.tax_amount_minor,
         projection.total_amount_minor, projection.offer_expires_at,
         projection.presentation_expires_at, projection.changeable,
         projection.refundable, projection.change_penalty_amount_minor,
         projection.refund_penalty_amount_minor, segment.segment_sequence,
         segment.slice_sequence, segment.journey_direction,
         segment.origin_iata, segment.destination_iata,
         segment.departing_at_local, segment.arriving_at_local,
         segment.origin_time_zone, segment.destination_time_zone,
         segment.marketing_carrier_name, segment.marketing_carrier_iata_code,
         segment.operating_carrier_name, segment.operating_carrier_iata_code,
         segment.marketing_flight_number, segment.duration_minutes,
         segment.cabin
    from public.flight_consumer_live_public_offer_projection_batches as batch
    join public.flight_consumer_live_duffel_shopping_attempts as attempt
      on attempt.id = batch.source_shopping_attempt_id
     and attempt.attempt_state = 'succeeded'
     and attempt.attempt_revision = 2
     and attempt.terminal_response_sha256 = batch.source_response_sha256
    join public.flight_consumer_live_public_offer_projections as projection
      on projection.batch_id = batch.id
    join public.flight_consumer_live_public_offer_segments as segment
      on segment.projection_id = projection.id
   where batch.id = v_exposure.projection_batch_id
     and batch.projection_batch_sha256 = v_exposure.projection_batch_sha256
     and batch.projection_receipt_sha256 = v_exposure.projection_receipt_sha256
     and projection.presentation_expires_at > v_now
     and projection.offer_expires_at > v_now
   order by projection.display_rank, segment.segment_sequence;
end;
$read_private_preview$;

alter function public.refuse_flight_consumer_live_private_preview_mutation_v1()
  owner to postgres;
alter function public.record_flight_consumer_live_private_preview_membership_event_v1(
  text,text,text,text,text,timestamptz
) owner to postgres;
alter function public.consume_flight_consumer_live_private_preview_limiter_v1(
  text,text,text,text,text,text
) owner to postgres;
alter function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(
  integer
) owner to postgres;
alter function public.authorize_flight_consumer_live_private_preview_exposure_v1(
  text,uuid,text,text,text,uuid,text,text,text,integer,integer,integer,timestamptz
) owner to postgres;
alter function public.read_flight_consumer_live_private_preview_offer_batch_v1(
  text,text,text
) owner to postgres;

revoke all on function public.refuse_flight_consumer_live_private_preview_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_live_private_preview_membership_event_v1(
  text,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.consume_flight_consumer_live_private_preview_limiter_v1(
  text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.authorize_flight_consumer_live_private_preview_exposure_v1(
  text,uuid,text,text,text,uuid,text,text,text,integer,integer,integer,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.read_flight_consumer_live_private_preview_offer_batch_v1(
  text,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.record_flight_consumer_live_private_preview_membership_event_v1(
  text,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.consume_flight_consumer_live_private_preview_limiter_v1(
  text,text,text,text,text,text
) to service_role;
grant execute on function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(
  integer
) to service_role;
grant execute on function public.authorize_flight_consumer_live_private_preview_exposure_v1(
  text,uuid,text,text,text,uuid,text,text,text,integer,integer,integer,timestamptz
) to service_role;
grant execute on function public.read_flight_consumer_live_private_preview_offer_batch_v1(
  text,text,text
) to service_role;

comment on table public.flight_consumer_live_private_preview_membership_events is
  'Server-owned append-only private-cohort grants and revocations, bound only to policy/cohort/subject digests. No consumer identity, PII, provider, order, or payment data.';
comment on function public.consume_flight_consumer_live_private_preview_limiter_v1(
  text,text,text,text,text,text
) is
  'Concrete distributed pre-admission limiter with fixed Gate 115 budgets, current membership validation, exact allowed replay, and bounded refusal buckets. It grants no provider or commercial authority.';
comment on table public.flight_consumer_live_private_preview_stale_dispatches is
  'Nonterminal classification of an expired, consumed, still-dispatching Gate 119 attempt. It never permits redispatch and preserves trusted late-success completion.';
comment on table public.flight_consumer_live_private_preview_exposures is
  'One immutable private-preview display receipt for an exact current member, limiter claim, admission, succeeded dispatch, Gate 118 source header, and Gate 116 safe projection batch. Public release and every commercial authority remain false.';
comment on function public.read_flight_consumer_live_private_preview_offer_batch_v1(
  text,text,text
) is
  'Reads only the consumer-safe Gate 116 fields while an exact private-preview exposure receipt and its latest membership grant remain active.';

commit;
