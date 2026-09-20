begin;

do $rollback_prerequisite$
begin
  if to_regclass(
    'public.flight_consumer_live_booking_settlements'
  ) is null
    or to_regclass(
      'public.flight_consumer_live_booking_settlement_receipts'
    ) is null then
    raise exception
      'Refusing rollback: Flight Consumer Live booking settlement objects are incomplete';
  end if;
end;
$rollback_prerequisite$;

lock table
  public.flight_consumer_live_booking_settlement_receipts,
  public.flight_consumer_live_booking_settlements
in access exclusive mode;

do $rollback_guard$
begin
  if exists (
    select 1 from public.flight_consumer_live_booking_settlements limit 1
  ) or exists (
    select 1
      from public.flight_consumer_live_booking_settlement_receipts
     limit 1
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live booking settlement evidence exists';
  end if;
end;
$rollback_guard$;

drop trigger flight_consumer_live_booking_settlement_receipt_guard
  on public.flight_consumer_live_booking_settlement_receipts;
drop trigger flight_consumer_live_booking_settlement_transition_guard
  on public.flight_consumer_live_booking_settlements;

drop function public.finalize_flight_consumer_live_booking_settlement_v1(
  uuid, integer, text, text, text
);
drop function public.prepare_flight_consumer_live_booking_settlement_v1(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, bigint, text
);
drop function public.protect_flight_consumer_live_booking_settlement_receipt_v1();
drop function public.protect_flight_consumer_live_booking_settlement_v1();

drop table public.flight_consumer_live_booking_settlement_receipts;
drop table public.flight_consumer_live_booking_settlements;

commit;
