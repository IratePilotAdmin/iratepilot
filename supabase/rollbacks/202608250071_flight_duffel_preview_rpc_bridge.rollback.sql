begin;

drop function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
);
drop function public.prepare_flight_provider_attempt_rpc(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, timestamptz
);

commit;
