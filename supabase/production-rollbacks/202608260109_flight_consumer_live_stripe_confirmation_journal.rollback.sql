begin;

lock table public.flight_consumer_live_stripe_confirmation_receipts
  in access exclusive mode;
lock table public.flight_consumer_live_stripe_confirmation_attempts
  in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_stripe_confirmation_receipts
  ) or exists (
    select 1
      from public.flight_consumer_live_stripe_confirmation_attempts
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Stripe confirmation evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_stripe_confirmation_receipt_guard
  on public.flight_consumer_live_stripe_confirmation_receipts;
drop trigger flight_consumer_live_stripe_confirmation_guard
  on public.flight_consumer_live_stripe_confirmation_attempts;

drop function public.reconcile_flight_consumer_live_stripe_confirmation_v1(
  uuid, integer, text, text, text, text, bigint, text, boolean, text,
  text, text, text, text, text, text, text, boolean
);
drop function public.mark_flight_consumer_live_stripe_confirmation_ambiguous_v1(
  uuid, integer, text, text, text, text, text, boolean
);
drop function public.record_flight_consumer_live_stripe_confirmation_terminal_v1(
  uuid, integer, text, text, text, text, text, bigint, text, boolean,
  text, text, text, text, text, text, text, boolean
);
drop function public.claim_flight_consumer_live_stripe_confirmation_handoff_v1(
  uuid, integer, text, text, text, integer, text
);
drop function public.prepare_flight_consumer_live_stripe_confirmation_v1(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz
);
drop function
  public.protect_flight_consumer_live_stripe_confirmation_receipt_v1();
drop function public.protect_flight_consumer_live_stripe_confirmation_v1();

drop table public.flight_consumer_live_stripe_confirmation_receipts;
drop table public.flight_consumer_live_stripe_confirmation_attempts;

commit;
