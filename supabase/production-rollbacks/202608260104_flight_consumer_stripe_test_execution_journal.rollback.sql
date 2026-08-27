begin;

revoke all on function
  public.recover_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.record_flight_consumer_stripe_test_payment_observation_v1(
    uuid, integer, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, bigint, bigint, bigint, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_stripe_test_payment_attempt_v1(
    uuid, integer, text, text, integer
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
    text, text, text, text, text, text, text, text, text, text, text, bigint
  ) from public, anon, authenticated, service_role;

lock table public.flight_consumer_stripe_test_payment_observations
  in access exclusive mode;
lock table public.flight_consumer_stripe_test_webhook_events
  in access exclusive mode;
lock table public.flight_consumer_stripe_test_payment_attempts
  in access exclusive mode;

do $flight_consumer_stripe_test_execution_rollback_guard$
begin
  if exists (
    select 1 from public.flight_consumer_stripe_test_payment_observations
  ) or exists (
    select 1 from public.flight_consumer_stripe_test_webhook_events
  ) or exists (
    select 1 from public.flight_consumer_stripe_test_payment_attempts
  ) then
    raise exception 'Refusing rollback: Flight Consumer Stripe TEST execution evidence exists';
  end if;
end;
$flight_consumer_stripe_test_execution_rollback_guard$;

drop trigger flight_consumer_stripe_test_observation_append_guard
  on public.flight_consumer_stripe_test_payment_observations;
drop trigger flight_consumer_stripe_test_webhook_append_guard
  on public.flight_consumer_stripe_test_webhook_events;
drop trigger flight_consumer_stripe_test_attempt_transition_guard
  on public.flight_consumer_stripe_test_payment_attempts;

drop function public.recover_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, text, text, text
);
drop function public.record_flight_consumer_stripe_test_payment_observation_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, bigint, bigint, bigint, boolean
);
drop function public.claim_flight_consumer_stripe_test_payment_attempt_v1(
  uuid, integer, text, text, integer
);
drop function public.prepare_flight_consumer_stripe_test_payment_attempt_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
);
drop function public.protect_flight_consumer_stripe_test_append_only_v1();
drop function public.protect_flight_consumer_stripe_test_payment_attempt_v1();

drop table public.flight_consumer_stripe_test_payment_observations;
drop table public.flight_consumer_stripe_test_webhook_events;
drop table public.flight_consumer_stripe_test_payment_attempts;

commit;
