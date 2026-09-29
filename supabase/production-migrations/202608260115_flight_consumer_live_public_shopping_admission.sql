begin;

-- Gate 115 is an admission and budget plane only. It records digest-bound,
-- authenticated-subject decisions and cannot dispatch Duffel, expose offers,
-- create an order, charge a payment method, settle, ticket, or service travel.
do $migration$
begin
  if to_regclass('public.flight_consumer_live_duffel_shopping_attempts') is null
    or to_regclass('public.flight_consumer_live_duffel_offer_sources') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live public-shopping admission requires the reviewed 101 and 105 shopping prerequisites';
  end if;
end;
$migration$;

create table public.flight_consumer_live_public_shopping_admissions (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 text not null
    check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  admission_policy_sha256 text not null
    check (admission_policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null
    check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null
    check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  admission_state text not null
    check (admission_state in ('admitted', 'refused')),
  refusal_code text check (
    refusal_code is null or refusal_code in (
      'subject_minute_budget_exhausted',
      'subject_day_budget_exhausted',
      'cohort_minute_budget_exhausted',
      'cohort_day_budget_exhausted',
      'global_minute_budget_exhausted',
      'global_day_budget_exhausted'
    )
  ),
  budget_claimed boolean not null,
  claim_expires_at timestamptz,
  refusal_bucket_sha256 text check (
    refusal_bucket_sha256 is null
    or refusal_bucket_sha256 ~ '^[0-9a-f]{64}$'
  ),
  subject_minute_claim_count integer not null check (
    subject_minute_claim_count >= 0
  ),
  subject_day_claim_count integer not null check (
    subject_day_claim_count >= 0
  ),
  cohort_minute_claim_count integer not null check (
    cohort_minute_claim_count >= 0
  ),
  cohort_day_claim_count integer not null check (
    cohort_day_claim_count >= 0
  ),
  global_minute_claim_count integer not null check (
    global_minute_claim_count >= 0
  ),
  global_day_claim_count integer not null check (
    global_day_claim_count >= 0
  ),
  admission_receipt_sha256 text not null unique
    check (admission_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false
    check (not booking_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  settlement_authorized boolean not null default false
    check (not settlement_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, idempotency_sha256),
  constraint flight_consumer_live_public_shopping_refusal_bucket_uniq
    unique (execution_scope_sha256, refusal_bucket_sha256),
  check (
    (admission_state = 'admitted'
      and refusal_code is null
      and budget_claimed
      and claim_expires_at = created_at + interval '60 seconds'
      and refusal_bucket_sha256 is null)
    or (admission_state = 'refused'
      and refusal_code is not null
      and not budget_claimed
      and claim_expires_at is null
      and refusal_bucket_sha256 is not null)
  )
);

create index flight_consumer_live_public_shopping_subject_budget_idx
  on public.flight_consumer_live_public_shopping_admissions (
    execution_scope_sha256, subject_sha256, created_at desc
  ) where budget_claimed;

create index flight_consumer_live_public_shopping_cohort_budget_idx
  on public.flight_consumer_live_public_shopping_admissions (
    execution_scope_sha256, cohort_sha256, created_at desc
  ) where budget_claimed;

create index flight_consumer_live_public_shopping_global_budget_idx
  on public.flight_consumer_live_public_shopping_admissions (
    execution_scope_sha256, created_at desc
  ) where budget_claimed;

alter table public.flight_consumer_live_public_shopping_admissions
  enable row level security;
alter table public.flight_consumer_live_public_shopping_admissions
  force row level security;
revoke all on table public.flight_consumer_live_public_shopping_admissions
  from public, anon, authenticated, service_role;

create function public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $refuse_flight_consumer_live_public_shopping_admission_mutation_v1$
begin
  raise exception
    'Flight Consumer Live public-shopping admission evidence is append-only';
end;
$refuse_flight_consumer_live_public_shopping_admission_mutation_v1$;

create trigger flight_consumer_live_public_shopping_admission_immutable
before update or delete on public.flight_consumer_live_public_shopping_admissions
for each row execute function
  public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1();

create function public.reserve_flight_consumer_live_public_shopping_admission_v1(
  p_execution_scope_sha256 text,
  p_policy_sha256 text,
  p_cohort_sha256 text,
  p_subject_sha256 text,
  p_idempotency_sha256 text,
  p_request_sha256 text
)
returns table (
  decision text,
  admission_id uuid,
  admission_policy_sha256 text,
  admission_state text,
  refusal_code text,
  budget_claimed boolean,
  claim_expires_at timestamptz,
  subject_minute_claim_count integer,
  subject_day_claim_count integer,
  cohort_minute_claim_count integer,
  cohort_day_claim_count integer,
  global_minute_claim_count integer,
  global_day_claim_count integer,
  admission_receipt_sha256 text,
  provider_dispatch_authorized boolean,
  consumer_exposure_authorized boolean,
  order_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
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
as $reserve_flight_consumer_live_public_shopping_admission_v1$
declare
  v_admission public.flight_consumer_live_public_shopping_admissions;
  v_now timestamptz;
  v_admission_id uuid := gen_random_uuid();
  v_admission_policy_sha256 text;
  v_state text := 'admitted';
  v_refusal_code text := null;
  v_budget_claimed boolean := true;
  v_claim_expires_at timestamptz;
  v_refusal_bucket_sha256 text := null;
  v_subject_minute integer;
  v_subject_day integer;
  v_cohort_minute integer;
  v_cohort_day integer;
  v_global_minute integer;
  v_global_day integer;
  v_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live public-shopping admission is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_cohort_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or cardinality(array(
      select distinct value
        from unnest(array[
          p_execution_scope_sha256,
          p_policy_sha256,
          p_cohort_sha256,
          p_subject_sha256,
          p_idempotency_sha256,
          p_request_sha256
        ]) as value
    )) <> 6 then
    raise exception 'Flight Consumer Live public-shopping admission envelope is invalid';
  end if;

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
    ),
    'sha256'
  ), 'hex');

  -- The fixed low-volume budgets prioritize correctness and determinism over
  -- throughput. This table lock serializes every admission decision.
  lock table public.flight_consumer_live_public_shopping_admissions
    in share row exclusive mode;

  -- Refresh trusted time only after obtaining the serialization lock. A
  -- queued call must never create a claim whose 60-second lease has already
  -- elapsed while it waited for the lock.
  v_now := clock_timestamp();
  v_claim_expires_at := v_now + interval '60 seconds';

  select * into v_admission
    from public.flight_consumer_live_public_shopping_admissions as admission
   where admission.execution_scope_sha256 = p_execution_scope_sha256
     and admission.idempotency_sha256 = p_idempotency_sha256;
  if found then
    if v_admission.policy_sha256 is distinct from p_policy_sha256
      or v_admission.cohort_sha256 is distinct from p_cohort_sha256
      or v_admission.subject_sha256 is distinct from p_subject_sha256
      or v_admission.request_sha256 is distinct from p_request_sha256 then
      raise exception
        'Flight Consumer Live public-shopping admission idempotency collision';
    end if;
    return query select
      'replay'::text,
      v_admission.id,
      v_admission.admission_policy_sha256,
      v_admission.admission_state,
      v_admission.refusal_code,
      v_admission.budget_claimed,
      v_admission.claim_expires_at,
      v_admission.subject_minute_claim_count,
      v_admission.subject_day_claim_count,
      v_admission.cohort_minute_claim_count,
      v_admission.cohort_day_claim_count,
      v_admission.global_minute_claim_count,
      v_admission.global_day_claim_count,
      v_admission.admission_receipt_sha256,
      false, false, false, false, false, false, false, false, false,
      false, false, false, false;
    return;
  end if;

  select
    count(*) filter (
      where admission.subject_sha256 = p_subject_sha256
        and admission.created_at > v_now - interval '1 minute'
    )::integer,
    count(*) filter (
      where admission.subject_sha256 = p_subject_sha256
        and admission.created_at > v_now - interval '1 day'
    )::integer,
    count(*) filter (
      where admission.cohort_sha256 = p_cohort_sha256
        and admission.created_at > v_now - interval '1 minute'
    )::integer,
    count(*) filter (
      where admission.cohort_sha256 = p_cohort_sha256
        and admission.created_at > v_now - interval '1 day'
    )::integer,
    count(*) filter (
      where admission.created_at > v_now - interval '1 minute'
    )::integer,
    count(*) filter (
      where admission.created_at > v_now - interval '1 day'
    )::integer
  into
    v_subject_minute,
    v_subject_day,
    v_cohort_minute,
    v_cohort_day,
    v_global_minute,
    v_global_day
  from public.flight_consumer_live_public_shopping_admissions as admission
  where admission.execution_scope_sha256 = p_execution_scope_sha256
    and admission.budget_claimed;

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

  if v_refusal_code is null then
    v_subject_minute := v_subject_minute + 1;
    v_subject_day := v_subject_day + 1;
    v_cohort_minute := v_cohort_minute + 1;
    v_cohort_day := v_cohort_day + 1;
    v_global_minute := v_global_minute + 1;
    v_global_day := v_global_day + 1;
  else
    v_state := 'refused';
    v_budget_claimed := false;
    v_claim_expires_at := null;
    v_refusal_bucket_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:public-shopping-refusal-bucket:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        p_execution_scope_sha256 || ':'
        || v_refusal_code || ':'
        || case
          when v_refusal_code like 'subject_%' then p_subject_sha256
          when v_refusal_code like 'cohort_%' then p_cohort_sha256
          else p_execution_scope_sha256
        end || ':'
        || case
          when v_refusal_code like '%_minute_%' then to_char(
            date_trunc('minute', v_now at time zone 'UTC'),
            'YYYY-MM-DD"T"HH24:MI:00"Z"'
          )
          else to_char(
            date_trunc('day', v_now at time zone 'UTC'),
            'YYYY-MM-DD"T"00:00:00"Z"'
          )
        end,
        'UTF8'
      ),
      'sha256'
    ), 'hex');
  end if;

  v_receipt_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-shopping-admission-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_admission_id::text || ':'
      || p_execution_scope_sha256 || ':'
      || p_policy_sha256 || ':'
      || v_admission_policy_sha256 || ':'
      || p_cohort_sha256 || ':'
      || p_subject_sha256 || ':'
      || p_idempotency_sha256 || ':'
      || p_request_sha256 || ':'
      || v_state || ':'
      || coalesce(v_refusal_code, '-') || ':'
      || coalesce(v_refusal_bucket_sha256, '-') || ':'
      || v_budget_claimed::text || ':'
      || coalesce(
        to_char(
          v_claim_expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        '-'
      ) || ':'
      || v_subject_minute::text || ':'
      || v_subject_day::text || ':'
      || v_cohort_minute::text || ':'
      || v_cohort_day::text || ':'
      || v_global_minute::text || ':'
      || v_global_day::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_public_shopping_admissions (
    id,
    execution_scope_sha256,
    policy_sha256,
    admission_policy_sha256,
    cohort_sha256,
    subject_sha256,
    idempotency_sha256,
    request_sha256,
    admission_state,
    refusal_code,
    budget_claimed,
    claim_expires_at,
    refusal_bucket_sha256,
    subject_minute_claim_count,
    subject_day_claim_count,
    cohort_minute_claim_count,
    cohort_day_claim_count,
    global_minute_claim_count,
    global_day_claim_count,
    admission_receipt_sha256,
    created_at
  ) values (
    v_admission_id,
    p_execution_scope_sha256,
    p_policy_sha256,
    v_admission_policy_sha256,
    p_cohort_sha256,
    p_subject_sha256,
    p_idempotency_sha256,
    p_request_sha256,
    v_state,
    v_refusal_code,
    v_budget_claimed,
    v_claim_expires_at,
    v_refusal_bucket_sha256,
    v_subject_minute,
    v_subject_day,
    v_cohort_minute,
    v_cohort_day,
    v_global_minute,
    v_global_day,
    v_receipt_sha256,
    v_now
  ) on conflict on constraint
      flight_consumer_live_public_shopping_refusal_bucket_uniq
    do nothing
  returning * into v_admission;

  if not found then
    select * into v_admission
      from public.flight_consumer_live_public_shopping_admissions as admission
     where admission.execution_scope_sha256 = p_execution_scope_sha256
       and admission.admission_state = 'refused'
       and admission.refusal_bucket_sha256 = v_refusal_bucket_sha256;
    if not found then
      raise exception
        'Flight Consumer Live public-shopping refusal coalescing failed';
    end if;
  end if;

  return query select
    case when v_admission.admission_state = 'admitted'
      then 'created'::text else 'refused'::text end,
    v_admission.id,
    v_admission.admission_policy_sha256,
    v_admission.admission_state,
    v_admission.refusal_code,
    v_admission.budget_claimed,
    v_admission.claim_expires_at,
    v_admission.subject_minute_claim_count,
    v_admission.subject_day_claim_count,
    v_admission.cohort_minute_claim_count,
    v_admission.cohort_day_claim_count,
    v_admission.global_minute_claim_count,
    v_admission.global_day_claim_count,
    v_admission.admission_receipt_sha256,
    false, false, false, false, false, false, false, false, false,
    false, false, false, false;
end;
$reserve_flight_consumer_live_public_shopping_admission_v1$;

alter function
  public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1()
  owner to postgres;
alter function
  public.reserve_flight_consumer_live_public_shopping_admission_v1(
    text, text, text, text, text, text
  ) owner to postgres;

revoke all on function
  public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.reserve_flight_consumer_live_public_shopping_admission_v1(
    text, text, text, text, text, text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.reserve_flight_consumer_live_public_shopping_admission_v1(
    text, text, text, text, text, text
  ) to service_role;

comment on table public.flight_consumer_live_public_shopping_admissions is
  'Append-only digest admission and fixed budget evidence with bounded per-window refusal coalescing. No provider, PII, order, payment, settlement, ticket, servicing, or consumer-release authority.';
comment on function
  public.reserve_flight_consumer_live_public_shopping_admission_v1(
    text, text, text, text, text, text
  ) is
  'Reserves a one-minute public-shopping budget claim only. It never dispatches a provider request and grants no downstream authority.';

commit;
