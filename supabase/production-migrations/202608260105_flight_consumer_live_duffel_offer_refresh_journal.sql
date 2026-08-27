begin;

do $migration$
begin
  if to_regclass('public.flight_consumer_live_duffel_shopping_attempts') is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_shopping_attempt_v1(uuid,integer,text,integer,text,integer,integer)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live Duffel offer refresh requires the reviewed shopping journal and SHA-256 prerequisite';
  end if;
end;
$migration$;

create table public.flight_consumer_live_duffel_offer_sources (
  id uuid primary key default gen_random_uuid(),
  source_shopping_attempt_id uuid not null
    references public.flight_consumer_live_duffel_shopping_attempts(id)
    on delete restrict,
  source_shopping_execution_scope_sha256 text not null
    check (source_shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  source_response_sha256 text not null
    check (source_response_sha256 ~ '^[0-9a-f]{64}$'),
  offer_id_sha256 text not null
    check (offer_id_sha256 ~ '^[0-9a-f]{64}$'),
  source_offer_evidence_sha256 text not null
    check (source_offer_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (source_shopping_attempt_id, offer_id_sha256),
  unique (source_shopping_attempt_id, source_offer_evidence_sha256)
);

create index flight_consumer_live_duffel_offer_sources_expiry_idx
  on public.flight_consumer_live_duffel_offer_sources (
    source_shopping_attempt_id, expires_at desc
  );

alter table public.flight_consumer_live_duffel_offer_sources enable row level security;
alter table public.flight_consumer_live_duffel_offer_sources force row level security;
revoke all on table public.flight_consumer_live_duffel_offer_sources
  from public, anon, authenticated, service_role;

create function public.record_flight_consumer_live_duffel_offer_sources_v1(
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_response_sha256 text,
  p_sources jsonb
)
returns table (
  source_shopping_attempt_id uuid,
  recorded_source_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $record_flight_consumer_live_duffel_offer_sources_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_source jsonb;
  v_expires_at timestamptz;
  v_offer_id_sha256 text;
  v_evidence_sha256 text;
  v_expected_count integer;
  v_recorded_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer sources are service-role only';
  end if;
  if p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_response_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_sources) is distinct from 'array'
    or jsonb_array_length(p_sources) > 1000 then
    raise exception 'Flight Consumer Live Duffel offer source envelope is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.id = p_source_shopping_attempt_id
     and attempt.execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
   for update;
  if not found
    or v_attempt.operation is distinct from 'create_offer_request'
    or v_attempt.attempt_state is distinct from 'dispatching'
    or v_attempt.attempt_revision is distinct from 1 then
    raise exception 'Flight Consumer Live Duffel offer source parent is not recordable';
  end if;

  v_expected_count := jsonb_array_length(p_sources);
  for v_source in select value from jsonb_array_elements(p_sources)
  loop
    if jsonb_typeof(v_source) is distinct from 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(v_source) as key)
        is distinct from array['expiresAt', 'offerIdSha256']::text[] then
      raise exception 'Flight Consumer Live Duffel offer source item is invalid';
    end if;
    v_offer_id_sha256 := v_source ->> 'offerIdSha256';
    if v_offer_id_sha256 !~ '^[0-9a-f]{64}$'
      or (v_source ->> 'expiresAt') is null then
      raise exception 'Flight Consumer Live Duffel offer source item is invalid';
    end if;
    begin
      v_expires_at := (v_source ->> 'expiresAt')::timestamptz;
    exception when others then
      raise exception 'Flight Consumer Live Duffel offer source expiry is invalid';
    end;
    v_evidence_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        p_source_shopping_attempt_id::text || ':'
        || p_source_shopping_execution_scope_sha256 || ':'
        || p_source_response_sha256 || ':'
        || v_offer_id_sha256 || ':'
        || to_char(v_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'
      ),
      'sha256'
    ), 'hex');

    insert into public.flight_consumer_live_duffel_offer_sources (
      source_shopping_attempt_id,
      source_shopping_execution_scope_sha256,
      source_response_sha256,
      offer_id_sha256,
      source_offer_evidence_sha256,
      expires_at
    ) values (
      p_source_shopping_attempt_id,
      p_source_shopping_execution_scope_sha256,
      p_source_response_sha256,
      v_offer_id_sha256,
      v_evidence_sha256,
      v_expires_at
    )
    on conflict (source_shopping_attempt_id, offer_id_sha256) do nothing;
  end loop;

  select count(*)::integer into v_recorded_count
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256;
  if v_recorded_count is distinct from v_expected_count
    or exists (
      select 1
        from public.flight_consumer_live_duffel_offer_sources as source
       where source.source_shopping_attempt_id = p_source_shopping_attempt_id
         and (
           source.source_shopping_execution_scope_sha256 is distinct from
             p_source_shopping_execution_scope_sha256
           or source.source_response_sha256 is distinct from
             p_source_response_sha256
         )
    ) then
    raise exception 'Flight Consumer Live Duffel offer source collision';
  end if;

  return query select p_source_shopping_attempt_id, v_recorded_count;
