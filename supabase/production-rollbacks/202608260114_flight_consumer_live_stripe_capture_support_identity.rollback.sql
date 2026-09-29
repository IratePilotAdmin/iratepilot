begin;

do $rollback_prerequisite$
begin
  if to_regclass(
    'public.flight_consumer_live_stripe_capture_attempts'
  ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_stripe_capture_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.read_flight_consumer_live_stripe_capture_support_identity_v1(uuid,text,text,text)'
    ) is null then
    raise exception
      'Refusing rollback: Flight Consumer Live Stripe capture support identity objects are incomplete';
  end if;
end;
$rollback_prerequisite$;

lock table public.flight_consumer_live_stripe_capture_attempts
  in access exclusive mode;

do $rollback_guard$
begin
  if exists (
    select 1
      from public.flight_consumer_live_stripe_capture_attempts
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Stripe capture attempt or in-flight evidence exists';
  end if;
end;
$rollback_guard$;

revoke execute on function
  public.complete_flight_consumer_live_stripe_capture_v2(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text, text, text, text, text, text
  ) from service_role;
revoke execute on function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  ) from service_role;

drop function
  public.read_flight_consumer_live_stripe_capture_support_identity_v1(
    uuid, text, text, text
  );
drop function public.complete_flight_consumer_live_stripe_capture_v2(
  uuid, integer, text, text, text, text, text, integer, integer, text,
  integer, text, text, text, text, text, bigint, text, boolean, text, text,
  text, text, text, text, text, text
);
drop trigger flight_consumer_live_stripe_capture_114_support_identity
  on public.flight_consumer_live_stripe_capture_attempts;
drop function
  public.enforce_flight_consumer_live_stripe_capture_support_identity_v1();

alter table public.flight_consumer_live_stripe_capture_attempts
  drop constraint flight_consumer_live_stripe_capture_support_identity_114,
  drop column client_correlation_id,
  drop column client_correlation_id_sha256,
  drop column stripe_request_id,
  drop column stripe_request_id_sha256,
  drop column stripe_transport_outcome;

grant execute on function
  public.complete_flight_consumer_live_stripe_capture_v1(
    uuid, integer, text, text, text, text, text, integer, integer, text,
    integer, text, text, text, text, text, bigint, text, boolean, text, text,
    text
  ) to service_role;

commit;
