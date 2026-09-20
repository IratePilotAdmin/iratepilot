begin;

-- This journal can persist only the digest-only output of the reviewed
-- zero-dispatch PaymentIntent planner. It cannot call Stripe, accept a
-- payment method, create or confirm a PaymentIntent, capture, refund, create
-- an order, issue a ticket, or release the consumer booking flow.
create table public.flight_consumer_live_stripe_payment_intent_plans (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_sha256 text not null
    check (payment_binding_sha256 ~ '^[0-9a-f]{64}$'),
  order_reference_sha256 text not null
    check (order_reference_sha256 ~ '^[0-9a-f]{64}$'),
  customer_reference_sha256 text not null
    check (customer_reference_sha256 ~ '^[0-9a-f]{64}$'),
  payment_attempt_reference_sha256 text not null
    check (payment_attempt_reference_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_sha256 text not null
    check (metadata_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null
    check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  request_envelope_sha256 text not null
    check (request_envelope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_request_sha256 text not null
    check (idempotency_request_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text not null unique
    check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  plan_version text not null
    default 'flight-consumer-production-stripe-payment-intent-plan-v1'
    check (
      plan_version = 'flight-consumer-production-stripe-payment-intent-plan-v1'
    ),
  plan_mode text not null default 'zero_dispatch'
    check (plan_mode = 'zero_dispatch'),
  processor_id text not null default 'stripe_live'
    check (processor_id = 'stripe_live'),
  amount_cents bigint not null
    check (amount_cents between 50 and 99999999),
  currency text not null default 'usd'
    check (currency = 'usd'),
  capture_method text not null default 'manual'
    check (capture_method = 'manual'),
  confirmation_method text not null default 'automatic'
    check (confirmation_method = 'automatic'),
  payment_method_type text not null default 'card'
    check (payment_method_type = 'card'),
  provider_request_count smallint not null default 0
    check (provider_request_count = 0),
  stripe_request_count smallint not null default 0
    check (stripe_request_count = 0),
  stripe_mutation_count smallint not null default 0
    check (stripe_mutation_count = 0),
  payment_intent_count smallint not null default 0
    check (payment_intent_count = 0),
  charge_count smallint not null default 0
    check (charge_count = 0),
  refund_count smallint not null default 0
    check (refund_count = 0),
  external_request_made boolean not null default false
    check (not external_request_made),
  raw_payment_method_accepted boolean not null default false
    check (not raw_payment_method_accepted),
  client_secret_exposed boolean not null default false
    check (not client_secret_exposed),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  order_authorized boolean not null default false
    check (not order_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, idempotency_key_sha256),
  unique (execution_scope_sha256, payment_attempt_reference_sha256),
  check (
    order_reference_sha256 <> customer_reference_sha256
    and order_reference_sha256 <> payment_attempt_reference_sha256
    and customer_reference_sha256 <> payment_attempt_reference_sha256
  )
);

create index flight_consumer_live_stripe_payment_intent_plans_recorded_idx
  on public.flight_consumer_live_stripe_payment_intent_plans (
    recorded_at desc
  );

alter table public.flight_consumer_live_stripe_payment_intent_plans
  enable row level security;
alter table public.flight_consumer_live_stripe_payment_intent_plans
  force row level security;

revoke all on table public.flight_consumer_live_stripe_payment_intent_plans
  from public, anon, authenticated, service_role;

create function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  p_execution_scope_sha256 text,
  p_payment_binding_sha256 text,
  p_order_reference_sha256 text,
  p_customer_reference_sha256 text,
  p_payment_attempt_reference_sha256 text,
  p_metadata_sha256 text,
  p_request_body_sha256 text,
  p_request_envelope_sha256 text,
  p_idempotency_request_sha256 text,
  p_idempotency_key_sha256 text,
  p_plan_sha256 text,
  p_amount_cents bigint
)
returns table (
  decision text,
  plan_id uuid,
  recorded_plan_sha256 text,
  plan_mode text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_live_stripe_payment_intent_plan_v1$
declare
  v_plan public.flight_consumer_live_stripe_payment_intent_plans;
  v_match_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Stripe payment plan journal is service-role only';
  end if;
  if p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_binding_sha256 is null
    or p_payment_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_order_reference_sha256 is null
    or p_order_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_customer_reference_sha256 is null
    or p_customer_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_attempt_reference_sha256 is null
    or p_payment_attempt_reference_sha256 !~ '^[0-9a-f]{64}$'
    or p_metadata_sha256 is null
    or p_metadata_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_body_sha256 is null
    or p_request_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_envelope_sha256 is null
    or p_request_envelope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_request_sha256 is null
    or p_idempotency_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_key_sha256 is null
    or p_idempotency_key_sha256 !~ '^[0-9a-f]{64}$'
    or p_plan_sha256 is null
    or p_plan_sha256 !~ '^[0-9a-f]{64}$'
    or p_amount_cents is null
    or p_amount_cents < 50
    or p_amount_cents > 99999999
    or p_order_reference_sha256 = p_customer_reference_sha256
    or p_order_reference_sha256 = p_payment_attempt_reference_sha256
    or p_customer_reference_sha256 = p_payment_attempt_reference_sha256 then
    raise exception 'Flight Consumer Live Stripe payment plan evidence is invalid';
  end if;

  select count(*)
    into v_match_count
    from public.flight_consumer_live_stripe_payment_intent_plans as candidate
   where (
       candidate.execution_scope_sha256 = p_execution_scope_sha256
       and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
     )
      or (
       candidate.execution_scope_sha256 = p_execution_scope_sha256
       and candidate.payment_attempt_reference_sha256 =
         p_payment_attempt_reference_sha256
     )
      or candidate.plan_sha256 = p_plan_sha256;

  if v_match_count > 1 then
    raise exception 'Flight Consumer Live Stripe payment plan identity is ambiguous';
  elsif v_match_count = 1 then
    select candidate.*
      into v_plan
      from public.flight_consumer_live_stripe_payment_intent_plans as candidate
     where (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
       )
        or (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.payment_attempt_reference_sha256 =
           p_payment_attempt_reference_sha256
       )
        or candidate.plan_sha256 = p_plan_sha256
     for update;
    if row(
      v_plan.execution_scope_sha256,
      v_plan.payment_binding_sha256,
      v_plan.order_reference_sha256,
      v_plan.customer_reference_sha256,
      v_plan.payment_attempt_reference_sha256,
      v_plan.metadata_sha256,
      v_plan.request_body_sha256,
      v_plan.request_envelope_sha256,
      v_plan.idempotency_request_sha256,
      v_plan.idempotency_key_sha256,
      v_plan.plan_sha256,
      v_plan.amount_cents
    ) is distinct from row(
      p_execution_scope_sha256,
      p_payment_binding_sha256,
      p_order_reference_sha256,
      p_customer_reference_sha256,
      p_payment_attempt_reference_sha256,
      p_metadata_sha256,
      p_request_body_sha256,
      p_request_envelope_sha256,
      p_idempotency_request_sha256,
      p_idempotency_key_sha256,
      p_plan_sha256,
      p_amount_cents
    ) then
      raise exception 'Flight Consumer Live Stripe payment plan idempotency collision';
    end if;
    return query select
      'replay'::text,
      v_plan.id,
      v_plan.plan_sha256,
      v_plan.plan_mode;
    return;
  end if;

  insert into public.flight_consumer_live_stripe_payment_intent_plans (
    execution_scope_sha256,
    payment_binding_sha256,
    order_reference_sha256,
    customer_reference_sha256,
    payment_attempt_reference_sha256,
    metadata_sha256,
    request_body_sha256,
    request_envelope_sha256,
    idempotency_request_sha256,
    idempotency_key_sha256,
    plan_sha256,
    amount_cents
  ) values (
    p_execution_scope_sha256,
    p_payment_binding_sha256,
    p_order_reference_sha256,
    p_customer_reference_sha256,
    p_payment_attempt_reference_sha256,
    p_metadata_sha256,
    p_request_body_sha256,
    p_request_envelope_sha256,
    p_idempotency_request_sha256,
    p_idempotency_key_sha256,
    p_plan_sha256,
    p_amount_cents
  ) returning * into v_plan;

  return query select
    'created'::text,
    v_plan.id,
    v_plan.plan_sha256,
    v_plan.plan_mode;
exception
  when unique_violation then
    select count(*)
      into v_match_count
      from public.flight_consumer_live_stripe_payment_intent_plans as candidate
     where (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
       )
        or (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.payment_attempt_reference_sha256 =
           p_payment_attempt_reference_sha256
       )
        or candidate.plan_sha256 = p_plan_sha256;
    if v_match_count <> 1 then
      raise exception 'Flight Consumer Live Stripe payment plan concurrency collision';
    end if;
    select candidate.*
      into v_plan
      from public.flight_consumer_live_stripe_payment_intent_plans as candidate
     where (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.idempotency_key_sha256 = p_idempotency_key_sha256
       )
        or (
         candidate.execution_scope_sha256 = p_execution_scope_sha256
         and candidate.payment_attempt_reference_sha256 =
           p_payment_attempt_reference_sha256
       )
        or candidate.plan_sha256 = p_plan_sha256
     for update;
    if row(
      v_plan.execution_scope_sha256,
      v_plan.payment_binding_sha256,
      v_plan.order_reference_sha256,
      v_plan.customer_reference_sha256,
      v_plan.payment_attempt_reference_sha256,
      v_plan.metadata_sha256,
      v_plan.request_body_sha256,
      v_plan.request_envelope_sha256,
      v_plan.idempotency_request_sha256,
      v_plan.idempotency_key_sha256,
      v_plan.plan_sha256,
      v_plan.amount_cents
    ) is distinct from row(
      p_execution_scope_sha256,
      p_payment_binding_sha256,
      p_order_reference_sha256,
      p_customer_reference_sha256,
      p_payment_attempt_reference_sha256,
      p_metadata_sha256,
      p_request_body_sha256,
      p_request_envelope_sha256,
      p_idempotency_request_sha256,
      p_idempotency_key_sha256,
      p_plan_sha256,
      p_amount_cents
    ) then
      raise exception 'Flight Consumer Live Stripe payment plan concurrency collision';
    end if;
    return query select
      'replay'::text,
      v_plan.id,
      v_plan.plan_sha256,
      v_plan.plan_mode;
end;
$record_flight_consumer_live_stripe_payment_intent_plan_v1$;

alter function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) owner to postgres;

revoke all on function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) to service_role;

comment on table public.flight_consumer_live_stripe_payment_intent_plans is
  'Digest-only Production Stripe PaymentIntent zero-dispatch plan journal. It stores no raw identifiers, payloads, credentials, payment methods, client secrets, provider objects, orders, or tickets.';

comment on function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) is
  'Records or exactly replays immutable zero-dispatch plan evidence. It grants no Stripe mutation, payment, order, capture, refund, ticketing, or consumer-release authority.';

commit;
