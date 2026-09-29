begin;

drop function if exists
  public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
    uuid, integer, text, integer, text, integer, integer
  );
drop function if exists
  public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
    uuid, integer, text
  );
drop function if exists
  public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
    text, text, text, text, timestamptz
  );
drop table if exists public.flight_consumer_live_duffel_shopping_attempts;

commit;
