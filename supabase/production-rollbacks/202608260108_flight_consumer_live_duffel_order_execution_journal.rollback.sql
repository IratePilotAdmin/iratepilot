begin;

lock table
  public.flight_consumer_live_duffel_order_execution_receipts,
  public.flight_consumer_live_duffel_order_executions
in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_duffel_order_execution_receipts
  ) or exists (
    select 1
      from public.flight_consumer_live_duffel_order_executions
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Duffel order execution evidence exists';
  end if;
end;
$rollback$;

drop trigger flight_consumer_live_duffel_order_execution_receipt_guard
  on public.flight_consumer_live_duffel_order_execution_receipts;
drop trigger flight_consumer_live_duffel_order_execution_guard
  on public.flight_consumer_live_duffel_order_executions;

drop function public.reconcile_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text, text, text, text, text, text, text
);
drop function public.complete_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text
);
drop function public.claim_flight_consumer_live_duffel_order_execution_v1(
  uuid, integer, text, text, text, text
);
drop function public.prepare_flight_consumer_live_duffel_order_execution_v1(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, bigint, text, timestamptz
);
drop function public.protect_flight_consumer_live_duffel_order_receipt_v1();
drop function public.protect_flight_consumer_live_duffel_order_execution_v1();

drop table public.flight_consumer_live_duffel_order_execution_receipts;
drop table public.flight_consumer_live_duffel_order_executions;

commit;
