begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'listing_scope'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'direct_request_mode'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'commercial_terms_version'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'commercial_verified_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'commercial_verified_by'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'support_contact_email'
  ) then
    raise exception 'Migration 202608220070 property-classification fields are required before 202608220071';
  end if;
end;
$$;

alter table public.rooms
  add column if not exists direct_rate_plan_code text,
  add column if not exists direct_rate_plan_name text,
  add column if not exists direct_currency_code text,
  add column if not exists direct_cancellation_policy text,
  add column if not exists direct_cancellation_policy_version text;

alter table public.rooms
  drop constraint if exists rooms_direct_currency_code_check,
  add constraint rooms_direct_currency_code_check
    check (direct_currency_code is null or direct_currency_code ~ '^[A-Z]{3}$'),
  drop constraint if exists rooms_direct_rate_plan_code_length_check,
  add constraint rooms_direct_rate_plan_code_length_check
    check (direct_rate_plan_code is null or char_length(trim(direct_rate_plan_code)) between 1 and 80),
  drop constraint if exists rooms_direct_rate_plan_name_length_check,
  add constraint rooms_direct_rate_plan_name_length_check
    check (direct_rate_plan_name is null or char_length(trim(direct_rate_plan_name)) between 1 and 160),
  drop constraint if exists rooms_direct_cancellation_policy_length_check,
  add constraint rooms_direct_cancellation_policy_length_check
    check (direct_cancellation_policy is null or char_length(trim(direct_cancellation_policy)) between 10 and 2000),
  drop constraint if exists rooms_direct_cancellation_version_length_check,
  add constraint rooms_direct_cancellation_version_length_check
    check (direct_cancellation_policy_version is null or char_length(trim(direct_cancellation_policy_version)) between 1 and 80);

alter table public.inventory
  add column if not exists direct_tax_amount numeric(12,2),
  add column if not exists direct_mandatory_fee_amount numeric(12,2);

alter table public.inventory
  drop constraint if exists inventory_direct_tax_amount_bounds,
  add constraint inventory_direct_tax_amount_bounds
    check (direct_tax_amount is null or direct_tax_amount between 0 and 25000),
  drop constraint if exists inventory_direct_mandatory_fee_bounds,
  add constraint inventory_direct_mandatory_fee_bounds
    check (direct_mandatory_fee_amount is null or direct_mandatory_fee_amount between 0 and 25000);

create table public.direct_hotel_runtime_controls (
  singleton boolean primary key default true check (singleton),
  request_submission_enabled boolean not null default false,
  partner_offers_enabled boolean not null default false,
  expiry_worker_verified boolean not null default false,
  transaction_kill_switch_engaged boolean not null default true,
  booking_authority_enabled boolean not null default false,
  payment_authority_enabled boolean not null default false,
  reward_authority_enabled boolean not null default false,
  payout_authority_enabled boolean not null default false,
  supplier_traffic_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint direct_hotel_runtime_no_transactional_authority check (
    not booking_authority_enabled
    and not payment_authority_enabled
    and not reward_authority_enabled
    and not payout_authority_enabled
    and not supplier_traffic_enabled
  ),
  constraint direct_hotel_lifecycle_expiry_dependency check (
    not (request_submission_enabled or partner_offers_enabled)
    or expiry_worker_verified
  )
);

