begin;

revoke all on function
  public.record_flight_consumer_live_duffel_webhook_v1(
    text, text, text, text, text, text, text, timestamptz, boolean
  )
from public, anon, authenticated, service_role;

drop function if exists
  public.record_flight_consumer_live_duffel_webhook_v1(
    text, text, text, text, text, text, text, timestamptz, boolean
  );
drop table if exists public.flight_consumer_live_duffel_webhook_inbox;

commit;
