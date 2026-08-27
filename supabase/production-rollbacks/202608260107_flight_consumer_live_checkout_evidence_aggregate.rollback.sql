begin;

lock table
  public.flight_consumer_live_checkout_evidence_receipts,
  public.flight_consumer_live_checkout_evidence_aggregates
in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_checkout_evidence_receipts
  ) or exists (
    select 1
      from public.flight_consumer_live_checkout_evidence_aggregates
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live checkout evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_checkout_evidence_receipt_guard
  on public.flight_consumer_live_checkout_evidence_receipts;
drop trigger flight_consumer_live_checkout_evidence_guard
  on public.flight_consumer_live_checkout_evidence_aggregates;

drop function public.abandon_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text, text
);
drop function public.finalize_flight_consumer_live_checkout_evidence_v1(
  uuid, integer, text, text, text
);
drop function public.prepare_flight_consumer_live_checkout_evidence_v1(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  uuid, text, uuid, text, text, text, text, text, text, bigint, text,
  text, text, text, text, text, text, text, text, timestamptz
);
drop function public.protect_flight_consumer_live_checkout_receipt_v1();
drop function public.protect_flight_consumer_live_checkout_evidence_v1();

drop table public.flight_consumer_live_checkout_evidence_receipts;
drop table public.flight_consumer_live_checkout_evidence_aggregates;

commit;