insert into public.direct_hotel_runtime_controls (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.direct_hotel_runtime_controls enable row level security;
revoke all on public.direct_hotel_runtime_controls from public, anon, authenticated;
grant select on public.direct_hotel_runtime_controls to anon, authenticated;
grant all on public.direct_hotel_runtime_controls to service_role;
create policy "Read direct hotel runtime safety state"
  on public.direct_hotel_runtime_controls for select to anon, authenticated
  using (singleton);

create table public.hotel_stay_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  client_request_key uuid not null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests between 1 and 30),
  lead_guest_full_name text not null check (char_length(trim(lead_guest_full_name)) between 2 and 120),
  lead_guest_email text not null check (char_length(trim(lead_guest_email)) between 3 and 320),
  lead_guest_phone text check (lead_guest_phone is null or char_length(trim(lead_guest_phone)) between 7 and 40),
  special_requests text check (special_requests is null or char_length(special_requests) <= 1000),
  currency_code text not null check (currency_code = 'USD'),
  rate_plan_code text not null,
  rate_plan_name text not null,
  cancellation_policy text not null,
  cancellation_policy_version text not null,
  commercial_terms_version text not null,
  room_subtotal numeric(12,2) not null check (room_subtotal >= 0),
  tax_total numeric(12,2) not null check (tax_total >= 0),
  mandatory_fee_total numeric(12,2) not null check (mandatory_fee_total >= 0),
  all_in_total numeric(12,2) not null check (all_in_total >= 0),
  status text not null default 'submitted'
    check (status in ('submitted', 'offered', 'declined', 'withdrawn', 'expired')),
  request_expires_at timestamptz not null,
  offered_at timestamptz,
  offer_expires_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  decline_reason text check (decline_reason is null or char_length(trim(decline_reason)) between 3 and 500),
  withdrawal_reason text check (withdrawal_reason is null or char_length(trim(withdrawal_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_stay_requests_dates_check check (check_out > check_in),
  constraint hotel_stay_requests_total_check check (
    all_in_total = room_subtotal + tax_total + mandatory_fee_total
  ),
  constraint hotel_stay_requests_offer_fields_check check (
    (status = 'offered' and offered_at is not null and offer_expires_at is not null and reviewed_by is not null)
    or status <> 'offered'
  ),
  unique (customer_id, client_request_key)
);

create unique index hotel_stay_requests_one_open_stay_idx
  on public.hotel_stay_requests (customer_id, room_id, check_in, check_out)
  where status in ('submitted', 'offered');
create index hotel_stay_requests_customer_created_idx
  on public.hotel_stay_requests (customer_id, created_at desc);
create index hotel_stay_requests_partner_status_idx
  on public.hotel_stay_requests (partner_id, status, check_in, created_at);
create index hotel_stay_requests_expiry_idx
  on public.hotel_stay_requests (status, request_expires_at, offer_expires_at)
  where status in ('submitted', 'offered');

create table public.hotel_stay_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.hotel_stay_requests(id) on delete restrict,
  event_type text not null
    check (event_type in ('submitted', 'offered', 'declined', 'withdrawn', 'expired')),
  from_status text check (from_status is null or from_status in ('submitted', 'offered', 'declined', 'withdrawn', 'expired')),
  to_status text not null
    check (to_status in ('submitted', 'offered', 'declined', 'withdrawn', 'expired')),
  actor_id uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index hotel_stay_request_events_request_created_idx
  on public.hotel_stay_request_events (request_id, created_at, id);

create table public.hotel_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.hotel_stay_requests(id) on delete restrict,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  stay_date date not null,
  units integer not null default 1 check (units = 1),
  available_units_before integer not null check (available_units_before between 1 and 500),
  status text not null default 'active' check (status in ('active', 'released', 'expired')),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, inventory_id),
  unique (request_id, stay_date)
);

create index hotel_inventory_holds_active_request_idx
  on public.hotel_inventory_holds (request_id, status, stay_date)
  where status = 'active';

create function public.enforce_direct_hotel_active_hold_inventory_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.available_units is distinct from old.available_units
    or new.rate is distinct from old.rate
    or new.direct_tax_amount is distinct from old.direct_tax_amount
    or new.direct_mandatory_fee_amount is distinct from old.direct_mandatory_fee_amount
  )
  and coalesce(
    current_setting('app.direct_hotel_inventory_mutation', true),
    ''
  ) <> 'authorized'
  and exists (
    select 1
    from public.hotel_inventory_holds as hold_record
    where hold_record.inventory_id = old.id
      and hold_record.status = 'active'
  ) then
    raise exception 'Active direct hotel offer inventory is immutable until release or expiry'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_direct_hotel_active_hold_inventory_immutability()
  from public, anon, authenticated;
