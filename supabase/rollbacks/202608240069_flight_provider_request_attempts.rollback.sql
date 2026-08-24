begin;

-- Preserve every prepared or completed provider-attempt receipt. Rolling this
-- foundation back is safe only before any attempt has ever been journaled.
lock table public.flight_provider_request_attempts in access exclusive mode;

do $$
begin
  if exists (select 1 from public.flight_provider_request_attempts) then
    raise exception 'Refusing rollback: flight provider request-attempt evidence exists';
  end if;
end;
$$;

drop trigger flight_provider_request_attempts_transition_guard
  on public.flight_provider_request_attempts;

drop function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
);
drop function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer);
drop function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
);
drop function public.protect_flight_provider_request_attempt();

drop table public.flight_provider_request_attempts;

commit;
