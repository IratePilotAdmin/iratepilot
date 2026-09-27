begin;

-- Immutable, idempotent receipts for manager-approved PMS changes. This first
-- contract only moves future confirmed stays without changing the quoted
-- amount, room type, guest count, status, or payment. Financial changes remain
-- a separate explicitly reviewed workflow.
create table public.irp_pms_reservation_change_receipts (
  request_id uuid primary key,
  connection_id text not null references public.irp_pms_native_ari_connections(connection_id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  outcome text not null check (outcome in ('applied','review')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_-]{1,80}$'),
  approving_actor_reference text not null check (approving_actor_reference ~ '^[0-9a-fA-F-]{36}$'),
  source_version bigint check (source_version is null or source_version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  check ((outcome = 'applied' and reason_code is null and source_version is not null)
      or (outcome = 'review' and reason_code is not null))
);
alter table public.irp_pms_reservation_change_receipts enable row level security;
revoke all on public.irp_pms_reservation_change_receipts from public, anon, authenticated;
grant select, insert on public.irp_pms_reservation_change_receipts to service_role;

create function public.irp_pms_apply_reservation_change(
  p_connection text,
  p_request uuid,
  p_property text,
  p_booking uuid,
  p_expected_source_version bigint,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_approved_by text,
  p_payload_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.irp_pms_native_ari_connections%rowtype;
  b public.bookings%rowtype;
  prior public.irp_pms_reservation_change_receipts%rowtype;
  current_version bigint;
  new_version bigint;
  new_nights integer;
  priced_nights integer;
  new_subtotal numeric(12,2);
  stay_day date;
  available integer;
  reason text;
begin
  if p_connection is null or p_connection !~ '^[A-Za-z0-9_-]{1,80}$'
     or p_request is null or p_property is null or length(trim(p_property)) not between 1 and 128
     or p_booking is null or p_expected_source_version is null
     or p_expected_source_version not between 1 and 9007199254740991
     or p_check_in is null or p_check_out is null or p_guests is null
     or p_approved_by is null or p_approved_by !~ '^[0-9a-fA-F-]{36}$'
     or p_payload_digest is null or p_payload_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid PMS reservation change request' using errcode = '22023';
  end if;

  select * into c from public.irp_pms_native_ari_connections
    where connection_id = p_connection for update;
  if not found or not c.enabled or c.pms_property_id <> p_property then
    raise exception 'PMS reservation change connection is unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.properties p join public.partners h on h.id = p.partner_id
    where p.id = c.property_id and p.active and h.status = 'approved'
  ) then raise exception 'OTA property is not active and approved' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.irp_pms_outbox_connections source
    where source.property_id = c.property_id and source.connection_id = p_connection
      and source.pms_property_id = c.pms_property_id and source.enabled
  ) then raise exception 'PMS reservation synchronization is not enabled' using errcode = '42501'; end if;

  select * into prior from public.irp_pms_reservation_change_receipts
    where request_id = p_request for update;
  if found then
    if prior.connection_id = p_connection and prior.property_id = c.property_id
       and prior.booking_id = p_booking and prior.payload_digest = p_payload_digest then
      return jsonb_build_object('outcome',prior.outcome,'reasonCode',prior.reason_code,
        'sourceVersion',prior.source_version,'duplicate',true);
    end if;
    raise exception 'PMS reservation change request ID conflict' using errcode = '23505';
  end if;

  select * into b from public.bookings where id = p_booking for update;
  if not found or b.property_id <> c.property_id then
    -- Do not create a receipt that could reveal the existence of a booking in
    -- another property (or fail its booking foreign key for a fabricated ID).
    raise exception 'PMS booking is unavailable' using errcode = '42501';
  end if;
  select version into current_version from public.irp_pms_booking_versions where booking_id = p_booking;
  if current_version is distinct from p_expected_source_version then
    reason := 'source_version_conflict';
  elsif b.status <> 'confirmed' or b.check_in <= current_date then
    reason := 'stay_not_changeable';
  elsif p_check_in <= current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    reason := 'invalid_or_started_stay';
  elsif p_guests <> b.guests then
    reason := 'guest_count_change_requires_review';
  elsif p_check_in = b.check_in and p_check_out = b.check_out then
    reason := 'no_stay_change';
  end if;

  if reason is null then
    new_nights := p_check_out - p_check_in;
    -- Lock the full old/new date window in a consistent order before checking
    -- availability or adjusting counts. This serializes competing reservations.
    perform i.stay_date from public.inventory i
      where i.room_id = b.room_id
        and i.stay_date >= least(b.check_in,p_check_in)
        and i.stay_date < greatest(b.check_out,p_check_out)
      order by i.stay_date for update;

    select count(*)::integer, round(coalesce(sum(i.rate),0),2)
      into priced_nights,new_subtotal
      from public.inventory i
      where i.room_id = b.room_id and i.stay_date >= p_check_in and i.stay_date < p_check_out;
    if priced_nights <> new_nights then
      reason := 'inventory_not_configured';
    elsif new_subtotal <> b.subtotal then
      reason := 'price_change_requires_review';
    else
      for stay_day in
        select d::date from (
          select generate_series(b.check_in::timestamp,(b.check_out-1)::timestamp,interval '1 day') as d
          union
          select generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') as d
        ) dates order by d
      loop
        if stay_day >= p_check_in and stay_day < p_check_out
           and not (stay_day >= b.check_in and stay_day < b.check_out) then
          select available_units into available from public.inventory
            where room_id = b.room_id and stay_date = stay_day;
          if available is null or available < 1 then reason := 'inventory_unavailable'; exit; end if;
        elsif stay_day >= b.check_in and stay_day < b.check_out
           and not (stay_day >= p_check_in and stay_day < p_check_out) then
          select available_units into available from public.inventory
            where room_id = b.room_id and stay_date = stay_day;
          if available is null or available >= 500 then reason := 'inventory_bounds'; exit; end if;
        end if;
      end loop;
    end if;
  end if;

  if reason is not null then
    insert into public.irp_pms_reservation_change_receipts(
      request_id,connection_id,property_id,booking_id,payload_digest,outcome,reason_code,approving_actor_reference)
    values(p_request,p_connection,c.property_id,p_booking,p_payload_digest,'review',reason,p_approved_by);
    return jsonb_build_object('outcome','review','reasonCode',reason,'duplicate',false);
  end if;

  for stay_day in
    select d::date from (
      select generate_series(b.check_in::timestamp,(b.check_out-1)::timestamp,interval '1 day') as d
      union
      select generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') as d
    ) dates order by d
  loop
    if stay_day >= p_check_in and stay_day < p_check_out
       and not (stay_day >= b.check_in and stay_day < b.check_out) then
      update public.inventory set available_units = available_units - 1
        where room_id = b.room_id and stay_date = stay_day;
    elsif stay_day >= b.check_in and stay_day < b.check_out
       and not (stay_day >= p_check_in and stay_day < p_check_out) then
      update public.inventory set available_units = available_units + 1
        where room_id = b.room_id and stay_date = stay_day;
    end if;
  end loop;

  -- Keep room assignment, guest count, status, taxes, fees, total, and payment
  -- identifiers untouched. The existing booking trigger creates the authoritative
  -- OTA->PMS source-version event in the same transaction.
  update public.bookings set check_in = p_check_in, check_out = p_check_out, updated_at = now()
    where id = p_booking;
  select version into new_version from public.irp_pms_booking_versions where booking_id = p_booking;
  if new_version is null or new_version <= p_expected_source_version then
    raise exception 'Reservation change did not produce a source version' using errcode = '40001';
  end if;
  insert into public.irp_pms_reservation_change_receipts(
    request_id,connection_id,property_id,booking_id,payload_digest,outcome,approving_actor_reference,source_version)
  values(p_request,p_connection,c.property_id,p_booking,p_payload_digest,'applied',p_approved_by,new_version);
  return jsonb_build_object('outcome','applied','sourceVersion',new_version,'duplicate',false);
end;
$$;
revoke all on function public.irp_pms_apply_reservation_change(text,uuid,text,uuid,bigint,date,date,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.irp_pms_apply_reservation_change(text,uuid,text,uuid,bigint,date,date,integer,text,text)
  to service_role;

commit;