create trigger enforce_direct_hotel_active_hold_inventory_immutability
before update of available_units, rate, direct_tax_amount, direct_mandatory_fee_amount
on public.inventory
for each row execute function public.enforce_direct_hotel_active_hold_inventory_immutability();

alter table public.hotel_stay_requests enable row level security;
alter table public.hotel_stay_request_events enable row level security;
alter table public.hotel_inventory_holds enable row level security;

revoke all on public.hotel_stay_requests from public, anon, authenticated;
revoke all on public.hotel_stay_request_events from public, anon, authenticated;
revoke all on public.hotel_inventory_holds from public, anon, authenticated;
grant select on public.hotel_stay_requests to authenticated;
grant select on public.hotel_stay_request_events to authenticated;
grant select on public.hotel_inventory_holds to authenticated;
grant all on public.hotel_stay_requests to service_role;
grant all on public.hotel_stay_request_events to service_role;
grant all on public.hotel_inventory_holds to service_role;

create policy "Participants view direct hotel requests"
  on public.hotel_stay_requests for select to authenticated
  using (
    customer_id = auth.uid()
    or public.can_manage_partner_hotels(partner_id)
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Participants view direct hotel request events"
  on public.hotel_stay_request_events for select to authenticated
  using (exists (
    select 1 from public.hotel_stay_requests
    where hotel_stay_requests.id = hotel_stay_request_events.request_id
  ));

create policy "Participants view direct hotel holds"
  on public.hotel_inventory_holds for select to authenticated
  using (exists (
    select 1 from public.hotel_stay_requests
    where hotel_stay_requests.id = hotel_inventory_holds.request_id
  ));

create function public.prevent_direct_hotel_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Direct hotel request events are immutable'
    using errcode = '42501';
end;
$$;

revoke all on function public.prevent_direct_hotel_event_mutation()
  from public, anon, authenticated;

create trigger prevent_direct_hotel_event_mutation
before update or delete on public.hotel_stay_request_events
for each row execute function public.prevent_direct_hotel_event_mutation();

create function public.submit_direct_hotel_stay_request(
  p_property_id uuid,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_lead_guest_full_name text,
  p_lead_guest_email text,
  p_lead_guest_phone text,
  p_special_requests text,
  p_client_request_key uuid
)
returns public.hotel_stay_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.hotel_stay_requests;
  v_partner_id uuid;
  v_room_max_guests integer;
  v_rate_plan_code text;
  v_rate_plan_name text;
  v_currency_code text;
  v_cancellation_policy text;
  v_cancellation_policy_version text;
  v_commercial_terms_version text;
  v_expected_nights integer;
  v_inventory_count integer;
  v_eligible_count integer;
  v_room_subtotal numeric(12,2);
  v_tax_total numeric(12,2);
  v_mandatory_fee_total numeric(12,2);
  v_authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.direct_hotel_runtime_controls as runtime_control
    where runtime_control.singleton
      and runtime_control.request_submission_enabled
      and runtime_control.expiry_worker_verified
      and runtime_control.transaction_kill_switch_engaged
      and not runtime_control.booking_authority_enabled
      and not runtime_control.payment_authority_enabled
      and not runtime_control.reward_authority_enabled
      and not runtime_control.payout_authority_enabled
      and not runtime_control.supplier_traffic_enabled
  ) then
    raise exception 'The database direct hotel request gate is closed'
      using errcode = 'P0001';
  end if;

  select request_record.*
  into v_request
  from public.hotel_stay_requests as request_record
  where request_record.customer_id = auth.uid()
    and request_record.client_request_key = p_client_request_key;
  if found then
    return v_request;
  end if;

  v_authenticated_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_authenticated_email = ''
    or lower(trim(coalesce(p_lead_guest_email, ''))) <> v_authenticated_email then
    raise exception 'The lead guest email must match the authenticated account'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_lead_guest_full_name, ''))) not between 2 and 120 then
    raise exception 'A valid lead guest name is required' using errcode = '22023';
  end if;
  if p_lead_guest_phone is not null
    and char_length(trim(p_lead_guest_phone)) not between 7 and 40 then
    raise exception 'Lead guest phone is invalid' using errcode = '22023';
  end if;
  if p_special_requests is not null and char_length(p_special_requests) > 1000 then
    raise exception 'Special requests exceed the allowed length' using errcode = '22023';
  end if;

  v_expected_nights := p_check_out - p_check_in;
  if p_check_in <= current_date
    or v_expected_nights < 1
    or v_expected_nights > 30
    or p_check_in > current_date + 366 then
    raise exception 'Choose a stay beginning after today and lasting between 1 and 30 nights'
      using errcode = '22023';
  end if;

  select
    property_record.partner_id,
    room_record.max_guests,
    room_record.direct_rate_plan_code,
    room_record.direct_rate_plan_name,
    room_record.direct_currency_code,
    room_record.direct_cancellation_policy,
    room_record.direct_cancellation_policy_version,
    property_record.commercial_terms_version
  into
    v_partner_id,
    v_room_max_guests,
    v_rate_plan_code,
    v_rate_plan_name,
    v_currency_code,
    v_cancellation_policy,
    v_cancellation_policy_version,
    v_commercial_terms_version
  from public.properties as property_record
  join public.partners as partner_record
    on partner_record.id = property_record.partner_id
  join public.rooms as room_record
    on room_record.property_id = property_record.id
  where property_record.id = p_property_id
    and room_record.id = p_room_id
    and property_record.active = true
    and partner_record.status = 'approved'
    and property_record.listing_scope = 'commercial'
    and property_record.direct_request_mode = 'request_only'
    and property_record.commercial_terms_version =
      'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    and property_record.commercial_verified_at is not null
    and property_record.commercial_verified_by is not null
    and property_record.support_contact_email is not null
    and room_record.active = true
    and room_record.direct_rate_plan_code is not null
    and room_record.direct_rate_plan_name is not null
    and room_record.direct_currency_code = 'USD'
    and room_record.direct_cancellation_policy is not null
    and room_record.direct_cancellation_policy_version is not null;

  if not found then
    raise exception 'This property is not enabled for direct stay requests'
      using errcode = 'P0002';
  end if;
  if p_guests < 1 or p_guests > v_room_max_guests then
    raise exception 'Guest count exceeds this room capacity' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where inventory_record.available_units > 0
        and inventory_record.direct_tax_amount is not null
        and inventory_record.direct_mandatory_fee_amount is not null
    )::integer,
    coalesce(sum(inventory_record.rate), 0)::numeric(12,2),
    coalesce(sum(inventory_record.direct_tax_amount), 0)::numeric(12,2),
    coalesce(sum(inventory_record.direct_mandatory_fee_amount), 0)::numeric(12,2)
  into
    v_inventory_count,
    v_eligible_count,
    v_room_subtotal,
    v_tax_total,
    v_mandatory_fee_total
  from public.inventory as inventory_record
  where inventory_record.room_id = p_room_id
    and inventory_record.stay_date >= p_check_in
    and inventory_record.stay_date < p_check_out;

  if v_inventory_count <> v_expected_nights or v_eligible_count <> v_expected_nights then
    raise exception 'Complete priced availability is unavailable for this stay'
      using errcode = 'P0001';
  end if;

  insert into public.hotel_stay_requests (
    request_code,
    client_request_key,
    customer_id,
    partner_id,
    property_id,
    room_id,
    check_in,
    check_out,
    guests,
    lead_guest_full_name,
    lead_guest_email,
    lead_guest_phone,
    special_requests,
    currency_code,
    rate_plan_code,
    rate_plan_name,
    cancellation_policy,
    cancellation_policy_version,
    commercial_terms_version,
    room_subtotal,
    tax_total,
    mandatory_fee_total,
    all_in_total,
    request_expires_at
  ) values (
    'HSR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_client_request_key,
    auth.uid(),
    v_partner_id,
    p_property_id,
    p_room_id,
    p_check_in,
    p_check_out,
    p_guests,
    trim(p_lead_guest_full_name),
    v_authenticated_email,
    nullif(trim(p_lead_guest_phone), ''),
    nullif(trim(p_special_requests), ''),
    v_currency_code,
    v_rate_plan_code,
    v_rate_plan_name,
    v_cancellation_policy,
    v_cancellation_policy_version,
    v_commercial_terms_version,
    v_room_subtotal,
    v_tax_total,
    v_mandatory_fee_total,
    v_room_subtotal + v_tax_total + v_mandatory_fee_total,
    least(now() + interval '48 hours', p_check_in::timestamptz)
  )
  on conflict (customer_id, client_request_key) do nothing
  returning * into v_request;

  if not found then
    select request_record.*
    into v_request
    from public.hotel_stay_requests as request_record
    where request_record.customer_id = auth.uid()
      and request_record.client_request_key = p_client_request_key;
    return v_request;
  end if;

  insert into public.hotel_stay_request_events (
    request_id, event_type, from_status, to_status, actor_id, note
  ) values (
    v_request.id, 'submitted', null, 'submitted', auth.uid(),
    'Stay request submitted. No reservation or payment was created.'
  );

  return v_request;
