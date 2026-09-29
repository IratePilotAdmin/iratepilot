begin;

lock table
  public.flight_consumer_live_public_offer_reference_vaults,
  public.flight_consumer_live_public_offer_segments,
  public.flight_consumer_live_public_offer_projections,
  public.flight_consumer_live_public_offer_projection_dispositions,
  public.flight_consumer_live_public_offer_projection_batches
in access exclusive mode;

do $rollback$
begin
  if exists (select 1 from public.flight_consumer_live_public_offer_projection_batches)
    or exists (select 1 from public.flight_consumer_live_public_offer_projection_dispositions)
    or exists (select 1 from public.flight_consumer_live_public_offer_projections)
    or exists (select 1 from public.flight_consumer_live_public_offer_segments)
    or exists (select 1 from public.flight_consumer_live_public_offer_reference_vaults) then
    raise exception
      'Refusing rollback: Flight Consumer Live public-offer projection evidence exists';
  end if;
end;
$rollback$;

revoke execute on function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
) from service_role;
revoke execute on function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
) from service_role;
revoke execute on function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) from service_role;
revoke execute on function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text
) from service_role;

drop function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
);
drop function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
);
drop function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
);
drop function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text
);

drop table public.flight_consumer_live_public_offer_reference_vaults;
drop table public.flight_consumer_live_public_offer_segments;
drop table public.flight_consumer_live_public_offer_projections;
drop table public.flight_consumer_live_public_offer_projection_dispositions;
drop table public.flight_consumer_live_public_offer_projection_batches;
drop function public.refuse_flight_consumer_live_public_offer_projection_mutation_v1();
drop function public.canonical_flight_consumer_public_offer_json_v1(jsonb);

commit;
