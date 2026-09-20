begin;

do $rollback$
begin
  if to_regclass('public.flight_consumer_live_duffel_offer_refresh_attempts') is not null
    and exists (
      select 1 from public.flight_consumer_live_duffel_offer_refresh_attempts
    ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Duffel offer refresh evidence exists';
  end if;
  if to_regclass('public.flight_consumer_live_duffel_offer_sources') is not null
    and exists (
      select 1 from public.flight_consumer_live_duffel_offer_sources
    ) then
    raise exception
      'Refusing rollback: Flight Consumer Live Duffel offer source evidence exists';
  end if;
end;
$rollback$;

drop function if exists
  public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(
    uuid, integer, text, text, text, text, integer, text, integer, text, text,
    bigint, timestamptz, timestamptz, text, text, text
  );
drop function if exists
  public.claim_flight_consumer_live_duffel_offer_refresh_attempt_v1(
    uuid, integer, text, text, text
  );
drop function if exists
  public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(
    text, text, uuid, uuid, text, text, text, text, text, text, timestamptz
  );
drop function if exists
  public.get_flight_consumer_live_duffel_offer_refresh_attempt_v1(
    text, text, uuid, text
  );
drop function if exists
  public.resolve_flight_consumer_live_duffel_offer_refresh_source_v1(
    uuid, text, text
  );
drop function if exists
  public.record_flight_consumer_live_duffel_offer_sources_v1(
    uuid, text, text, jsonb
  );

drop table if exists public.flight_consumer_live_duffel_offer_refresh_attempts;
drop table if exists public.flight_consumer_live_duffel_offer_sources;

commit;