end;
$$;

create function public.release_direct_hotel_request_holds(
  p_request_id uuid,
  p_release_status text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.hotel_inventory_holds;
  v_expected_nights integer;
  v_active_holds integer;
  v_released integer := 0;
begin
  if p_release_status not in ('released', 'expired') then
    raise exception 'Invalid hold release status' using errcode = '22023';
  end if;

  select request_record.check_out - request_record.check_in
  into v_expected_nights
  from public.hotel_stay_requests as request_record
  where request_record.id = p_request_id;

  select count(*)::integer
  into v_active_holds
  from public.hotel_inventory_holds as hold_record
  where hold_record.request_id = p_request_id
    and hold_record.status = 'active';

  if v_expected_nights is null or v_active_holds <> v_expected_nights then
    raise exception 'The exact active nightly hold set is unavailable'
      using errcode = 'P0001';
  end if;

  perform set_config(
    'app.direct_hotel_inventory_mutation',
    'authorized',
    true
  );

  for v_hold in
    select hold_record.*
    from public.hotel_inventory_holds as hold_record
    where hold_record.request_id = p_request_id
      and hold_record.status = 'active'
    order by hold_record.stay_date, hold_record.id
    for update
  loop
    update public.hotel_inventory_holds as hold_record
    set status = p_release_status,
        released_at = now()
    where hold_record.id = v_hold.id
      and hold_record.status = 'active';
    if not found then
      raise exception 'A nightly hold was already released'
        using errcode = 'P0001';
    end if;

    update public.inventory as inventory_record
    set available_units = inventory_record.available_units + v_hold.units
    where inventory_record.id = v_hold.inventory_id
      and inventory_record.room_id = v_hold.room_id
      and inventory_record.stay_date = v_hold.stay_date;
    if not found then
      raise exception 'A held inventory night could not be restored'
        using errcode = 'P0001';
    end if;
    v_released := v_released + 1;
  end loop;

  perform set_config('app.direct_hotel_inventory_mutation', '', true);

  return v_released;
end;
$$;

revoke all on function public.release_direct_hotel_request_holds(uuid, text)
  from public, anon, authenticated, service_role;

create function public.review_direct_hotel_stay_request(
  p_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_offer_expires_at timestamptz default null
)
returns public.hotel_stay_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.hotel_stay_requests;
  v_expected_nights integer;
  v_inventory_count integer;
  v_eligible_count integer;
  v_updated_count integer;
  v_room_subtotal numeric(12,2);
  v_tax_total numeric(12,2);
  v_mandatory_fee_total numeric(12,2);
  v_rate_plan_code text;
  v_rate_plan_name text;
  v_currency_code text;
  v_cancellation_policy text;
  v_cancellation_policy_version text;
  v_commercial_terms_version text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.direct_hotel_runtime_controls as runtime_control
    where runtime_control.singleton
      and runtime_control.partner_offers_enabled
      and runtime_control.expiry_worker_verified
      and runtime_control.transaction_kill_switch_engaged
      and not runtime_control.booking_authority_enabled
      and not runtime_control.payment_authority_enabled
      and not runtime_control.reward_authority_enabled
      and not runtime_control.payout_authority_enabled
      and not runtime_control.supplier_traffic_enabled
  ) then
    raise exception 'The database direct hotel offer gate is closed'
      using errcode = 'P0001';
  end if;
  if p_decision not in ('offer', 'decline') then
    raise exception 'Choose offer or decline' using errcode = '22023';
  end if;

  select request_record.*
  into v_request
  from public.hotel_stay_requests as request_record
  where request_record.id = p_request_id
    and (
      public.can_manage_partner_hotels(request_record.partner_id)
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
      )
    )
  for update;

  if not found then
    raise exception 'Stay request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'submitted' then
    raise exception 'Only a submitted request can be reviewed' using errcode = '22023';
  end if;
  if v_request.request_expires_at <= now() then
    raise exception 'This stay request expired before review'
      using errcode = 'P0001';
  end if;

  if p_decision = 'decline' then
    if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
      raise exception 'A decline reason between 3 and 500 characters is required'
        using errcode = '22023';
    end if;
    update public.hotel_stay_requests as request_record
    set status = 'declined',
        reviewed_by = auth.uid(),
        decline_reason = trim(p_reason),
        updated_at = now()
    where request_record.id = v_request.id
    returning * into v_request;
    insert into public.hotel_stay_request_events (
      request_id, event_type, from_status, to_status, actor_id, note
    ) values (
      v_request.id, 'declined', 'submitted', 'declined', auth.uid(), trim(p_reason)
    );
    return v_request;
  end if;

  if p_offer_expires_at is null
    or p_offer_expires_at < now() + interval '15 minutes'
    or p_offer_expires_at > now() + interval '48 hours'
    or p_offer_expires_at >= v_request.check_in::timestamptz then
    raise exception 'Offer expiry must be 15 minutes to 48 hours away and before check-in'
      using errcode = '22023';
  end if;

  select
    room_record.direct_rate_plan_code,
    room_record.direct_rate_plan_name,
    room_record.direct_currency_code,
    room_record.direct_cancellation_policy,
    room_record.direct_cancellation_policy_version,
    property_record.commercial_terms_version
  into
    v_rate_plan_code,
    v_rate_plan_name,
    v_currency_code,
    v_cancellation_policy,
    v_cancellation_policy_version,
    v_commercial_terms_version
  from public.properties as property_record
  join public.partners as partner_record
    on partner_record.id = property_record.partner_id
  join public.rooms as room_record
    on room_record.property_id = property_record.id
  where property_record.id = v_request.property_id
    and room_record.id = v_request.room_id
    and property_record.partner_id = v_request.partner_id
    and property_record.active = true
    and partner_record.status = 'approved'
    and property_record.listing_scope = 'commercial'
    and property_record.direct_request_mode = 'request_only'
    and property_record.commercial_verified_at is not null
    and property_record.commercial_verified_by is not null
    and property_record.support_contact_email is not null
    and room_record.active = true;

  if not found
    or v_currency_code <> 'USD'
    or v_rate_plan_code is distinct from v_request.rate_plan_code
    or v_rate_plan_name is distinct from v_request.rate_plan_name
    or v_cancellation_policy is distinct from v_request.cancellation_policy
    or v_cancellation_policy_version is distinct from v_request.cancellation_policy_version
    or v_commercial_terms_version is distinct from v_request.commercial_terms_version then
    raise exception 'The property terms changed; ask the traveler to submit a new request'
      using errcode = 'P0001';
  end if;

  v_expected_nights := v_request.check_out - v_request.check_in;
  perform 1
  from public.inventory as inventory_record
  where inventory_record.room_id = v_request.room_id
    and inventory_record.stay_date >= v_request.check_in
    and inventory_record.stay_date < v_request.check_out
  order by inventory_record.stay_date, inventory_record.id
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where inventory_record.available_units > 0
        and inventory_record.direct_tax_amount is not null
        and inventory_record.direct_mandatory_fee_amount is not null
    )::integer,
    coalesce(sum(inventory_record.rate), 0)::numeric(12,2),
    coalesce(sum(inventory_record.direct_tax_amount), 0)::numeric(12,2),
    coalesce(sum(inventory_record.direct_mandatory_fee_amount), 0)::numeric(12,2)
  into
    v_inventory_count,
    v_eligible_count,
    v_room_subtotal,
    v_tax_total,
    v_mandatory_fee_total
  from public.inventory as inventory_record
  where inventory_record.room_id = v_request.room_id
    and inventory_record.stay_date >= v_request.check_in
    and inventory_record.stay_date < v_request.check_out;

  if v_inventory_count <> v_expected_nights
    or v_eligible_count <> v_expected_nights
    or v_room_subtotal <> v_request.room_subtotal
    or v_tax_total <> v_request.tax_total
    or v_mandatory_fee_total <> v_request.mandatory_fee_total then
    raise exception 'Availability or all-in pricing changed; ask the traveler to submit a new request'
      using errcode = 'P0001';
  end if;

  perform set_config(
    'app.direct_hotel_inventory_mutation',
    'authorized',
    true
  );
  update public.inventory as inventory_record
  set available_units = inventory_record.available_units - 1
  where inventory_record.room_id = v_request.room_id
    and inventory_record.stay_date >= v_request.check_in
    and inventory_record.stay_date < v_request.check_out
    and inventory_record.available_units > 0;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_expected_nights then
    raise exception 'Inventory changed while the offer was being prepared'
      using errcode = 'P0001';
  end if;
  perform set_config('app.direct_hotel_inventory_mutation', '', true);

  insert into public.hotel_inventory_holds (
    request_id,
    inventory_id,
    room_id,
    stay_date,
    available_units_before
  )
  select
    v_request.id,
    inventory_record.id,
    inventory_record.room_id,
    inventory_record.stay_date,
    inventory_record.available_units + 1
  from public.inventory as inventory_record
  where inventory_record.room_id = v_request.room_id
    and inventory_record.stay_date >= v_request.check_in
    and inventory_record.stay_date < v_request.check_out
  order by inventory_record.stay_date;

  update public.hotel_stay_requests as request_record
  set status = 'offered',
      offered_at = now(),
      offer_expires_at = p_offer_expires_at,
      reviewed_by = auth.uid(),
      updated_at = now()
  where request_record.id = v_request.id
  returning * into v_request;

  insert into public.hotel_stay_request_events (
    request_id, event_type, from_status, to_status, actor_id, note
  ) values (
    v_request.id, 'offered', 'submitted', 'offered', auth.uid(),
    'Property offered the quoted stay. This is not a reservation and no payment was collected.'
  );

  return v_request;
