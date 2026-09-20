begin;

do $prerequisite$
begin
  if to_regclass('public.flight_consumer_live_public_offer_reference_vaults') is null
    or to_regprocedure(
      'public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Live reference retention requires reviewed Gate 116';
  end if;
end;
$prerequisite$;

create table public.flight_consumer_live_public_offer_reference_purge_receipts (
  id uuid primary key,
  cutoff_at timestamptz not null,
  requested_limit integer not null check (requested_limit between 1 and 500),
  purged_count integer not null check (purged_count between 1 and requested_limit),
  purged_projection_set_sha256 text not null
    check (purged_projection_set_sha256 ~ '^[0-9a-f]{64}$'),
  purge_receipt_sha256 text not null unique
    check (purge_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  capture_authorized boolean not null default false check (not capture_authorized),
  refund_authorized boolean not null default false check (not refund_authorized),
  settlement_authorized boolean not null default false
    check (not settlement_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  check (cutoff_at = created_at),
  check (purged_projection_set_sha256 <> purge_receipt_sha256)
);

alter table public.flight_consumer_live_public_offer_reference_purge_receipts
  enable row level security;
alter table public.flight_consumer_live_public_offer_reference_purge_receipts
  force row level security;
revoke all on table
  public.flight_consumer_live_public_offer_reference_purge_receipts
  from public, anon, authenticated, service_role;

create trigger flight_consumer_live_public_offer_reference_purge_receipts_immutable
before update or delete on
  public.flight_consumer_live_public_offer_reference_purge_receipts
for each row execute function
  public.refuse_flight_consumer_live_public_offer_projection_mutation_v1();

drop trigger flight_consumer_live_public_offer_reference_vaults_immutable
  on public.flight_consumer_live_public_offer_reference_vaults;
create trigger flight_consumer_live_public_offer_reference_vaults_immutable
before update on public.flight_consumer_live_public_offer_reference_vaults
for each row execute function
  public.refuse_flight_consumer_live_public_offer_projection_mutation_v1();

create function public.purge_flight_consumer_live_expired_offer_references_v1(
  p_limit integer
)
returns table (
  decision text,
  purge_receipt_id uuid,
  purged_count integer,
  purged_at timestamptz,
  provider_dispatch_authorized boolean,
  consumer_exposure_authorized boolean,
  order_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
  payment_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $purge_flight_consumer_live_expired_offer_references_v1$
declare
  v_now timestamptz := clock_timestamp();
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_projection_set text;
  v_projection_set_sha256 text;
  v_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Flight Consumer Live reference purge request is invalid';
  end if;

  with selected as (
    select vault.projection_id
      from public.flight_consumer_live_public_offer_reference_vaults as vault
     where vault.retention_expires_at <= v_now
     order by vault.retention_expires_at, vault.projection_id
     for update skip locked
     limit p_limit
  ), purged as (
    delete from public.flight_consumer_live_public_offer_reference_vaults as vault
     using selected
     where vault.projection_id = selected.projection_id
     returning vault.projection_id
  )
  select count(*)::integer,
         string_agg(projection_id::text, ',' order by projection_id)
    into v_count, v_projection_set
    from purged;

  if v_count = 0 then
    return query select 'empty'::text, null::uuid, 0, v_now,
      false, false, false, false, false, false, false, false, false,
      false, false, false, false;
    return;
  end if;

  v_projection_set_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:expired-reference-set:v1', 'UTF8'
    ) || decode('00', 'hex') || convert_to(v_projection_set, 'UTF8'), 'sha256'
  ), 'hex');
  v_receipt_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:expired-reference-purge-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_id::text || ':' || v_projection_set_sha256 || ':'
      || v_count::text || ':' || p_limit::text || ':'
      || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'UTF8'
    ), 'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_public_offer_reference_purge_receipts (
    id, cutoff_at, requested_limit, purged_count,
    purged_projection_set_sha256, purge_receipt_sha256, created_at
  ) values (
    v_id, v_now, p_limit, v_count,
    v_projection_set_sha256, v_receipt_sha256, v_now
  );
  return query select 'purged'::text, v_id, v_count, v_now,
    false, false, false, false, false, false, false, false, false,
    false, false, false, false;
end;
$purge_flight_consumer_live_expired_offer_references_v1$;

alter function public.purge_flight_consumer_live_expired_offer_references_v1(integer)
  owner to postgres;
revoke all on function
  public.purge_flight_consumer_live_expired_offer_references_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.purge_flight_consumer_live_expired_offer_references_v1(integer)
  to service_role;

comment on function
  public.purge_flight_consumer_live_expired_offer_references_v1(integer) is
  'Deletes at most 500 expired encrypted offer-reference rows and records one digest-only receipt for a non-empty purge. It returns no ciphertext or digest and grants no authority.';

commit;
