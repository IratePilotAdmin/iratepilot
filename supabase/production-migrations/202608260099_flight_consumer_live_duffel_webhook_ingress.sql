begin;

-- Production Duffel ingress is intentionally separated from every Preview
-- table and mutation workflow. It stores only authenticated digests and a
-- quarantine state; it cannot create or alter orders, payments, or tickets.
create table public.flight_consumer_live_duffel_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  event_id_sha256 text not null
    check (event_id_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null
    check (event_type ~ '^[A-Za-z0-9._-]{1,128}$'),
  payload_sha256 text not null
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_sha256 text not null
    check (semantic_sha256 ~ '^[0-9a-f]{64}$'),
  verification_receipt_sha256 text not null
    check (verification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null,
  live_mode boolean not null check (live_mode),
  inbox_state text not null
    check (inbox_state in ('verified_ping', 'quarantined')),
  received_at timestamptz not null default clock_timestamp(),
  check (
    (event_type = 'ping.triggered' and inbox_state = 'verified_ping')
    or (event_type <> 'ping.triggered' and inbox_state = 'quarantined')
  )
);

create unique index flight_consumer_live_duffel_webhook_event_uidx
  on public.flight_consumer_live_duffel_webhook_inbox (
    execution_scope_sha256, event_id_sha256
  );
create unique index flight_consumer_live_duffel_webhook_idempotency_uidx
  on public.flight_consumer_live_duffel_webhook_inbox (
    execution_scope_sha256, idempotency_sha256
  );
create index flight_consumer_live_duffel_webhook_received_idx
  on public.flight_consumer_live_duffel_webhook_inbox (
    inbox_state, received_at desc
  );

alter table public.flight_consumer_live_duffel_webhook_inbox
  enable row level security;
alter table public.flight_consumer_live_duffel_webhook_inbox
  force row level security;

revoke all on table public.flight_consumer_live_duffel_webhook_inbox
  from public, anon, authenticated, service_role;

create function public.record_flight_consumer_live_duffel_webhook_v1(
  p_execution_scope_sha256 text,
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_live_mode boolean
)
returns table (
  decision text,
  inbox_id uuid,
  inbox_state text,
  event_type text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_live_duffel_webhook_v1$
declare
  v_inbox public.flight_consumer_live_duffel_webhook_inbox;
  v_state text;
  v_inserted boolean := false;
  v_match_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel ingress is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type !~ '^[A-Za-z0-9._-]{1,128}$'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null
    or p_live_mode is distinct from true then
    raise exception 'Flight Consumer Live Duffel ingress envelope is invalid';
  end if;

  v_state := case when p_event_type = 'ping.triggered'
    then 'verified_ping' else 'quarantined' end;

  select count(*)::integer into v_match_count
    from public.flight_consumer_live_duffel_webhook_inbox as inbox
   where inbox.execution_scope_sha256 = p_execution_scope_sha256
     and (
       inbox.event_id_sha256 = p_event_id_sha256
       or inbox.idempotency_sha256 = p_idempotency_sha256
     );
  if v_match_count > 1 then
    raise exception 'Flight Consumer Live Duffel ingress identity is ambiguous';
  end if;

  select * into v_inbox
    from public.flight_consumer_live_duffel_webhook_inbox as inbox
   where inbox.execution_scope_sha256 = p_execution_scope_sha256
     and (
       inbox.event_id_sha256 = p_event_id_sha256
       or inbox.idempotency_sha256 = p_idempotency_sha256
     )
   for update;

  if found then
    if v_inbox.event_id_sha256 is not distinct from p_event_id_sha256
      and v_inbox.idempotency_sha256 is not distinct from p_idempotency_sha256
      and v_inbox.event_type is not distinct from p_event_type
      and v_inbox.payload_sha256 is not distinct from p_payload_sha256
      and v_inbox.semantic_sha256 is not distinct from p_semantic_sha256
      and v_inbox.verification_receipt_sha256
        is not distinct from p_verification_receipt_sha256
      and v_inbox.occurred_at is not distinct from p_occurred_at
      and v_inbox.live_mode
      and v_inbox.inbox_state is not distinct from v_state then
      return query select 'replay'::text, v_inbox.id,
        v_inbox.inbox_state, v_inbox.event_type,
        v_inbox.execution_scope_sha256;
      return;
    end if;
    raise exception 'Flight Consumer Live Duffel ingress identity collision';
  end if;

  begin
    insert into public.flight_consumer_live_duffel_webhook_inbox (
      execution_scope_sha256,
      event_id_sha256,
      idempotency_sha256,
      event_type,
      payload_sha256,
      semantic_sha256,
      verification_receipt_sha256,
      occurred_at,
      live_mode,
      inbox_state
    ) values (
      p_execution_scope_sha256,
      p_event_id_sha256,
      p_idempotency_sha256,
      p_event_type,
      p_payload_sha256,
      p_semantic_sha256,
      p_verification_receipt_sha256,
      p_occurred_at,
      true,
      v_state
    ) returning * into v_inbox;
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;
  end;

  if not v_inserted then
    select count(*)::integer into v_match_count
      from public.flight_consumer_live_duffel_webhook_inbox as inbox
     where inbox.execution_scope_sha256 = p_execution_scope_sha256
       and (
         inbox.event_id_sha256 = p_event_id_sha256
         or inbox.idempotency_sha256 = p_idempotency_sha256
       );
    if v_match_count <> 1 then
      raise exception 'Flight Consumer Live Duffel ingress concurrency identity is ambiguous';
    end if;
    select * into v_inbox
      from public.flight_consumer_live_duffel_webhook_inbox as inbox
     where inbox.execution_scope_sha256 = p_execution_scope_sha256
       and (
         inbox.event_id_sha256 = p_event_id_sha256
         or inbox.idempotency_sha256 = p_idempotency_sha256
       )
     for update;
    if not found
      or v_inbox.event_id_sha256 is distinct from p_event_id_sha256
      or v_inbox.idempotency_sha256 is distinct from p_idempotency_sha256
      or v_inbox.event_type is distinct from p_event_type
      or v_inbox.payload_sha256 is distinct from p_payload_sha256
      or v_inbox.semantic_sha256 is distinct from p_semantic_sha256
      or v_inbox.verification_receipt_sha256
        is distinct from p_verification_receipt_sha256
      or v_inbox.occurred_at is distinct from p_occurred_at
      or not v_inbox.live_mode
      or v_inbox.inbox_state is distinct from v_state then
      raise exception 'Flight Consumer Live Duffel ingress concurrency collision';
    end if;
    return query select 'replay'::text, v_inbox.id,
      v_inbox.inbox_state, v_inbox.event_type,
      v_inbox.execution_scope_sha256;
    return;
  end if;

  return query select 'created'::text, v_inbox.id,
    v_inbox.inbox_state, v_inbox.event_type,
    v_inbox.execution_scope_sha256;
end;
$record_flight_consumer_live_duffel_webhook_v1$;

alter function public.record_flight_consumer_live_duffel_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, boolean
) owner to postgres;

revoke all on function
  public.record_flight_consumer_live_duffel_webhook_v1(
    text, text, text, text, text, text, text, timestamptz, boolean
  )
from public, anon, authenticated, service_role;
grant execute on function
  public.record_flight_consumer_live_duffel_webhook_v1(
    text, text, text, text, text, text, text, timestamptz, boolean
  )
to service_role;

comment on table public.flight_consumer_live_duffel_webhook_inbox is
  'Forced-RLS, digest-only Duffel Live ingress. Rows are append-preserving quarantine evidence and authorize no commerce mutation.';
comment on function public.record_flight_consumer_live_duffel_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, boolean
) is
  'Service-role-only immutable Duffel Live envelope recorder. Exact replay succeeds; identity collision refuses; no order, payment, ticket, or servicing mutation is reachable.';

commit;