end;
$$;

create function public.withdraw_direct_hotel_stay_request(
  p_request_id uuid,
  p_reason text default null
)
returns public.hotel_stay_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.hotel_stay_requests;
  v_from_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_reason is not null and char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Withdrawal reason must be between 3 and 500 characters'
      using errcode = '22023';
  end if;

  select request_record.*
  into v_request
  from public.hotel_stay_requests as request_record
  where request_record.id = p_request_id
    and request_record.customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Stay request not found' using errcode = 'P0002';
  end if;
  if v_request.status not in ('submitted', 'offered') then
    raise exception 'This stay request can no longer be withdrawn' using errcode = '22023';
  end if;

  v_from_status := v_request.status;
  if v_request.status = 'offered' then
    perform public.release_direct_hotel_request_holds(v_request.id, 'released');
  end if;

  update public.hotel_stay_requests as request_record
  set status = 'withdrawn',
      withdrawal_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where request_record.id = v_request.id
  returning * into v_request;

  insert into public.hotel_stay_request_events (
    request_id, event_type, from_status, to_status, actor_id, note
  ) values (
    v_request.id, 'withdrawn', v_from_status, 'withdrawn', auth.uid(),
    coalesce(nullif(trim(p_reason), ''), 'Withdrawn by traveler')
  );
  return v_request;