end;
$record_flight_consumer_live_duffel_offer_sources_v1$;

create function public.resolve_flight_consumer_live_duffel_offer_refresh_source_v1(
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_offer_id_sha256 text
)
returns table (
  source_id uuid,
  source_shopping_attempt_id uuid,
  source_shopping_execution_scope_sha256 text,
  source_response_sha256 text,
  offer_id_sha256 text,
  source_offer_evidence_sha256 text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_live_duffel_offer_refresh_source_v1$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer sources are service-role only';
  end if;
  if p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_id_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Duffel offer source lookup is invalid';
  end if;

  return query
  select source.id,
         source.source_shopping_attempt_id,
         source.source_shopping_execution_scope_sha256,
         source.source_response_sha256,
         source.offer_id_sha256,
         source.source_offer_evidence_sha256,
         source.expires_at
    from public.flight_consumer_live_duffel_offer_sources as source
    join public.flight_consumer_live_duffel_shopping_attempts as attempt
      on attempt.id = source.source_shopping_attempt_id
     and attempt.execution_scope_sha256 =
       source.source_shopping_execution_scope_sha256
     and attempt.terminal_response_sha256 = source.source_response_sha256
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.offer_id_sha256 = p_offer_id_sha256
     and attempt.operation = 'create_offer_request'
     and attempt.attempt_state = 'succeeded'
     and attempt.attempt_revision = 2
     and source.expires_at > clock_timestamp() + interval '60 seconds'
     and (
       select count(*)
         from public.flight_consumer_live_duffel_offer_sources as sibling
        where sibling.source_shopping_attempt_id = attempt.id
          and sibling.source_shopping_execution_scope_sha256 =
            attempt.execution_scope_sha256
          and sibling.source_response_sha256 = attempt.terminal_response_sha256
     ) = attempt.offer_count
   limit 1;
end;
$resolve_flight_consumer_live_duffel_offer_refresh_source_v1$;

create table public.flight_consumer_live_duffel_offer_refresh_attempts (
  id uuid primary key default gen_random_uuid(),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  source_id uuid not null
    references public.flight_consumer_live_duffel_offer_sources(id)
    on delete restrict,
  source_shopping_attempt_id uuid not null,
  source_shopping_execution_scope_sha256 text not null
    check (source_shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  source_offer_evidence_sha256 text not null
    check (source_offer_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  offer_id_sha256 text not null
    check (offer_id_sha256 ~ '^[0-9a-f]{64}$'),
  offer_binding_sha256 text not null
    check (offer_binding_sha256 ~ '^[0-9a-f]{64}$'),
  authority_sha256 text not null
    check (authority_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  operation text not null default 'retrieve_offer'
    check (operation = 'retrieve_offer'),
  attempt_state text not null default 'prepared'
    check (attempt_state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous')),
  attempt_revision integer not null default 0
    check (attempt_revision between 0 and 2),
  dispatch_not_after timestamptz not null,
  dispatch_started_at timestamptz,
  provider_dispatch_count integer not null default 0
    check (provider_dispatch_count in (0, 1)),
  terminal_error_code text
    check (terminal_error_code is null or terminal_error_code ~ '^[a-z0-9_]{1,96}$'),
  terminal_http_status integer
    check (terminal_http_status is null or terminal_http_status between 100 and 599),
  terminal_response_sha256 text
    check (terminal_response_sha256 is null or terminal_response_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_offer_sha256 text
    check (normalized_offer_sha256 is null or normalized_offer_sha256 ~ '^[0-9a-f]{64}$'),
  price_amount_minor bigint
    check (price_amount_minor is null or price_amount_minor between 1 and 999999999999),
  price_currency text
    check (price_currency is null or price_currency = 'USD'),
  offer_expires_at timestamptz,
  observed_at timestamptz,
  owner_name text
    check (owner_name is null or (
      length(owner_name) between 1 and 160
      and owner_name = btrim(owner_name)
    )),
  owner_iata_code text
    check (owner_iata_code is null or owner_iata_code ~ '^[A-Z0-9]{2}$'),
  owner_identity_sha256 text
    check (owner_identity_sha256 is null or owner_identity_sha256 ~ '^[0-9a-f]{64}$'),
  final_checkout_pricing_authorized boolean not null default false
    check (not final_checkout_pricing_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  settlement_authorized boolean not null default false check (not settlement_authorized),
  ticketing_authorized boolean not null default false check (not ticketing_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  servicing_authorized boolean not null default false check (not servicing_authorized),
  consumer_release_enabled boolean not null default false check (not consumer_release_enabled),
  prepared_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, idempotency_sha256),
  unique (source_id, offer_binding_sha256),
  check (dispatch_not_after > prepared_at),
  check (
    (attempt_state = 'prepared'
      and attempt_revision = 0
      and dispatch_started_at is null
      and provider_dispatch_count = 0
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and normalized_offer_sha256 is null
      and price_amount_minor is null
      and price_currency is null
      and offer_expires_at is null
      and observed_at is null
      and owner_name is null
      and owner_iata_code is null
      and owner_identity_sha256 is null
      and completed_at is null)
    or (attempt_state = 'dispatching'
      and attempt_revision = 1
      and dispatch_started_at is not null
      and provider_dispatch_count = 0
      and terminal_error_code is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and normalized_offer_sha256 is null
      and price_amount_minor is null
      and price_currency is null
      and offer_expires_at is null
      and observed_at is null
      and owner_name is null
      and owner_iata_code is null
      and owner_identity_sha256 is null
      and completed_at is null)
    or (attempt_state = 'succeeded'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and provider_dispatch_count = 1
      and terminal_error_code is null
      and terminal_http_status = 200
      and terminal_response_sha256 is not null
      and normalized_offer_sha256 is not null
      and price_amount_minor is not null
      and price_currency = 'USD'
      and offer_expires_at is not null
      and observed_at is not null
      and owner_name is not null
      and owner_identity_sha256 is not null
      and completed_at is not null)
    or (attempt_state = 'failed'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and provider_dispatch_count in (0, 1)
      and terminal_error_code is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and normalized_offer_sha256 is null
      and price_amount_minor is null
      and price_currency is null
      and offer_expires_at is null
      and observed_at is null
      and owner_name is null
      and owner_iata_code is null
      and owner_identity_sha256 is null
      and completed_at is not null)
    or (attempt_state = 'ambiguous'
      and attempt_revision = 2
      and dispatch_started_at is not null
      and provider_dispatch_count = 1
      and terminal_error_code is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and normalized_offer_sha256 is null
      and price_amount_minor is null
      and price_currency is null
      and offer_expires_at is null
      and observed_at is null
      and owner_name is null
      and owner_iata_code is null
      and owner_identity_sha256 is null
      and completed_at is not null)
  )
);

create index flight_consumer_live_duffel_offer_refresh_state_idx
  on public.flight_consumer_live_duffel_offer_refresh_attempts (
    attempt_state, updated_at desc
  );

alter table public.flight_consumer_live_duffel_offer_refresh_attempts enable row level security;
alter table public.flight_consumer_live_duffel_offer_refresh_attempts force row level security;
revoke all on table public.flight_consumer_live_duffel_offer_refresh_attempts
  from public, anon, authenticated, service_role;

create function public.get_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_source_id uuid,
  p_source_offer_evidence_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  offer_binding_sha256 text,
  source_offer_evidence_sha256 text,
  request_sha256 text,
  provider_dispatch_count integer,
  terminal_error_code text,
  terminal_http_status integer,
  terminal_response_sha256 text,
  normalized_offer_sha256 text,
  price_amount_minor bigint,
  price_currency text,
  offer_expires_at timestamptz,
  observed_at timestamptz,
  owner_name text,
  owner_iata_code text,
  owner_identity_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_live_duffel_offer_refresh_attempt_v1$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer refresh journal is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_id is null
    or p_source_offer_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Duffel offer refresh inspection is invalid';
  end if;
  return query
  select attempt.id, attempt.attempt_state, attempt.attempt_revision,
         attempt.offer_binding_sha256, attempt.source_offer_evidence_sha256,
         attempt.request_sha256, attempt.provider_dispatch_count,
         attempt.terminal_error_code, attempt.terminal_http_status,
         attempt.terminal_response_sha256, attempt.normalized_offer_sha256,
         attempt.price_amount_minor, attempt.price_currency,
         attempt.offer_expires_at, attempt.observed_at, attempt.owner_name,
         attempt.owner_iata_code, attempt.owner_identity_sha256
    from public.flight_consumer_live_duffel_offer_refresh_attempts as attempt
   where attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.idempotency_sha256 = p_idempotency_sha256
     and attempt.source_id = p_source_id
     and attempt.source_offer_evidence_sha256 =
       p_source_offer_evidence_sha256;
end;
$get_flight_consumer_live_duffel_offer_refresh_attempt_v1$;

create function public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  p_execution_scope_sha256 text,
  p_idempotency_sha256 text,
  p_source_id uuid,
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_offer_evidence_sha256 text,
  p_offer_id_sha256 text,
  p_offer_binding_sha256 text,
  p_authority_sha256 text,
  p_request_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer,
  offer_binding_sha256 text,
  source_offer_evidence_sha256 text,
  request_sha256 text,
  provider_dispatch_count integer,
  terminal_error_code text,
  terminal_http_status integer,
  terminal_response_sha256 text,
  normalized_offer_sha256 text,
  price_amount_minor bigint,
  price_currency text,
  offer_expires_at timestamptz,
  observed_at timestamptz,
  owner_name text,
  owner_iata_code text,
  owner_identity_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_offer_refresh_attempts;
  v_source public.flight_consumer_live_duffel_offer_sources;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer refresh journal is service-role only';
  end if;
  if p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_id is null
    or p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_offer_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_authority_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_dispatch_not_after is null
    or p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '2 minutes' then
    raise exception 'Flight Consumer Live Duffel offer refresh envelope is invalid';
  end if;

  select source.* into v_source
    from public.flight_consumer_live_duffel_offer_sources as source
    join public.flight_consumer_live_duffel_shopping_attempts as shopping
      on shopping.id = source.source_shopping_attempt_id
     and shopping.execution_scope_sha256 =
       source.source_shopping_execution_scope_sha256
     and shopping.terminal_response_sha256 = source.source_response_sha256
   where source.id = p_source_id
     and source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_offer_evidence_sha256 =
       p_source_offer_evidence_sha256
     and source.offer_id_sha256 = p_offer_id_sha256
     and shopping.attempt_state = 'succeeded'
     and shopping.attempt_revision = 2
     and source.expires_at > v_now + interval '60 seconds'
   for update of source;
  if not found then
    raise exception 'Flight Consumer Live Duffel offer refresh source binding is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_live_duffel_offer_refresh_attempts as attempt
   where attempt.execution_scope_sha256 = p_execution_scope_sha256
     and attempt.idempotency_sha256 = p_idempotency_sha256
   for update;
  if found then
    if v_attempt.source_id is distinct from p_source_id
      or v_attempt.source_shopping_attempt_id is distinct from
        p_source_shopping_attempt_id
      or v_attempt.source_shopping_execution_scope_sha256 is distinct from
        p_source_shopping_execution_scope_sha256
      or v_attempt.source_offer_evidence_sha256 is distinct from
        p_source_offer_evidence_sha256
      or v_attempt.offer_id_sha256 is distinct from p_offer_id_sha256
      or v_attempt.offer_binding_sha256 is distinct from p_offer_binding_sha256
      or v_attempt.authority_sha256 is distinct from p_authority_sha256
      or v_attempt.request_sha256 is distinct from p_request_sha256 then
      raise exception 'Flight Consumer Live Duffel offer refresh idempotency collision';
    end if;
    return query select
      'replay'::text, v_attempt.id, v_attempt.attempt_state,
      v_attempt.attempt_revision, v_attempt.offer_binding_sha256,
      v_attempt.source_offer_evidence_sha256, v_attempt.request_sha256,
      v_attempt.provider_dispatch_count,
      v_attempt.terminal_error_code, v_attempt.terminal_http_status,
      v_attempt.terminal_response_sha256, v_attempt.normalized_offer_sha256,
      v_attempt.price_amount_minor, v_attempt.price_currency,
      v_attempt.offer_expires_at, v_attempt.observed_at,
      v_attempt.owner_name, v_attempt.owner_iata_code,
      v_attempt.owner_identity_sha256;
    return;
  end if;

  insert into public.flight_consumer_live_duffel_offer_refresh_attempts (
    execution_scope_sha256, idempotency_sha256, source_id,
    source_shopping_attempt_id, source_shopping_execution_scope_sha256,
    source_offer_evidence_sha256, offer_id_sha256, offer_binding_sha256,
    authority_sha256, request_sha256, dispatch_not_after
  ) values (
    p_execution_scope_sha256, p_idempotency_sha256, p_source_id,
    p_source_shopping_attempt_id, p_source_shopping_execution_scope_sha256,
    p_source_offer_evidence_sha256, p_offer_id_sha256,
    p_offer_binding_sha256, p_authority_sha256, p_request_sha256,
    p_dispatch_not_after
  ) returning * into v_attempt;

  return query select
    'created'::text, v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision, v_attempt.offer_binding_sha256,
    v_attempt.source_offer_evidence_sha256, v_attempt.request_sha256,
    v_attempt.provider_dispatch_count,
    v_attempt.terminal_error_code, v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256, v_attempt.normalized_offer_sha256,
    v_attempt.price_amount_minor, v_attempt.price_currency,
    v_attempt.offer_expires_at, v_attempt.observed_at,
    v_attempt.owner_name, v_attempt.owner_iata_code,
    v_attempt.owner_identity_sha256;
end;
$prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1$;

create function public.claim_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_offer_binding_sha256 text,
  p_request_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_live_duffel_offer_refresh_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_offer_refresh_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer refresh journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 0
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live Duffel offer refresh claim is invalid';
  end if;

  update public.flight_consumer_live_duffel_offer_refresh_attempts
     set attempt_state = 'dispatching',
         attempt_revision = 1,
         dispatch_started_at = v_now,
         updated_at = v_now
   where id = p_attempt_id
     and execution_scope_sha256 = p_execution_scope_sha256
     and offer_binding_sha256 = p_offer_binding_sha256
     and request_sha256 = p_request_sha256
     and operation = 'retrieve_offer'
     and attempt_state = 'prepared'
     and attempt_revision = p_expected_revision
     and dispatch_not_after > v_now
  returning * into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel offer refresh claim CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision;
end;
$claim_flight_consumer_live_duffel_offer_refresh_attempt_v1$;

create function public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_execution_scope_sha256 text,
  p_offer_binding_sha256 text,
  p_request_sha256 text,
  p_terminal_state text,
  p_provider_dispatch_count integer,
  p_terminal_error_code text,
  p_terminal_http_status integer,
  p_terminal_response_sha256 text,
  p_normalized_offer_sha256 text,
  p_price_amount_minor bigint,
  p_offer_expires_at timestamptz,
  p_observed_at timestamptz,
  p_owner_name text,
  p_owner_iata_code text,
  p_owner_identity_sha256 text
)
returns table (
  attempt_id uuid,
  attempt_state text,
  attempt_revision integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_live_duffel_offer_refresh_attempt_v1$
declare
  v_attempt public.flight_consumer_live_duffel_offer_refresh_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer refresh journal is service-role only';
  end if;
  if p_attempt_id is null
    or p_expected_revision is distinct from 1
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_offer_binding_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_state not in ('succeeded', 'failed', 'ambiguous')
    or p_provider_dispatch_count not in (0, 1) then
    raise exception 'Flight Consumer Live Duffel offer refresh completion is invalid';
  end if;
  if p_terminal_state = 'succeeded' and not coalesce((
    p_provider_dispatch_count = 1
    and p_terminal_error_code is null
    and p_terminal_http_status = 200
    and p_terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    and p_normalized_offer_sha256 ~ '^[0-9a-f]{64}$'
    and p_price_amount_minor between 1 and 999999999999
    and p_offer_expires_at > p_observed_at
    and p_observed_at is not null
    and length(p_owner_name) between 1 and 160
    and p_owner_name = btrim(p_owner_name)
    and (p_owner_iata_code is null or p_owner_iata_code ~ '^[A-Z0-9]{2}$')
    and p_owner_identity_sha256 ~ '^[0-9a-f]{64}$'
  ), false) then
    raise exception 'Flight Consumer Live Duffel offer refresh success evidence is invalid';
  elsif p_terminal_state = 'failed' and not coalesce((
    p_provider_dispatch_count in (0, 1)
    and p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and p_terminal_http_status is null
    and p_terminal_response_sha256 is null
    and p_normalized_offer_sha256 is null
    and p_price_amount_minor is null
    and p_offer_expires_at is null
    and p_observed_at is null
    and p_owner_name is null
    and p_owner_iata_code is null
    and p_owner_identity_sha256 is null
  ), false) then
    raise exception 'Flight Consumer Live Duffel offer refresh failure evidence is invalid';
  elsif p_terminal_state = 'ambiguous' and not coalesce((
    p_provider_dispatch_count = 1
    and p_terminal_error_code ~ '^[a-z0-9_]{1,96}$'
    and p_terminal_http_status is null
    and p_terminal_response_sha256 is null
    and p_normalized_offer_sha256 is null
    and p_price_amount_minor is null
    and p_offer_expires_at is null
    and p_observed_at is null
    and p_owner_name is null
    and p_owner_iata_code is null
    and p_owner_identity_sha256 is null
  ), false) then
    raise exception 'Flight Consumer Live Duffel offer refresh ambiguity evidence is invalid';
  end if;

  update public.flight_consumer_live_duffel_offer_refresh_attempts
     set attempt_state = p_terminal_state,
         attempt_revision = 2,
         provider_dispatch_count = p_provider_dispatch_count,
         terminal_error_code = p_terminal_error_code,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         normalized_offer_sha256 = p_normalized_offer_sha256,
         price_amount_minor = p_price_amount_minor,
         price_currency = case when p_terminal_state = 'succeeded'
           then 'USD' else null end,
         offer_expires_at = p_offer_expires_at,
         observed_at = p_observed_at,
         owner_name = p_owner_name,
         owner_iata_code = p_owner_iata_code,
         owner_identity_sha256 = p_owner_identity_sha256,
         completed_at = v_now,
         updated_at = v_now
   where id = p_attempt_id
     and execution_scope_sha256 = p_execution_scope_sha256
     and offer_binding_sha256 = p_offer_binding_sha256
     and request_sha256 = p_request_sha256
     and operation = 'retrieve_offer'
     and attempt_state = 'dispatching'
     and attempt_revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight Consumer Live Duffel offer refresh completion CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.attempt_state,
    v_attempt.attempt_revision;
end;
$complete_flight_consumer_live_duffel_offer_refresh_attempt_v1$;

alter function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) owner to postgres;
alter function public.resolve_flight_consumer_live_duffel_offer_refresh_source_v1(
  uuid, text, text
) owner to postgres;
alter function public.get_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, text
) owner to postgres;
alter function public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) owner to postgres;
alter function public.claim_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text
) owner to postgres;
alter function public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text, text, integer, text, integer, text, text,
  bigint, timestamptz, timestamptz, text, text, text
) owner to postgres;

revoke all on function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_flight_consumer_live_duffel_offer_refresh_source_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text, text, integer, text, integer, text, text,
  bigint, timestamptz, timestamptz, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) to service_role;
grant execute on function public.resolve_flight_consumer_live_duffel_offer_refresh_source_v1(
  uuid, text, text
) to service_role;
grant execute on function public.get_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, text
) to service_role;
grant execute on function public.prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  text, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text
) to service_role;
grant execute on function public.complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(
  uuid, integer, text, text, text, text, integer, text, integer, text, text,
  bigint, timestamptz, timestamptz, text, text, text
) to service_role;

comment on table public.flight_consumer_live_duffel_offer_sources is
  'Service-role-only digest evidence for offers in one successful Production dark shopping receipt. Raw provider references are never persisted.';
comment on table public.flight_consumer_live_duffel_offer_refresh_attempts is
  'At-most-once Production dark Duffel GET offer-refresh observations. No order, payment, ticket, servicing, refund, or consumer-release authority.';

commit;
