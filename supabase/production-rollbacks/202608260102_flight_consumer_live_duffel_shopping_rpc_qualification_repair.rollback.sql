begin;

-- Evidence-preserving fail-closed rollback: keep the journal and repaired
-- functions, but remove service-role dispatch/completion authority.
revoke execute on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) from service_role;
revoke execute on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) from service_role;

commit;
