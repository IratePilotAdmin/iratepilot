
begin;

do $$
begin
  if exists (
    select 1 from public.flight_provider_request_attempts where operation = 'create_order'
  ) then
    raise exception 'Rollback refused: Duffel test order-attempt evidence exists';
  end if;
end;
$$;

drop function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer);
drop function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
);

alter table public.flight_provider_request_attempts
  drop constraint flight_provider_request_attempts_operation_check;
alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_operation_check
  check (operation in (
    'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'
  ));

commit;
