begin;

revoke all on function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
) from public, anon, authenticated, service_role;

lock table public.flight_consumer_live_stripe_payment_intent_plans
  in access exclusive mode;

do $flight_consumer_live_stripe_payment_intent_plan_rollback_guard$
begin
  if exists (
    select 1
      from public.flight_consumer_live_stripe_payment_intent_plans
  ) then
    raise exception 'Refusing rollback: Flight Consumer Live Stripe payment evidence exists';
  end if;
end;
$flight_consumer_live_stripe_payment_intent_plan_rollback_guard$;

drop function public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
  text, text, text, text, text, text, text, text, text, text, text, bigint
);
drop table public.flight_consumer_live_stripe_payment_intent_plans;

commit;
