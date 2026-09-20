begin;

lock table public.flight_consumer_live_duffel_order_executions
  in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_duffel_order_executions
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Duffel order execution state exists';
  end if;
end;
$rollback$;

revoke execute on function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  ) from service_role;
revoke execute on function
  public.complete_flight_consumer_live_duffel_order_execution_v2(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text, text, text, text, text
  ) from service_role;

drop function
  public.read_flight_consumer_live_duffel_order_support_identity_v1(
    uuid, text, text, text
  );
drop function public.complete_flight_consumer_live_duffel_order_execution_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, text, text, text, text, text, text
);
drop trigger flight_consumer_live_duffel_order_execution_112_support_identity
  on public.flight_consumer_live_duffel_order_executions;
drop function
  public.enforce_flight_consumer_live_duffel_support_identity_v1();

alter table public.flight_consumer_live_duffel_order_executions
  drop constraint flight_consumer_live_duffel_support_identity_shape_112,
  drop column client_correlation_id,
  drop column client_correlation_id_sha256,
  drop column provider_request_id,
  drop column provider_request_id_sha256;

grant execute on function
  public.complete_flight_consumer_live_duffel_order_execution_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, text, text
  ) to service_role;

commit;
