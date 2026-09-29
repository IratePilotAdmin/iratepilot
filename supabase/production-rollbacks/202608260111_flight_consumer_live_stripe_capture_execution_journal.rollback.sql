begin;

lock table
  public.flight_consumer_live_stripe_capture_attempts,
  public.flight_consumer_live_stripe_capture_receipts
in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_stripe_capture_attempts
  ) or exists (
    select 1
      from public.flight_consumer_live_stripe_capture_receipts
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Stripe capture evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_stripe_capture_receipt_append_guard
  on public.flight_consumer_live_stripe_capture_receipts;
drop trigger flight_consumer_live_stripe_capture_transition_guard
  on public.flight_consumer_live_stripe_capture_attempts;

drop function public.reconcile_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text, integer, text, text, text, text,
  bigint, text, boolean, text, text, text
);
drop function public.complete_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text
);
drop function public.claim_flight_consumer_live_stripe_capture_v1(
  uuid, integer, text, text, text, text
);
drop function public.prepare_flight_consumer_live_stripe_capture_v1(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, bigint, text, timestamptz,
  timestamptz
);
drop function public.protect_flight_consumer_live_stripe_capture_receipt_v1();
drop function public.protect_flight_consumer_live_stripe_capture_v1();

drop table public.flight_consumer_live_stripe_capture_receipts;
drop table public.flight_consumer_live_stripe_capture_attempts;

commit;