end;
$$;

create function public.expire_direct_hotel_stay_requests(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.hotel_stay_requests;
  v_expired integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Expiry batch limit must be between 1 and 500'
      using errcode = '22023';
  end if;

  for v_request in
    select request_record.*
    from public.hotel_stay_requests as request_record
    where (
      request_record.status = 'submitted'
      and request_record.request_expires_at <= now()
    ) or (
      request_record.status = 'offered'
      and request_record.offer_expires_at <= now()
    )
    order by coalesce(request_record.offer_expires_at, request_record.request_expires_at), request_record.id
    limit p_limit
    for update skip locked
  loop
    if v_request.status = 'offered' then
      perform public.release_direct_hotel_request_holds(v_request.id, 'expired');
    end if;
    update public.hotel_stay_requests as request_record
    set status = 'expired',
        updated_at = now()
    where request_record.id = v_request.id;
    insert into public.hotel_stay_request_events (
      request_id, event_type, from_status, to_status, actor_id, note
    ) values (
      v_request.id, 'expired', v_request.status, 'expired', null,
      'Stay request expired. Any local nightly hold was restored exactly once.'
    );
    v_expired := v_expired + 1;
  end loop;
  return v_expired;
end;
$$;

revoke all on function public.submit_direct_hotel_stay_request(
  uuid, uuid, date, date, integer, text, text, text, text, uuid
) from public, anon, service_role;
grant execute on function public.submit_direct_hotel_stay_request(
  uuid, uuid, date, date, integer, text, text, text, text, uuid
) to authenticated;

revoke all on function public.review_direct_hotel_stay_request(
  uuid, text, text, timestamptz
) from public, anon, service_role;
grant execute on function public.review_direct_hotel_stay_request(
  uuid, text, text, timestamptz
) to authenticated;

revoke all on function public.withdraw_direct_hotel_stay_request(uuid, text)
  from public, anon, service_role;
grant execute on function public.withdraw_direct_hotel_stay_request(uuid, text)
  to authenticated;

revoke all on function public.expire_direct_hotel_stay_requests(integer)
  from public, anon, authenticated;
grant execute on function public.expire_direct_hotel_stay_requests(integer)
  to service_role;

comment on table public.hotel_stay_requests is
  'Non-transactional direct-hotel request/offer records. These rows are not bookings, confirmations, reservations, payments, rewards, payouts, or supplier reservations.';
comment on table public.direct_hotel_runtime_controls is
  'Database-enforced, fail-closed request and offer gates. Transactional authority is structurally false in this migration.';
comment on table public.hotel_inventory_holds is
  'One local nightly unit per offered request. Holds are restored exactly once on withdrawal or expiry and never create an external reservation.';
comment on function public.review_direct_hotel_stay_request(uuid, text, text, timestamptz) is
  'Allows an authorized hotel manager to decline or make a time-limited non-binding offer. There is deliberately no accept or booking transition.';

commit;
