begin;

do $rollback$
begin
  if to_regclass('public.flight_consumer_live_public_shopping_dispatches') is not null
    and exists (select 1 from public.flight_consumer_live_public_shopping_dispatches) then
    raise exception 'Gate 119 rollback refused: dispatch evidence exists';
  end if;
end;
$rollback$;

drop function if exists public.claim_flight_consumer_live_public_shopping_dispatch_v1(
  uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz);
drop trigger if exists flight_consumer_live_public_shopping_dispatches_immutable
  on public.flight_consumer_live_public_shopping_dispatches;
drop function if exists public.refuse_flight_consumer_live_public_shopping_dispatch_mutation_v1();
drop table if exists public.flight_consumer_live_public_shopping_dispatches;

commit;
