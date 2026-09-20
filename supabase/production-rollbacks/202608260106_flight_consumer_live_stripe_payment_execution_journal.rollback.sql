begin;

revoke all on function
  public.recover_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.complete_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, text, text, text, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.claim_flight_consumer_live_stripe_payment_execution_v1(
    uuid, integer, text, text, integer
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.prepare_flight_consumer_live_stripe_payment_execution_v1(
    uuid, text, text, text, timestamptz
  ) from public, anon, authenticated, service_role;

lock table public.flight_consumer_live_stripe_payment_execution_receipts
  in access exclusive mode;
lock table public.flight_consumer_live_stripe_payment_executions
  in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_stripe_payment_execution_receipts
  ) or exists (
    select 1 from public.flight_consumer_live_stripe_payment_executions
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Stripe execution evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_stripe_execution_receipt_append_guard
  on public.flight_consumer_live_stripe_payment_execution_receipts;
drop trigger flight_consumer_live_stripe_execution_transition_guard
  on public.flight_consumer_live_stripe_payment_executions;

drop function public.recover_flight_consumer_live_stripe_payment_execution_v1(
  uuid, integer, text, text, text, text, text, text, text, boolean
);
drop function
  public.mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1(
    uuid, integer, text, text, text, text, boolean
  );
drop function public.complete_flight_consumer_live_stripe_payment_execution_v1(
  uuid, integer, text, text, text, text, text, text, boolean
);
drop function public.claim_flight_consumer_live_stripe_payment_execution_v1(
  uuid, integer, text, text, integer
);
drop function public.prepare_flight_consumer_live_stripe_payment_execution_v1(
  uuid, text, text, text, timestamptz
);
drop function public.protect_flight_consumer_live_stripe_execution_receipt_v1();
drop function public.protect_flight_consumer_live_stripe_payment_execution_v1();

drop table public.flight_consumer_live_stripe_payment_execution_receipts;
drop table public.flight_consumer_live_stripe_payment_executions;

commit;
