begin;

-- Repair PL/pgSQL output-column collisions in the Production dark-shopping
-- claim and completion RPCs. The table-return columns are named
-- attempt_state/attempt_revision, so every journal-column reference in the
-- mutating statements must be qualified. This migration changes no rows and
-- grants no new capability; it only restores the already-authorized CAS path.

create or replace function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_live_duffel_shopping_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel shopping journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Duffel shopping dispatch claim is invalid';
  end if;

  update public.flight_consumer_live_duffel_shopping_attempts as journal
     set attempt_state = 'dispatching',
         attempt_revision = 1,
         dispatch_started_at = v_now,
         updated_at = v_now
   where journal.id = p_attempt_id
     and journal.execution_scope_sha256 = p_execution_scope_sha256
     and journal.operation = 'create_offer_request'
     and journal.attempt_state = 'prepared'
     and journal.attempt_revision = p_expected_revision
     and journal.dispatch_not_after > v_now
  returning journal.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel shopping dispatch claim CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state, v_attempt.attempt_revision;
end;
$claim_flight_consumer_live_duffel_shopping_attempt_v1$;

create or replace function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes integer,
  p_offer_count integer
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_live_duffel_shopping_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel shopping journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 1
    or p_terminal_state not in ('succeeded', 'failed', 'ambiguous') then
    raise exception 'Flight Consumer Live Duffel shopping completion envelope is invalid';
  end if;
  if p_terminal_state = 'succeeded' and not (
    p_terminal_http_status between 200 and 299
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_terminal_response_bytes between 0 and 4194304
    and p_offer_count between 0 and 1000
  ) then
    raise exception 'Flight Consumer Live Duffel shopping success evidence is invalid';
  elsif p_terminal_state = 'failed' and not (
    p_terminal_http_status between 100 and 599
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_terminal_response_bytes between 0 and 4194304
    and p_offer_count is null
  ) then
    raise exception 'Flight Consumer Live Duffel shopping failure evidence is invalid';
  elsif p_terminal_state = 'ambiguous' and not (
    p_terminal_http_status is null
    and p_terminal_response_sha256 is null
    and p_terminal_response_bytes is null
    and p_offer_count is null
  ) then
    raise exception 'Flight Consumer Live Duffel shopping ambiguity evidence is invalid';
  end if;

  update public.flight_consumer_live_duffel_shopping_attempts as journal
     set attempt_state = p_terminal_state,
         attempt_revision = 2,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         offer_count = p_offer_count,
         completed_at = v_now,
         updated_at = v_now
   where journal.id = p_attempt_id
     and journal.operation = 'create_offer_request'
     and journal.attempt_state = 'dispatching'
     and journal.attempt_revision = p_expected_revision
  returning journal.* into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel shopping completion CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state, v_attempt.attempt_revision;
end;
$complete_flight_consumer_live_duffel_shopping_attempt_v1$;

alter function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) owner to postgres;
alter function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) owner to postgres;

revoke all on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) to service_role;
grant execute on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) to service_role;

comment on function public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text
) is 'Service-role-only CAS claim for one Production Duffel live-shopping dark attempt; journal columns are explicitly qualified.';
comment on function public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
  uuid, integer, text, integer, text, integer, integer
) is 'Service-role-only terminalization for one Production Duffel live-shopping dark attempt; journal columns are explicitly qualified.';

commit;
