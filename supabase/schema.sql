create extension if not exists "uuid-ossp";

create type user_role as enum ('customer','partner','admin');
create type booking_status as enum ('pending','confirmed','cancelled','refunded');
create type property_type as enum ('hotel','resort','vacation_home');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text,
  phone text,
  membership_tier text not null default 'none' check (membership_tier in ('none','basic','business')),
  membership_status text not null default 'inactive' check (membership_status in ('inactive','active','past_due','cancelled')),
  membership_renews_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  membership_synced_at timestamptz,
  reward_points integer not null default 0 check (reward_points >= 0),
  created_at timestamptz not null default now()
);

create table partner_applications (
  id uuid primary key default uuid_generate_v4(),
  property_name text not null,
  contact_name text not null,
  email text not null,
  property_type property_type not null,
  star_rating integer check (star_rating in (4,5)),
  contact_role text check (contact_role in ('hotel_owner','general_manager','revenue_manager','sales_manager','authorized_representative')),
  phone text check (phone is null or char_length(phone) between 7 and 30),
  website_url text check (website_url is null or website_url ~ '^https://[^/@:]+([/:?#]|$)'),
  address_line1 text,
  city text,
  region text,
  postal_code text,
  country text,
  description text check (description is null or char_length(description) between 120 and 4000),
  amenities text[] not null default '{}' check (cardinality(amenities) between 0 and 20),
  photo_source_url text check (photo_source_url is null or photo_source_url ~ '^https://[^/@:]+([/:?#]|$)'),
  additional_notes text,
  hotel_authorized boolean not null default false,
  content_rights_confirmed boolean not null default false,
  information_accurate boolean not null default false,
  property_id uuid,
  status text not null default 'pending'
    constraint partner_applications_status_check check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);

create unique index one_pending_partner_application_per_email_and_property
  on partner_applications (lower(trim(email)), lower(trim(property_name)))
  where status = 'pending';

create unique index partner_applications_property_id_key
  on partner_applications (property_id)
  where property_id is not null;

create table contact_messages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  subject text not null,
  template_name text not null,
  template_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  resend_email_id text,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_outbox_processing_idx on email_outbox (status, scheduled_at);
alter table email_outbox enable row level security;
revoke all on email_outbox from anon, authenticated;
grant all on email_outbox to service_role;

create table partners (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id),
  business_name text not null,
  status text not null default 'pending',
  software_plan text not null default 'none' check (software_plan in ('none','starter','professional','premium','enterprise')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive','active','past_due','cancelled')),
  subscription_renews_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index partners_owner_id_key on partners (owner_id);

create table properties (
  id uuid primary key default uuid_generate_v4(),
  partner_id uuid not null references partners(id),
  name text not null,
  slug text unique not null,
  type property_type not null,
  star_rating integer check (star_rating in (4,5)),
  description text,
  image_url text,
  amenities text[] not null default '{}',
  guest_rating numeric(3,1) check (guest_rating between 0 and 10),
  review_count integer not null default 0 check (review_count >= 0),
  city text not null,
  region text,
  country text not null,
  latitude numeric,
  longitude numeric,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table partner_applications
  add constraint partner_applications_property_id_fkey
  foreign key (property_id) references properties(id) on delete set null;

create table rooms (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  max_guests integer not null default 2 constraint rooms_max_guests_bounds check (max_guests between 1 and 30),
  base_rate numeric(12,2) not null constraint rooms_base_rate_bounds check (base_rate between 25 and 25000),
  active boolean not null default true
);

create table inventory (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  stay_date date not null,
  available_units integer not null default 0 constraint inventory_available_units_bounds check (available_units between 0 and 500),
  rate numeric(12,2) not null constraint inventory_rate_bounds check (rate between 25 and 25000),
  unique(room_id, stay_date)
);

create table bookings (
  id uuid primary key default uuid_generate_v4(),
  confirmation_code text unique not null,
  customer_id uuid references profiles(id),
  property_id uuid not null references properties(id),
  room_id uuid not null references rooms(id),
  check_in date not null,
  check_out date not null,
  guests integer not null,
  subtotal numeric(12,2) not null,
  taxes numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  status booking_status not null default 'pending',
  stripe_payment_intent_id text,
  cancellation_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index one_open_booking_per_stay
  on bookings (customer_id, room_id, check_in, check_out)
  where status in ('pending', 'confirmed');

create unique index bookings_stripe_payment_intent_id_key
  on bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table booking_status_history (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  status booking_status not null,
  actor_id uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table reward_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  points integer not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table booking_financials (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  partner_id uuid not null references partners(id),
  gross_room_revenue numeric(12,2) not null check (gross_room_revenue >= 0),
  partner_commission numeric(12,2) not null check (partner_commission >= 0),
  partner_net numeric(12,2) not null check (partner_net >= 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','eligible','drafted','paid','void')),
  created_at timestamptz not null default now()
);

create or replace function public.apply_marketplace_commission()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.partner_commission := round(new.gross_room_revenue * 0.14, 2);
  new.partner_net := new.gross_room_revenue - new.partner_commission;
  return new;
end;
$$;

create trigger apply_marketplace_commission_before_insert
before insert on booking_financials
for each row execute function public.apply_marketplace_commission();

create table partner_payouts (
  id uuid primary key default uuid_generate_v4(),
  partner_id uuid not null references partners(id),
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table revenue_daily_inputs (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  stay_date date not null,
  rooms_available integer not null check (rooms_available >= 0),
  rooms_sold integer not null check (rooms_sold >= 0),
  current_rate numeric(12,2) not null check (current_rate >= 0),
  competitor_rate numeric(12,2) check (competitor_rate >= 0),
  last_year_occupancy numeric(5,2) check (last_year_occupancy between 0 and 100),
  event_name text,
  source text not null default 'csv',
  imported_by uuid references profiles(id),
  imported_at timestamptz not null default now(),
  unique(room_id, stay_date)
);

create table revenue_recommendations (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  stay_date date not null,
  current_rate numeric(12,2) not null,
  recommended_rate numeric(12,2) not null,
  occupancy_forecast numeric(5,2) not null check (occupancy_forecast between 0 and 100),
  estimated_revenue_impact numeric(12,2) not null default 0,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index one_pending_revenue_recommendation
  on revenue_recommendations(room_id, stay_date)
  where status = 'pending';

create table revenue_audit_log (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  recommendation_id uuid references revenue_recommendations(id) on delete set null,
  actor_id uuid references profiles(id),
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table revenue_daily_reports (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  report_date date not null,
  forecast_window_days integer not null default 90,
  average_occupancy numeric(5,2) not null default 0,
  average_daily_rate numeric(12,2) not null default 0,
  forecast_revenue numeric(12,2) not null default 0,
  pending_actions integer not null default 0,
  summary text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(property_id, report_date)
);

alter table profiles enable row level security;
alter table partners enable row level security;
alter table properties enable row level security;
alter table rooms enable row level security;
alter table inventory enable row level security;
alter table bookings enable row level security;
alter table partner_applications enable row level security;
alter table contact_messages enable row level security;
alter table booking_status_history enable row level security;
alter table notifications enable row level security;
alter table reward_ledger enable row level security;
alter table booking_financials enable row level security;
alter table partner_payouts enable row level security;
alter table revenue_daily_inputs enable row level security;
alter table revenue_recommendations enable row level security;
alter table revenue_audit_log enable row level security;
alter table revenue_daily_reports enable row level security;

create or replace function public.is_approved_marketplace_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = p_property_id
      and properties.active = true
      and partners.status = 'approved'
  );
$$;

create or replace function public.is_approved_marketplace_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = p_room_id
      and rooms.active = true
      and properties.active = true
      and partners.status = 'approved'
  );
$$;

revoke all on function public.is_approved_marketplace_property(uuid) from public;
revoke all on function public.is_approved_marketplace_room(uuid) from public;
grant execute on function public.is_approved_marketplace_property(uuid) to anon, authenticated;
grant execute on function public.is_approved_marketplace_room(uuid) to anon, authenticated;

create policy "Public can view active properties" on properties for select using (
  active = true and public.is_approved_marketplace_property(id)
);
create policy "Public can view active rooms" on rooms for select using (
  active = true and public.is_approved_marketplace_property(property_id)
);
create policy "Public can view inventory" on inventory for select using (
  public.is_approved_marketplace_room(room_id)
);
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Customers can view own bookings" on bookings for select using (auth.uid() = customer_id);
create policy "Partners can view own property bookings" on bookings for select using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = bookings.property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Admins can manage bookings" on bookings for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Customers can view own booking history" on booking_status_history for select using (
  exists (select 1 from bookings where bookings.id = booking_id and bookings.customer_id = auth.uid())
);
create policy "Partners can view own booking history" on booking_status_history for select using (
  exists (select 1 from bookings join properties on properties.id = bookings.property_id join partners on partners.id = properties.partner_id where bookings.id = booking_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Users can view own notifications" on notifications for select using (user_id = auth.uid());
create policy "Users can update own notifications" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can view own reward ledger" on reward_ledger for select using (user_id = auth.uid());
create policy "Admins can manage reward ledger" on reward_ledger for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Partners can view own booking financials" on booking_financials for select using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can view own payouts" on partner_payouts for select using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Admins can manage booking financials" on booking_financials for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Admins can manage partner payouts" on partner_payouts for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Partners can manage own revenue inputs" on revenue_daily_inputs for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can manage own revenue recommendations" on revenue_recommendations for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can view own revenue audit" on revenue_audit_log for select using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can create own revenue audit" on revenue_audit_log for insert with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can manage own revenue reports" on revenue_daily_reports for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Admins can manage revenue inputs" on revenue_daily_inputs for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins can manage revenue recommendations" on revenue_recommendations for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins can manage revenue audit" on revenue_audit_log for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins can manage revenue reports" on revenue_daily_reports for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins can view partner applications" on partner_applications for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Partners can view own partner record" on partners for select using (auth.uid() = owner_id);
create policy "Partners can view own properties" on properties for select using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
create policy "Partners can update own properties" on properties for update using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  active = false and exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can manage own rooms" on rooms for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = rooms.property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = rooms.property_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Partners can manage own inventory" on inventory for all using (
  exists (select 1 from rooms join properties on properties.id = rooms.property_id join partners on partners.id = properties.partner_id where rooms.id = inventory.room_id and partners.owner_id = auth.uid() and partners.status = 'approved')
) with check (
  inventory.stay_date >= current_date and exists (select 1 from rooms join properties on properties.id = rooms.property_id join partners on partners.id = properties.partner_id where rooms.id = inventory.room_id and partners.owner_id = auth.uid() and partners.status = 'approved')
);
create policy "Admins can manage rooms" on rooms for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Admins can manage inventory" on inventory for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Admins can manage partners" on partners for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Admins can manage properties" on properties for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

create or replace function public.enforce_approved_partner_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = new.room_id
      and properties.id = new.property_id
      and rooms.active = true
      and properties.active = true
      and partners.status = 'approved'
  ) then
    raise exception 'Bookings require an active room from an approved partner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_approved_partner_booking() from public;

create trigger enforce_approved_partner_booking
before insert or update of property_id, room_id on public.bookings
for each row execute function public.enforce_approved_partner_booking();

create or replace function public.enforce_partner_before_property_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active = true and not exists (
    select 1
    from public.partners
    where partners.id = new.partner_id
      and partners.status = 'approved'
  ) then
    raise exception 'Approve the partner account before activating the property'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_partner_before_property_activation() from public;

create trigger enforce_partner_before_property_activation
before insert or update of active, partner_id on public.properties
for each row execute function public.enforce_partner_before_property_activation();

create or replace function public.claim_transactional_email_job()
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.email_outbox
  where scheduled_at <= now()
    and attempts < 3
    and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '15 minutes')
    )
  order by scheduled_at, created_at
  for update skip locked
  limit 1;

  if v_job_id is null then return; end if;

  return query
  update public.email_outbox
  set status = 'processing', attempts = attempts + 1,
      last_error = null, updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_transactional_email_job() from public;
grant execute on function public.claim_transactional_email_job() to service_role;


-- Partner-team hotel-management bootstrap parity.

-- Mirrored from migrations/202608130045_synxis_property_onboarding_requests.sql.
begin;

create table if not exists public.property_synxis_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  synxis_hotel_id text not null check (
    length(trim(synxis_hotel_id)) between 1 and 120
    and synxis_hotel_id ~ '^[A-Za-z0-9._:/-]+$'
  ),
  requester_role text not null check (requester_role in (
    'hotel_owner', 'general_manager', 'revenue_manager', 'sales_manager'
  )),
  hotel_authorized boolean not null check (hotel_authorized),
  connection_status text not null default 'vendor_approval_pending' check (connection_status in (
    'vendor_approval_pending', 'mapping_pending', 'certification_pending',
    'ready', 'disabled'
  )),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

comment on table public.property_synxis_onboarding_requests is
  'Non-secret, per-property requests to onboard an authorized hotel to Sabre SynXis CRS. Credentials are prohibited.';
comment on column public.property_synxis_onboarding_requests.requester_role is
  'Hotel representative role declared by the authenticated partner account; this is not delegated account authorization.';

create index if not exists property_synxis_onboarding_status_idx
  on public.property_synxis_onboarding_requests (connection_status, updated_at desc);

alter table public.property_synxis_onboarding_requests enable row level security;

drop policy if exists "Partners view own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners view own SynXis requests"
  on public.property_synxis_onboarding_requests for select to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = property_synxis_onboarding_requests.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners create own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners create own SynXis requests"
  on public.property_synxis_onboarding_requests for insert to authenticated
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Partners update pending SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners update pending SynXis requests"
  on public.property_synxis_onboarding_requests for update to authenticated
  using (
    connection_status = 'vendor_approval_pending'
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  )
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Admins manage SynXis property requests" on public.property_synxis_onboarding_requests;
create policy "Admins manage SynXis property requests"
  on public.property_synxis_onboarding_requests for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.property_synxis_onboarding_requests from anon;
grant select, insert, update on table public.property_synxis_onboarding_requests to authenticated;

commit;

-- Mirrored from migrations/202608130046_partner_team_integration_access.sql.
begin;

create table if not exists public.partner_team_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in (
    'general_manager', 'revenue_manager', 'sales_manager'
  )),
  status text not null default 'active' check (status in ('active', 'disabled')),
  can_manage_integrations boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, user_id)
);

comment on table public.partner_team_members is
  'Admin-provisioned partner-team RBAC. Phase 46 adds no invitation or automatic activation path.';
comment on column public.partner_team_members.can_manage_integrations is
  'Allows non-secret PMS/CRS declaration work only; never grants admin certification or live-traffic controls.';

create index if not exists partner_team_members_user_access_idx
  on public.partner_team_members (user_id, status, can_manage_integrations);

alter table public.partner_team_members enable row level security;

drop policy if exists "Team members view own access" on public.partner_team_members;
create policy "Team members view own access"
  on public.partner_team_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Partner owners view team access" on public.partner_team_members;
create policy "Partner owners view team access"
  on public.partner_team_members for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_members.partner_id
      and partners.owner_id = auth.uid()
  ));

drop policy if exists "Admins manage partner team access" on public.partner_team_members;
create policy "Admins manage partner team access"
  on public.partner_team_members for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_members from anon;
grant select, insert, update, delete on table public.partner_team_members to authenticated;

create or replace function public.can_manage_partner_integrations(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partners
    where partners.id = p_partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ) or exists (
    select 1
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.partner_id = p_partner_id
      and partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_integrations
      and partners.status = 'approved'
      and profiles.role = 'partner'
  );
$$;

create or replace function public.resolve_partner_integration_access()
returns table (resolved_partner_id uuid, access_role text)
language sql
stable
security definer
set search_path = public
as $$
  select candidate.partner_id, candidate.access_role
  from (
    select partners.id as partner_id, 'owner'::text as access_role, 0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select partner_team_members.partner_id,
      partner_team_members.member_role as access_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_integrations
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ) as candidate
  order by candidate.priority, candidate.partner_id
  limit 1;
$$;

revoke all on function public.can_manage_partner_integrations(uuid)
  from public, anon, service_role;
grant execute on function public.can_manage_partner_integrations(uuid) to authenticated;
revoke all on function public.resolve_partner_integration_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_integration_access() to authenticated;

drop policy if exists "Partner integration managers view properties" on public.properties;
create policy "Partner integration managers view properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_integrations(partner_id));

drop policy if exists "Partners view own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers view SynXis requests"
  on public.property_synxis_onboarding_requests for select to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = property_synxis_onboarding_requests.property_id
      and public.can_manage_partner_integrations(properties.partner_id)
  ));

drop policy if exists "Partners create own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers create SynXis requests"
  on public.property_synxis_onboarding_requests for insert to authenticated
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  );

drop policy if exists "Partners update pending SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers update pending SynXis requests"
  on public.property_synxis_onboarding_requests for update to authenticated
  using (
    connection_status = 'vendor_approval_pending'
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  )
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  );

commit;

-- Mirrored from migrations/202608130047_partner_team_invitations.sql.
begin;

create table if not exists public.partner_team_invitations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null check (
    email = lower(trim(email))
    and length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  member_role text not null check (member_role in (
    'general_manager', 'revenue_manager', 'sales_manager'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'revoked', 'expired'
  )),
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

comment on table public.partner_team_invitations is
  'Email-bound partner-team invitations. No bearer token or credential is stored; acceptance requires a matching authenticated email.';

create unique index if not exists partner_team_invitations_pending_email_idx
  on public.partner_team_invitations (partner_id, email)
  where status = 'pending';
create index if not exists partner_team_invitations_expiry_idx
  on public.partner_team_invitations (status, expires_at);

alter table public.partner_team_invitations enable row level security;

drop policy if exists "Partner owners view team invitations" on public.partner_team_invitations;
create policy "Partner owners view team invitations"
  on public.partner_team_invitations for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_invitations.partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partner owners create team invitations" on public.partner_team_invitations;
create policy "Partner owners create team invitations"
  on public.partner_team_invitations for insert to authenticated
  with check (
    status = 'pending'
    and created_by = auth.uid()
    and accepted_by is null
    and accepted_at is null
    and expires_at > now()
    and expires_at <= now() + interval '8 days'
    and exists (
      select 1 from public.partners
      where partners.id = partner_team_invitations.partner_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Admins manage team invitations" on public.partner_team_invitations;
create policy "Admins manage team invitations"
  on public.partner_team_invitations for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_invitations from anon;
grant select, insert on table public.partner_team_invitations to authenticated;

create or replace function public.expire_own_partner_team_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.partner_team_invitations
  set status = 'expired', updated_at = now()
  where status = 'pending'
    and expires_at <= now()
    and exists (
      select 1 from public.partners
      where partners.id = partner_team_invitations.partner_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select *
  into v_invitation
  from public.partner_team_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations
    set status = 'expired', updated_at = now()
    where id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners
    where id = v_invitation.partner_id and status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles
  set role = 'partner'::public.user_role
  where id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      updated_at = now();

  update public.partner_team_invitations
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;
revoke all on function public.expire_own_partner_team_invitations()
  from public, anon, service_role;
grant execute on function public.expire_own_partner_team_invitations() to authenticated;

commit;

-- Mirrored from migrations/202608130048_partner_team_access_lifecycle.sql.
begin;

create table if not exists public.partner_team_access_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  event_type text not null check (event_type in (
    'invitation_revoked', 'member_disabled'
  )),
  invitation_id uuid references public.partner_team_invitations(id) on delete restrict,
  member_id uuid references public.partner_team_members(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'invitation_revoked' and invitation_id is not null and member_id is null)
    or (event_type = 'member_disabled' and member_id is not null and invitation_id is null)
  )
);

comment on table public.partner_team_access_events is
  'Immutable owner/admin audit events for partner integration-access revocation.';

create index if not exists partner_team_access_events_partner_idx
  on public.partner_team_access_events (partner_id, created_at desc);

alter table public.partner_team_access_events enable row level security;

drop policy if exists "Partner owners view access events" on public.partner_team_access_events;
create policy "Partner owners view access events"
  on public.partner_team_access_events for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_access_events.partner_id
      and partners.owner_id = auth.uid()
  ));

drop policy if exists "Admins view access events" on public.partner_team_access_events;
create policy "Admins view access events"
  on public.partner_team_access_events for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_access_events from anon, authenticated;
grant select on table public.partner_team_access_events to authenticated;

create or replace function public.list_own_partner_team_members()
returns table (
  member_id uuid,
  member_email text,
  member_role text,
  member_status text,
  can_manage_integrations boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    partner_team_members.id,
    lower(coalesce(auth.users.email, '')),
    partner_team_members.member_role,
    partner_team_members.status,
    partner_team_members.can_manage_integrations,
    partner_team_members.updated_at
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  join auth.users on auth.users.id = partner_team_members.user_id
  where partners.owner_id = auth.uid()
    and partners.status = 'approved'
  order by partner_team_members.updated_at desc, partner_team_members.id;
$$;

create or replace function public.revoke_own_partner_team_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_invitations.partner_id
  into v_partner_id
  from public.partner_team_invitations
  join public.partners on partners.id = partner_team_invitations.partner_id
  where partner_team_invitations.id = p_invitation_id
    and partner_team_invitations.status = 'pending'
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_invitations;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_invitations
  set status = 'revoked', updated_at = now()
  where id = p_invitation_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, invitation_id, actor_id
  ) values (
    v_partner_id, 'invitation_revoked', p_invitation_id, auth.uid()
  );
  return true;
end;
$$;

create or replace function public.disable_own_partner_team_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_members.partner_id
  into v_partner_id
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  where partner_team_members.id = p_member_id
    and partner_team_members.status = 'active'
    and partner_team_members.can_manage_integrations
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_members;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_members
  set status = 'disabled',
      can_manage_integrations = false,
      updated_at = now()
  where id = p_member_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, member_id, actor_id
  ) values (
    v_partner_id, 'member_disabled', p_member_id, auth.uid()
  );
  return true;
end;
$$;

revoke all on function public.list_own_partner_team_members()
  from public, anon, service_role;
grant execute on function public.list_own_partner_team_members() to authenticated;
revoke all on function public.revoke_own_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.revoke_own_partner_team_invitation(uuid) to authenticated;
revoke all on function public.disable_own_partner_team_member(uuid)
  from public, anon, service_role;
grant execute on function public.disable_own_partner_team_member(uuid) to authenticated;

commit;

-- Mirrored from migrations/202608130049_fix_partner_team_invitation_acceptance.sql.
begin;

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select invitation.*
  into v_invitation
  from public.partner_team_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations as invitation
    set status = 'expired', updated_at = now()
    where invitation.id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners as partner
    where partner.id = v_invitation.partner_id and partner.status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles as profile
  set role = 'partner'::public.user_role
  where profile.id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      updated_at = now();

  update public.partner_team_invitations as invitation
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where invitation.id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;

commit;

-- Mirrored from migrations/202608150054_partner_team_hotel_management.sql.
begin;

alter table public.partner_team_members
  add column if not exists can_manage_hotels boolean not null default false;

comment on column public.partner_team_members.can_manage_hotels is
  'Allows approved partner-team members to manage draft properties, rooms, rates, and future inventory. It never grants publication, billing, payout, invitation, or live-traffic controls.';

update public.partner_team_members
set can_manage_hotels = true,
    updated_at = now()
where status = 'active'
  and member_role in ('general_manager', 'revenue_manager', 'sales_manager');

create or replace function public.can_manage_partner_hotels(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.partners
    where partners.id = p_partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ) or exists (
    select 1
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.partner_id = p_partner_id
      and partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  );
$$;

create or replace function public.resolve_partner_hotel_access()
returns table (resolved_partner_id uuid, access_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.partner_id, candidate.access_role
  from (
    select partners.id as partner_id, 'owner'::text as access_role, 0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select partner_team_members.partner_id,
      partner_team_members.member_role as access_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ) as candidate
  order by candidate.priority, candidate.partner_id
  limit 1;
$$;

revoke all on function public.can_manage_partner_hotels(uuid)
  from public, anon, service_role;
grant execute on function public.can_manage_partner_hotels(uuid) to authenticated;
revoke all on function public.resolve_partner_hotel_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_hotel_access() to authenticated;

drop policy if exists "Partners can view own properties" on public.properties;
drop policy if exists "Partner integration managers view properties" on public.properties;
drop policy if exists "Hotel managers view partner properties" on public.properties;
create policy "Hotel managers view partner properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_hotels(partner_id));

drop policy if exists "Partners can update own properties" on public.properties;
drop policy if exists "Hotel managers update partner properties" on public.properties;
create policy "Hotel managers update partner properties"
  on public.properties for update to authenticated
  using (public.can_manage_partner_hotels(partner_id))
  with check (
    active = false
    and public.can_manage_partner_hotels(partner_id)
  );

drop policy if exists "Partners can manage own rooms" on public.rooms;
drop policy if exists "Hotel managers view partner rooms" on public.rooms;
drop policy if exists "Hotel managers create partner rooms" on public.rooms;
drop policy if exists "Hotel managers update partner rooms" on public.rooms;
create policy "Hotel managers view partner rooms"
  on public.rooms for select to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers create partner rooms"
  on public.rooms for insert to authenticated
  with check (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers update partner rooms"
  on public.rooms for update to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ))
  with check (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));

drop policy if exists "Partners can manage own inventory" on public.inventory;
drop policy if exists "Hotel managers view partner inventory" on public.inventory;
drop policy if exists "Hotel managers create partner inventory" on public.inventory;
drop policy if exists "Hotel managers update partner inventory" on public.inventory;
create policy "Hotel managers view partner inventory"
  on public.inventory for select to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    where rooms.id = inventory.room_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers create partner inventory"
  on public.inventory for insert to authenticated
  with check (
    inventory.stay_date >= current_date
    and exists (
      select 1
      from public.rooms
      join public.properties on properties.id = rooms.property_id
      where rooms.id = inventory.room_id
        and public.can_manage_partner_hotels(properties.partner_id)
    )
  );
create policy "Hotel managers update partner inventory"
  on public.inventory for update to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    where rooms.id = inventory.room_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ))
  with check (
    inventory.stay_date >= current_date
    and exists (
      select 1
      from public.rooms
      join public.properties on properties.id = rooms.property_id
      where rooms.id = inventory.room_id
        and public.can_manage_partner_hotels(properties.partner_id)
    )
  );

create or replace function public.enforce_hotel_manager_property_partner_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.partner_id is distinct from old.partner_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer properties between partners'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_property_partner_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_property_partner_immutability
  on public.properties;
create trigger enforce_hotel_manager_property_partner_immutability
before update of partner_id on public.properties
for each row execute function public.enforce_hotel_manager_property_partner_immutability();

create or replace function public.enforce_disabled_team_member_capabilities()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'disabled' then
    new.can_manage_integrations := false;
    new.can_manage_hotels := false;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_disabled_team_member_capabilities()
  from public, anon, authenticated;
drop trigger if exists enforce_disabled_team_member_capabilities
  on public.partner_team_members;
create trigger enforce_disabled_team_member_capabilities
before insert or update of status on public.partner_team_members
for each row execute function public.enforce_disabled_team_member_capabilities();

drop function if exists public.list_own_partner_team_members();
create function public.list_own_partner_team_members()
returns table (
  member_id uuid,
  member_email text,
  member_role text,
  member_status text,
  can_manage_integrations boolean,
  can_manage_hotels boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    partner_team_members.id,
    lower(coalesce(auth.users.email, '')),
    partner_team_members.member_role,
    partner_team_members.status,
    partner_team_members.can_manage_integrations,
    partner_team_members.can_manage_hotels,
    partner_team_members.updated_at
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  join auth.users on auth.users.id = partner_team_members.user_id
  where partners.owner_id = auth.uid()
    and partners.status = 'approved'
  order by partner_team_members.updated_at desc, partner_team_members.id;
$$;

revoke all on function public.list_own_partner_team_members()
  from public, anon, service_role;
grant execute on function public.list_own_partner_team_members() to authenticated;

create or replace function public.disable_own_partner_team_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_members.partner_id
  into v_partner_id
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  where partner_team_members.id = p_member_id
    and partner_team_members.status = 'active'
    and (
      partner_team_members.can_manage_integrations
      or partner_team_members.can_manage_hotels
    )
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_members;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_members
  set status = 'disabled',
      can_manage_integrations = false,
      can_manage_hotels = false,
      updated_at = now()
  where id = p_member_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, member_id, actor_id
  ) values (
    v_partner_id, 'member_disabled', p_member_id, auth.uid()
  );
  return true;
end;
$$;

revoke all on function public.disable_own_partner_team_member(uuid)
  from public, anon, service_role;
grant execute on function public.disable_own_partner_team_member(uuid) to authenticated;

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select invitation.*
  into v_invitation
  from public.partner_team_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations as invitation
    set status = 'expired', updated_at = now()
    where invitation.id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners as partner
    where partner.id = v_invitation.partner_id and partner.status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles as profile
  set role = 'partner'::public.user_role
  where profile.id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, can_manage_hotels, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, true, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      can_manage_hotels = true,
      updated_at = now();

  update public.partner_team_invitations as invitation
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where invitation.id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;

comment on table public.partner_team_access_events is
  'Immutable owner/admin audit events for partner team-access revocation.';

commit;

-- Mirrored from migrations/202608150055_partner_hotel_access_selection.sql.
begin;

drop function if exists public.resolve_partner_hotel_access();
create function public.resolve_partner_hotel_access()
returns table (
  resolved_partner_id uuid,
  partner_name text,
  access_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate as (
    select
      partners.id as partner_id,
      partners.business_name as partner_name,
      'owner'::text as access_role,
      0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select
      partner_team_members.partner_id,
      partners.business_name,
      partner_team_members.member_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ), ranked as (
    select candidate.*,
      row_number() over (
        partition by candidate.partner_id
        order by candidate.priority
      ) as partner_rank
    from candidate
  )
  select ranked.partner_id, ranked.partner_name, ranked.access_role
  from ranked
  where ranked.partner_rank = 1
  order by lower(ranked.partner_name), ranked.partner_id;
$$;

revoke all on function public.resolve_partner_hotel_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_hotel_access() to authenticated;

drop policy if exists "Partner integration managers view properties"
  on public.properties;
create policy "Partner integration managers view properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_integrations(partner_id));

commit;

-- Mirrored from migrations/202608150056_hotel_manager_write_guards.sql.
begin;

create or replace function public.enforce_delegated_hotel_manager_property_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.partners
      where partners.id = old.partner_id
        and partners.owner_id = auth.uid()
    )
  then
    return new;
  end if;

  if public.can_manage_partner_hotels(old.partner_id)
    and (
      to_jsonb(new) - 'description' - 'image_url' - 'amenities' - 'active'
    ) is distinct from (
      to_jsonb(old) - 'description' - 'image_url' - 'amenities' - 'active'
    )
  then
    raise exception 'Hotel managers may update only approved draft property content fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_delegated_hotel_manager_property_fields()
  from public, anon, authenticated;
drop trigger if exists enforce_delegated_hotel_manager_property_fields
  on public.properties;
create trigger enforce_delegated_hotel_manager_property_fields
before update on public.properties
for each row execute function public.enforce_delegated_hotel_manager_property_fields();

create or replace function public.enforce_hotel_manager_room_property_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.property_id is distinct from old.property_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer rooms between properties'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_room_property_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_room_property_immutability
  on public.rooms;
create trigger enforce_hotel_manager_room_property_immutability
before update of property_id on public.rooms
for each row execute function public.enforce_hotel_manager_room_property_immutability();

commit;

-- Mirrored from migrations/202608150057_hotel_manager_inventory_guard.sql.
begin;

create or replace function public.enforce_hotel_manager_inventory_room_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer inventory between rooms'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_inventory_room_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_inventory_room_immutability
  on public.inventory;
create trigger enforce_hotel_manager_inventory_room_immutability
before update of room_id on public.inventory
for each row execute function public.enforce_hotel_manager_inventory_room_immutability();

commit;

-- Mirrored from migrations/202608150058_hotel_manager_inventory_stay_date_guard.sql.
begin;

create or replace function public.enforce_hotel_manager_inventory_room_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.room_id is distinct from old.room_id
    or new.stay_date is distinct from old.stay_date
  )
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot change inventory room or stay date'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_inventory_room_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_inventory_room_immutability
  on public.inventory;
create trigger enforce_hotel_manager_inventory_room_immutability
before update of room_id, stay_date on public.inventory
for each row execute function public.enforce_hotel_manager_inventory_room_immutability();

commit;

-- Mirrored from migrations/202608150059_legacy_hotel_manager_consent.sql.
begin;

alter table public.partner_team_invitations
  add column if not exists can_manage_hotels boolean not null default false;

comment on column public.partner_team_invitations.can_manage_hotels is
  'Records whether the invitation disclosed and grants scoped draft-property, room, rate, and future-inventory access.';

-- Migration 054 temporarily enabled hotel management for memberships that had
-- accepted an integration-scoped invitation. Require a newly disclosed
-- invitation before restoring the expanded capability.
update public.partner_team_members
set can_manage_hotels = false,
    updated_at = now()
where status = 'active'
  and can_manage_hotels
  and member_role in ('general_manager', 'revenue_manager', 'sales_manager');

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select invitation.*
  into v_invitation
  from public.partner_team_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations as invitation
    set status = 'expired', updated_at = now()
    where invitation.id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners as partner
    where partner.id = v_invitation.partner_id and partner.status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles as profile
  set role = 'partner'::public.user_role
  where profile.id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, can_manage_hotels, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, v_invitation.can_manage_hotels, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      can_manage_hotels = excluded.can_manage_hotels,
      updated_at = now();

  update public.partner_team_invitations as invitation
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where invitation.id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;

commit;

-- Mirrored from migrations/202608150060_delegated_property_publication_guard.sql.
begin;

create or replace function public.enforce_delegated_hotel_manager_property_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.partners
      where partners.id = old.partner_id
        and partners.owner_id = auth.uid()
    )
  then
    return new;
  end if;

  if public.can_manage_partner_hotels(old.partner_id) then
    if old.active then
      raise exception 'Hotel managers may edit only properties that are already inactive'
        using errcode = '42501';
    end if;

    if new.active is distinct from old.active then
      raise exception 'Hotel managers cannot change property publication state'
        using errcode = '42501';
    end if;

    if (
      to_jsonb(new) - 'description' - 'image_url' - 'amenities'
    ) is distinct from (
      to_jsonb(old) - 'description' - 'image_url' - 'amenities'
    ) then
      raise exception 'Hotel managers may update only approved draft property content fields'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_delegated_hotel_manager_property_fields()
  from public, anon, authenticated;
drop trigger if exists enforce_delegated_hotel_manager_property_fields
  on public.properties;
create trigger enforce_delegated_hotel_manager_property_fields
before update on public.properties
for each row execute function public.enforce_delegated_hotel_manager_property_fields();

commit;

-- Mirrored from migrations/202608150061_partner_owner_delete_policies.sql.
begin;

drop policy if exists "Partner owners delete own rooms" on public.rooms;
create policy "Partner owners delete own rooms"
  on public.rooms for delete to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = rooms.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partner owners delete own inventory" on public.inventory;
create policy "Partner owners delete own inventory"
  on public.inventory for delete to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = inventory.room_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

commit;


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_phone is not null and char_length(trim(p_phone)) > 30 then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      phone = nullif(trim(p_phone), '')
  where id = auth.uid()
  returning * into v_profile;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('full_name', v_profile.full_name, 'phone', v_profile.phone);
end;
$$;

create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text
)
returns partner_applications
language plpgsql
security definer set search_path = public
as $$
declare
  v_application partner_applications;
  v_user_id uuid;
  v_partner_id uuid;
  v_property_id uuid;
  v_slug_base text;
  v_slug text;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'declined') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;

  select * into v_application from partner_applications
    where id = p_application_id for update;
  if not found then
    raise exception 'Partner application not found' using errcode = 'P0002';
  end if;
  if v_application.status = 'approved' and p_status <> 'approved' then
    raise exception 'Approved partner access must be managed separately' using errcode = 'P0001';
  end if;

  if p_status = 'approved' then
    if v_application.star_rating not in (4, 5)
      or v_application.contact_role is null
      or v_application.phone is null
      or v_application.website_url is null
      or v_application.address_line1 is null
      or v_application.city is null
      or v_application.postal_code is null
      or v_application.country is null
      or v_application.description is null
      or coalesce(cardinality(v_application.amenities), 0) = 0
      or v_application.photo_source_url is null
      or not v_application.hotel_authorized
      or not v_application.content_rights_confirmed
      or not v_application.information_accurate
    then
      raise exception 'Complete and verify the hotel intake before approval' using errcode = '22023';
    end if;

    select id into v_user_id from auth.users
      where lower(email) = lower(v_application.email)
      order by created_at limit 1;
    if v_user_id is null then
      raise exception 'Applicant must register with the application email before approval' using errcode = 'P0002';
    end if;
    update profiles
      set role = case when role = 'admin' then role else 'partner'::user_role end
      where id = v_user_id;
    if not found then
      raise exception 'The registered applicant profile could not be found' using errcode = 'P0002';
    end if;
    insert into partners (owner_id, business_name, status)
      values (v_user_id, v_application.property_name, 'approved')
      on conflict (owner_id) do update
        set business_name = excluded.business_name, status = 'approved'
      returning id into v_partner_id;

    if v_application.property_id is null then
      v_slug_base := trim(both '-' from regexp_replace(
        lower(v_application.property_name), '[^a-z0-9]+', '-', 'g'
      ));
      if v_slug_base = '' then v_slug_base := 'hotel'; end if;
      v_slug := v_slug_base;
      if exists (select 1 from properties where slug = v_slug) then
        v_slug := v_slug_base || '-' || substring(v_application.id::text, 1, 8);
      end if;

      insert into properties (
        partner_id, name, slug, type, star_rating, description, amenities,
        city, region, country, active
      ) values (
        v_partner_id, v_application.property_name, v_slug,
        v_application.property_type, v_application.star_rating,
        v_application.description, v_application.amenities,
        v_application.city, v_application.region, v_application.country, false
      ) returning id into v_property_id;

      update partner_applications set property_id = v_property_id
        where id = p_application_id;
    end if;
  end if;

  update partner_applications set status = p_status
    where id = p_application_id returning * into v_application;
  return v_application;
end;
$$;

create or replace function public.record_booking_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into booking_status_history (booking_id, status, actor_id, note)
    values (new.id, new.status, auth.uid(), new.cancellation_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists on_booking_status_changed on bookings;
create trigger on_booking_status_changed
  after insert or update of status on bookings
  for each row execute procedure public.record_booking_status();

create or replace function public.review_revenue_recommendation(p_recommendation_id uuid, p_decision text)
returns revenue_recommendations
language plpgsql
security definer set search_path = public
as $$
declare
  v_recommendation revenue_recommendations;
  v_authorized boolean;
  v_status text;
begin
  select * into v_recommendation from revenue_recommendations where id = p_recommendation_id for update;
  if not found then raise exception 'Recommendation not found'; end if;
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
    union all
    select 1 from properties p join partners pa on pa.id = p.partner_id
      where p.id = v_recommendation.property_id and pa.owner_id = auth.uid() and pa.status = 'approved'
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_recommendation.status <> 'pending' then raise exception 'Recommendation already reviewed'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  v_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if v_status = 'approved' then
    update inventory set rate = v_recommendation.recommended_rate
      where room_id = v_recommendation.room_id and stay_date = v_recommendation.stay_date;
  end if;
  update revenue_recommendations set status = v_status, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_recommendation_id returning * into v_recommendation;
  insert into revenue_audit_log (property_id, recommendation_id, actor_id, action, details)
    values (
      v_recommendation.property_id, v_recommendation.id, auth.uid(),
      'recommendation_' || v_status,
      jsonb_build_object('stay_date', v_recommendation.stay_date, 'old_rate', v_recommendation.current_rate,
        'recommended_rate', v_recommendation.recommended_rate, 'inventory_updated', v_status = 'approved')
    );
  return v_recommendation;
end;
$$;

create or replace function public.review_booking(p_booking_id uuid, p_decision text, p_reason text default null)
returns bookings
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking bookings;
  v_authorized boolean;
  v_expected integer;
  v_available integer;
  v_tier text;
  v_points integer;
  v_partner_id uuid;
  v_commission numeric(12,2);
begin
  select b.* into v_booking from bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
    union all
    select 1 from properties p join partners pa on pa.id = p.partner_id
      where p.id = v_booking.property_id and pa.owner_id = auth.uid() and pa.status = 'approved'
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_booking.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;

  if p_decision = 'approve' then
    if v_booking.check_in <= current_date then
      update bookings
        set status = 'cancelled',
            cancellation_reason = 'Booking request expired before partner approval',
            updated_at = now()
        where id = p_booking_id
        returning * into v_booking;
      insert into notifications (user_id, title, body) values (
        v_booking.customer_id, 'Booking request expired',
        'Your iRatePilot request ' || v_booking.confirmation_code || ' expired because check-in began before the property approved it. No payment was collected.'
      );
      return v_booking;
    end if;
    v_expected := v_booking.check_out - v_booking.check_in;
    perform 1 from inventory
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out
      for update;
    select count(*) into v_available from inventory
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out
        and available_units > 0;
    if v_available <> v_expected then raise exception 'Inventory is no longer available'; end if;
    update inventory set available_units = available_units - 1
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out;
    update bookings set status = 'confirmed', cancellation_reason = null, updated_at = now()
      where id = p_booking_id returning * into v_booking;
    select case when membership_status = 'active' then membership_tier else 'none' end
      into v_tier from profiles where id = v_booking.customer_id;
    v_points := case when v_tier = 'business' then floor(v_booking.subtotal)::integer * 2
                     when v_tier = 'basic' then floor(v_booking.subtotal)::integer
                     else 0 end;
    if v_points > 0 then
      insert into reward_ledger (user_id, booking_id, points, description)
      values (v_booking.customer_id, v_booking.id, v_points, 'Points earned for ' || v_booking.confirmation_code);
      update profiles set reward_points = reward_points + v_points where id = v_booking.customer_id;
    end if;
    select partner_id into v_partner_id from properties where id = v_booking.property_id;
    v_commission := round(v_booking.subtotal * 0.14, 2);
    insert into booking_financials (
      booking_id, partner_id, gross_room_revenue, partner_commission, partner_net, status
    ) values (
      v_booking.id, v_partner_id, v_booking.subtotal, v_commission,
      v_booking.subtotal - v_commission, 'awaiting_payment'
    ) on conflict (booking_id) do nothing;
    insert into notifications (user_id, title, body) values (
      v_booking.customer_id, 'Booking request approved',
      'Your iRatePilot request ' || v_booking.confirmation_code || ' has been approved. No payment has been collected.'
    );
  elsif p_decision = 'reject' then
    update bookings set status = 'cancelled', cancellation_reason = coalesce(nullif(p_reason,''), 'Property declined the request'), updated_at = now()
      where id = p_booking_id returning * into v_booking;
    insert into notifications (user_id, title, body) values (
      v_booking.customer_id, 'Booking request declined',
      'Your iRatePilot request ' || v_booking.confirmation_code || ' was declined. No payment was collected.'
    );
  else
    raise exception 'Invalid review decision';
  end if;
  return v_booking;
end;
$$;

create or replace function public.cancel_pending_booking(p_booking_id uuid, p_reason text default null)
returns bookings
language plpgsql
security definer set search_path = public
as $$
declare v_booking bookings;
begin
  select * into v_booking from bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status <> 'pending' then raise exception 'Only pending requests can be cancelled online'; end if;
  update bookings set status = 'cancelled', cancellation_reason = coalesce(nullif(p_reason,''), 'Cancelled by traveler'), updated_at = now()
    where id = p_booking_id returning * into v_booking;
  insert into notifications (user_id, title, body) values (
    v_booking.customer_id, 'Booking request cancelled',
    'Your pending iRatePilot request ' || v_booking.confirmation_code || ' was cancelled.'
  );
  return v_booking;
end;
$$;

create or replace function public.complete_approved_booking_test_payment(
  p_booking_id uuid,
  p_customer_id uuid,
  p_payment_intent_id text,
  p_amount_total_cents integer
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare v_booking public.bookings;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_' then raise exception 'Invalid payment reference'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.customer_id <> p_customer_id then raise exception 'Booking not found'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'Only confirmed reservations can be paid'; end if;
  if round(v_booking.total * 100)::integer <> p_amount_total_cents then raise exception 'Payment amount does not match the reservation total'; end if;
  if v_booking.stripe_payment_intent_id is not null then
    if v_booking.stripe_payment_intent_id = p_payment_intent_id then return v_booking; end if;
    raise exception 'This reservation already has a different payment';
  end if;
  update public.bookings set stripe_payment_intent_id = p_payment_intent_id, updated_at = now()
    where id = p_booking_id returning * into v_booking;
  update public.booking_financials set status = 'eligible'
    where booking_id = p_booking_id and status = 'awaiting_payment';
  insert into public.notifications (user_id, title, body) values (
    v_booking.customer_id,
    'Test payment received',
    'Your Stripe test payment for ' || v_booking.confirmation_code || ' was recorded. No live card charge was created.'
  );
  return v_booking;
end;
$$;

revoke all on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer) to service_role;

revoke all on function public.review_revenue_recommendation(uuid, text) from public;
grant execute on function public.review_revenue_recommendation(uuid, text) to authenticated;
revoke all on function public.review_partner_application(uuid, text)
  from public, anon, service_role;
grant execute on function public.review_partner_application(uuid, text) to authenticated;
revoke all on function public.review_booking(uuid, text, text) from public;
grant execute on function public.review_booking(uuid, text, text) to authenticated;
revoke all on function public.cancel_pending_booking(uuid, text) from public;
grant execute on function public.cancel_pending_booking(uuid, text) to authenticated;
revoke all on function public.update_own_profile(text, text) from public;
grant execute on function public.update_own_profile(text, text) to authenticated;

-- Commercial launch email reliability (migration 050).
alter table public.email_outbox drop constraint if exists email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check (status in ('pending','processing','sent','failed','suppressed','dead_letter'));
alter table public.email_outbox
  add column if not exists delivery_status text
    check (delivery_status is null or delivery_status in ('sent','delivered','delayed','bounced','complained','failed','suppressed')),
  add column if not exists delivery_event_at timestamptz,
  add column if not exists delivery_detail text;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  webhook_event_id text not null unique,
  resend_email_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'processing' check (processing_status in ('processing','processed','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  occurred_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_delivery_events_message_idx on public.email_delivery_events (resend_email_id, occurred_at desc);

create table if not exists public.email_suppressions (
  recipient_email text primary key check (recipient_email = lower(trim(recipient_email))),
  reason text not null check (reason in ('bounce','complaint','suppressed','manual')),
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_delivery_events enable row level security;
alter table public.email_suppressions enable row level security;
revoke all on public.email_delivery_events, public.email_suppressions from anon, authenticated;
grant all on public.email_delivery_events, public.email_suppressions to service_role;

create or replace function public.claim_transactional_email_job()
returns setof public.email_outbox
language plpgsql security definer set search_path = ''
as $$
declare v_job_id uuid;
begin
  select id into v_job_id from public.email_outbox
  where scheduled_at <= now() and attempts < 5
    and (status in ('pending','failed') or (status = 'processing' and updated_at < now() - interval '15 minutes'))
  order by scheduled_at, created_at for update skip locked limit 1;
  if v_job_id is null then return; end if;
  return query update public.email_outbox
    set status = 'processing', attempts = attempts + 1, last_error = null, updated_at = now()
    where id = v_job_id returning *;
end;
$$;
revoke all on function public.claim_transactional_email_job() from public;
grant execute on function public.claim_transactional_email_job() to service_role;

-- Mirrored from migrations/202608230068_flight_commerce_foundation.sql.
begin;

-- Flight commerce records intentionally persist only operational identifiers,
-- cryptographic digests, encrypted provider references, and sanitized itinerary evidence.
-- Raw passenger PII, identity documents, payment-card data, credentials, provider
-- payloads, and arbitrary JSON belong outside these relations.

do $flight_digest_prerequisite$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight commerce requires the reviewed extensions.digest(bytea,text) SHA-256 prerequisite';
  end if;
end;
$flight_digest_prerequisite$;

create table public.flight_runtime_controls (
  control_key text primary key check (control_key = 'global'),
  execution_kill_switch_engaged boolean not null default true,
  synthetic_execution_enabled boolean not null default false,
  provider_sandbox_traffic_enabled boolean not null default false,
  provider_live_traffic_enabled boolean not null default false,
  shopping_enabled boolean not null default false,
  order_enabled boolean not null default false,
  payment_enabled boolean not null default false,
  ticketing_enabled boolean not null default false,
  servicing_enabled boolean not null default false,
  provider_events_enabled boolean not null default false,
  production_release_enabled boolean not null default false,
  bound_environment text check (
    bound_environment is null or bound_environment in ('local', 'test', 'preview', 'production')
  ),
  bound_project_ref text check (
    bound_project_ref is null or bound_project_ref ~ '^[A-Za-z0-9_-]{3,64}$'
  ),
  bound_database_name text check (
    bound_database_name is null or bound_database_name ~ '^[A-Za-z0-9_-]{1,63}$'
  ),
  bound_session_user text check (
    bound_session_user is null or bound_session_user ~ '^[A-Za-z_][A-Za-z0-9_-]{0,62}$'
  ),
  bound_provider_code text check (
    bound_provider_code is null or bound_provider_code ~ '^[a-z][a-z0-9_]{1,31}$'
  ),
  bound_provider_account_sha256 text check (
    bound_provider_account_sha256 is null
    or bound_provider_account_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_point_of_sale text check (
    bound_point_of_sale is null or bound_point_of_sale ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  ),
  bound_content_scope_sha256 text check (
    bound_content_scope_sha256 is null
    or bound_content_scope_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_adapter_version_sha256 text check (
    bound_adapter_version_sha256 is null
    or bound_adapter_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_processor_code text check (
    bound_payment_processor_code is null
    or bound_payment_processor_code ~ '^[a-z][a-z0-9_]{1,31}$'
  ),
  bound_payment_account_sha256 text check (
    bound_payment_account_sha256 is null
    or bound_payment_account_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_environment text check (
    bound_payment_environment is null or bound_payment_environment in ('test', 'live')
  ),
  bound_payment_source_sha256 text check (
    bound_payment_source_sha256 is null
    or bound_payment_source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_adapter_version_sha256 text check (
    bound_payment_adapter_version_sha256 is null
    or bound_payment_adapter_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_execution_scope_sha256 text check (
    bound_execution_scope_sha256 is null
    or bound_execution_scope_sha256 ~ '^[0-9a-f]{64}$'
  ),
  activation_evidence_sha256 text check (
    activation_evidence_sha256 is null
    or activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint flight_runtime_controls_dependency_check check (
    (synthetic_execution_enabled::integer
      + provider_sandbox_traffic_enabled::integer
      + provider_live_traffic_enabled::integer) <= 1
    and
    (not provider_live_traffic_enabled or production_release_enabled)
    and (not production_release_enabled or bound_environment = 'production')
    and (not synthetic_execution_enabled or bound_environment in ('local', 'test'))
    and (not provider_sandbox_traffic_enabled or bound_environment in ('test', 'preview'))
    and (not shopping_enabled or (
      synthetic_execution_enabled or provider_sandbox_traffic_enabled or provider_live_traffic_enabled
    ))
    and (not order_enabled or shopping_enabled)
    and (not order_enabled or provider_sandbox_traffic_enabled or provider_live_traffic_enabled)
    and (not payment_enabled or order_enabled)
    and (not ticketing_enabled or (order_enabled and payment_enabled))
    and (not servicing_enabled or ticketing_enabled)
    and (not provider_events_enabled or shopping_enabled)
    and (
      not (provider_sandbox_traffic_enabled or provider_live_traffic_enabled)
      or (
        bound_provider_code is not null
        and bound_provider_account_sha256 is not null
        and bound_point_of_sale is not null
        and bound_content_scope_sha256 is not null
        and bound_adapter_version_sha256 is not null
      )
    )
    and (
      not payment_enabled
      or (
        bound_payment_processor_code is not null
        and bound_payment_account_sha256 is not null
        and bound_payment_environment is not null
        and bound_payment_source_sha256 is not null
        and bound_payment_adapter_version_sha256 is not null
        and (
          (provider_sandbox_traffic_enabled and bound_payment_environment = 'test')
          or (provider_live_traffic_enabled and bound_payment_environment = 'live')
        )
      )
    )
    and (
      not (
        not execution_kill_switch_engaged
        or synthetic_execution_enabled
        or provider_sandbox_traffic_enabled
        or provider_live_traffic_enabled
        or shopping_enabled
        or order_enabled
        or payment_enabled
        or ticketing_enabled
        or servicing_enabled
        or provider_events_enabled
        or production_release_enabled
      )
      or (
        activation_evidence_sha256 is not null
        and bound_environment is not null
        and bound_project_ref is not null
        and bound_database_name is not null
        and bound_session_user is not null
        and bound_execution_scope_sha256 is not null
        and updated_by is not null
      )
    )
  )
);

insert into public.flight_runtime_controls (control_key)
values ('global');

create table public.flight_runtime_control_receipts (
  id uuid primary key default gen_random_uuid(),
  control_key text not null check (control_key = 'global'),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null,
  previous_activation_evidence_sha256 text check (
    previous_activation_evidence_sha256 is null
    or previous_activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  activation_evidence_sha256 text not null check (
    activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  execution_kill_switch_engaged boolean not null,
  synthetic_execution_enabled boolean not null,
  provider_sandbox_traffic_enabled boolean not null,
  provider_live_traffic_enabled boolean not null,
  shopping_enabled boolean not null,
  order_enabled boolean not null,
  payment_enabled boolean not null,
  ticketing_enabled boolean not null,
  servicing_enabled boolean not null,
  provider_events_enabled boolean not null,
  production_release_enabled boolean not null,
  bound_environment text,
  bound_project_ref text,
  bound_database_name text,
  bound_session_user text,
  bound_provider_code text,
  bound_provider_account_sha256 text,
  bound_point_of_sale text,
  bound_content_scope_sha256 text,
  bound_adapter_version_sha256 text,
  bound_payment_processor_code text,
  bound_payment_account_sha256 text,
  bound_payment_environment text,
  bound_payment_source_sha256 text,
  bound_payment_adapter_version_sha256 text,
  bound_execution_scope_sha256 text,
  unique (control_key, activation_evidence_sha256)
);

create table public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint_sha256 text not null check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  journey_type text not null check (journey_type in ('one_way', 'round_trip')),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  cabin text not null check (cabin in ('economy', 'premium_economy', 'business', 'first')),
  adult_count smallint not null check (adult_count between 1 and 9),
  child_count smallint not null default 0 check (child_count between 0 and 8),
  infant_in_seat_count smallint not null default 0 check (infant_in_seat_count between 0 and 8),
  infant_on_lap_count smallint not null default 0 check (infant_on_lap_count between 0 and 8),
  status text not null default 'created'
    check (status in ('created', 'searching', 'complete', 'failed', 'expired')),
  provider_request_sha256 text check (
    provider_request_sha256 is null or provider_request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id),
  check (origin_iata <> destination_iata),
  check (
    (journey_type = 'one_way' and return_date is null)
    or (journey_type = 'round_trip' and return_date > departure_date)
  ),
  check (
    adult_count + child_count + infant_in_seat_count + infant_on_lap_count between 1 and 9
  ),
  check (infant_on_lap_count <= adult_count),
  check (expires_at > created_at)
);

create index flight_searches_customer_created_idx
  on public.flight_searches (customer_id, created_at desc);
create unique index flight_searches_active_fingerprint_uidx
  on public.flight_searches (
    execution_scope_sha256, execution_mode, customer_id, request_fingerprint_sha256
  )
  where status in ('created', 'searching');
create index flight_searches_status_expires_idx
  on public.flight_searches (status, expires_at);

create table public.flight_offers (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete restrict,
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_offer_ref_ciphertext text,
  provider_offer_ref_sha256 text not null check (provider_offer_ref_sha256 ~ '^[0-9a-f]{64}$'),
  provider_payload_sha256 text not null check (provider_payload_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  base_fare_cents bigint not null check (base_fare_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  validating_carrier text not null check (validating_carrier ~ '^[A-Z0-9]{2,3}$'),
  segment_count smallint not null check (segment_count between 1 and 16),
  itinerary_sha256 text not null check (itinerary_sha256 ~ '^[0-9a-f]{64}$'),
  fare_rules_sha256 text not null check (fare_rules_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'offered'
    check (status in ('offered', 'expired', 'replaced')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (execution_scope_sha256, execution_mode, provider_code, provider_offer_ref_sha256),
  unique (id, search_id),
  check (total_cents = base_fare_cents + tax_cents + fee_cents),
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    (execution_mode = 'synthetic' and provider_offer_ref_ciphertext is null)
    or (
      execution_mode in ('test', 'live')
      and provider_offer_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
    )
  ),
  check (expires_at > created_at)
);

create index flight_offers_search_status_idx
  on public.flight_offers (search_id, status, total_cents);
create index flight_offers_expiry_idx
  on public.flight_offers (expires_at) where status = 'offered';

create table public.flight_offer_segments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.flight_offers(id) on delete restrict,
  execution_mode text not null check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  segment_sequence smallint not null check (segment_sequence between 1 and 16),
  journey_direction text not null check (journey_direction in ('outbound', 'return')),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  marketing_carrier text not null check (marketing_carrier ~ '^[A-Z0-9]{2,3}$'),
  operating_carrier text not null check (operating_carrier ~ '^[A-Z0-9]{2,3}$'),
  marketing_flight_number text not null check (marketing_flight_number ~ '^[0-9]{1,4}[A-Z]?$'),
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  departure_local_date date not null,
  arrival_local_date date not null,
  cabin text not null check (cabin in ('economy', 'premium_economy', 'business', 'first')),
  booking_class text check (booking_class is null or booking_class ~ '^[A-Z0-9]{1,2}$'),
  duration_minutes integer not null check (duration_minutes between 1 and 2160),
  aircraft_code text check (aircraft_code is null or aircraft_code ~ '^[A-Z0-9]{2,4}$'),
  created_at timestamptz not null default now(),
  unique (offer_id, segment_sequence),
  check (origin_iata <> destination_iata),
  check (arrival_at > departure_at),
  check (date_trunc('minute', departure_at) = departure_at),
  check (date_trunc('minute', arrival_at) = arrival_at),
  check (arrival_at = departure_at + duration_minutes * interval '1 minute'),
  check (arrival_local_date >= departure_local_date),
  check (
    departure_local_date between
      (departure_at at time zone 'UTC')::date - 1
      and (departure_at at time zone 'UTC')::date + 1
  ),
  check (
    arrival_local_date between
      (arrival_at at time zone 'UTC')::date - 1
      and (arrival_at at time zone 'UTC')::date + 1
  )
);

create index flight_offer_segments_offer_sequence_idx
  on public.flight_offer_segments (offer_id, segment_sequence);

create table public.flight_offer_fare_terms (
  offer_id uuid primary key references public.flight_offers(id) on delete restrict,
  execution_mode text not null check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  refundable boolean not null,
  changeable boolean not null,
  change_fee_cents bigint check (change_fee_cents is null or change_fee_cents >= 0),
  cancellation_fee_cents bigint check (
    cancellation_fee_cents is null or cancellation_fee_cents >= 0
  ),
  checked_bag_pieces smallint not null default 0 check (checked_bag_pieces between 0 and 9),
  carry_on_pieces smallint not null default 0 check (carry_on_pieces between 0 and 9),
  checked_bag_weight_kg numeric(5,2) check (
    checked_bag_weight_kg is null or checked_bag_weight_kg between 0 and 99.99
  ),
  terms_summary_sha256 text not null check (terms_summary_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (changeable or change_fee_cents is null),
  check (refundable or cancellation_fee_cents is null)
);

create table public.flight_reprice_receipts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.flight_offers(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_total_cents bigint not null check (original_total_cents >= 0),
  repriced_total_cents bigint check (repriced_total_cents is null or repriced_total_cents >= 0),
  status text not null check (status in ('confirmed', 'price_changed', 'unavailable', 'failed')),
  customer_accepted_at timestamptz,
  customer_accepted_by uuid references public.profiles(id) on delete restrict,
  customer_acceptance_sha256 text check (
    customer_acceptance_sha256 is null or customer_acceptance_sha256 ~ '^[0-9a-f]{64}$'
  ),
  customer_acceptance_version smallint check (
    customer_acceptance_version is null or customer_acceptance_version = 1
  ),
  customer_accepted_currency text check (
    customer_accepted_currency is null or customer_accepted_currency ~ '^[A-Z]{3}$'
  ),
  customer_accepted_total_cents bigint check (
    customer_accepted_total_cents is null or customer_accepted_total_cents >= 0
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (offer_id, request_sha256),
  unique (id, offer_id),
  check (
    (status = 'confirmed' and repriced_total_cents is not null
      and repriced_total_cents = original_total_cents and customer_accepted_at is null)
    or (
      status = 'price_changed'
      and repriced_total_cents is not null
      and repriced_total_cents <> original_total_cents
    )
    or (status in ('unavailable', 'failed') and repriced_total_cents is null and customer_accepted_at is null)
  ),
  check (
    (customer_accepted_at is null and customer_accepted_by is null
      and customer_acceptance_sha256 is null and customer_acceptance_version is null
      and customer_accepted_currency is null
      and customer_accepted_total_cents is null)
    or (customer_accepted_at is not null and customer_accepted_by is not null
      and customer_acceptance_sha256 is not null and customer_acceptance_version = 1
      and customer_accepted_currency = currency
      and customer_accepted_total_cents = repriced_total_cents)
  ),
  check (customer_accepted_at is null or customer_accepted_at >= created_at),
  check (customer_accepted_at is null or customer_accepted_at < expires_at),
  check (expires_at > created_at)
);

create index flight_reprice_receipts_offer_created_idx
  on public.flight_reprice_receipts (offer_id, created_at desc);

create table public.flight_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  search_id uuid not null,
  offer_id uuid not null,
  reprice_receipt_id uuid not null,
  confirmation_code text not null check (confirmation_code ~ '^FLT-[A-Z0-9]{12}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_order_ref_ciphertext text,
  provider_order_ref_sha256 text check (
    provider_order_ref_sha256 is null or provider_order_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_cents bigint not null check (total_cents >= 0),
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'payment_authorized', 'order_creating', 'booked',
    'ticketing_pending', 'ticketed', 'servicing', 'cancellation_pending',
    'cancelled', 'refund_pending', 'refunded', 'failed', 'requires_review'
  )),
  provider_created_at timestamptz,
  ticketing_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id),
  unique (execution_scope_sha256, execution_mode, confirmation_code),
  unique (execution_scope_sha256, execution_mode, provider_code, provider_order_ref_sha256),
  foreign key (search_id, customer_id)
    references public.flight_searches(id, customer_id) on delete restrict,
  foreign key (offer_id, search_id)
    references public.flight_offers(id, search_id) on delete restrict,
  foreign key (reprice_receipt_id, offer_id)
    references public.flight_reprice_receipts(id, offer_id) on delete restrict,
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    (provider_order_ref_ciphertext is null and provider_order_ref_sha256 is null)
    or (
      execution_mode <> 'synthetic'
      and provider_order_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
      and provider_order_ref_sha256 is not null
    )
  ),
  check (
    (provider_order_ref_ciphertext is null and provider_created_at is null
      and ticketing_deadline_at is null)
    or (provider_order_ref_ciphertext is not null and provider_created_at is not null
      and ticketing_deadline_at > provider_created_at)
  ),
  check (
    status not in (
      'booked', 'ticketing_pending', 'ticketed', 'servicing',
      'cancellation_pending', 'refund_pending', 'refunded'
    )
    or provider_order_ref_ciphertext is not null
  )
);

create index flight_orders_customer_created_idx
  on public.flight_orders (customer_id, created_at desc);
create index flight_orders_status_updated_idx
  on public.flight_orders (status, updated_at desc);

create table public.flight_passenger_refs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  traveler_sequence smallint not null check (traveler_sequence between 1 and 9),
  traveler_type text not null check (
    traveler_type in ('adult', 'child', 'infant_in_seat', 'infant_on_lap')
  ),
  secure_pii_record_ref text not null check (
    secure_pii_record_ref ~ '^fp_[A-Za-z0-9_-]{16,200}$'
  ),
  pii_record_sha256 text not null check (pii_record_sha256 ~ '^[0-9a-f]{64}$'),
  provider_passenger_ref_ciphertext text,
  provider_passenger_ref_sha256 text check (
    provider_passenger_ref_sha256 is null or provider_passenger_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (order_id, traveler_sequence),
  unique (id, order_id),
  unique (execution_scope_sha256, execution_mode, secure_pii_record_ref),
  unique (execution_scope_sha256, execution_mode, provider_passenger_ref_sha256),
  check (
    (provider_passenger_ref_ciphertext is null and provider_passenger_ref_sha256 is null)
    or (
      provider_passenger_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and provider_passenger_ref_sha256 is not null
    )
  ),
  check (retention_expires_at > created_at)
);

create table public.flight_ticket_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  passenger_ref_id uuid not null,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  document_type text not null check (document_type in ('electronic_ticket', 'emd')),
  document_ref_ciphertext text,
  document_ref_sha256 text check (
    document_ref_sha256 is null or document_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  issuing_carrier text not null check (issuing_carrier ~ '^[A-Z0-9]{2,3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'issued', 'voided', 'refunded', 'failed')),
  issued_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (passenger_ref_id, order_id)
    references public.flight_passenger_refs(id, order_id) on delete restrict,
  unique (execution_scope_sha256, execution_mode, document_ref_sha256),
  check (
    (status in ('pending', 'failed')
      and document_ref_ciphertext is null and document_ref_sha256 is null)
    or (
      status in ('issued', 'voided', 'refunded')
      and document_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and document_ref_sha256 is not null
    )
  ),
  check (
    (status in ('pending', 'failed') and issued_at is null and voided_at is null)
    or (status = 'issued' and issued_at is not null and voided_at is null)
    or (status = 'voided' and issued_at is not null and voided_at is not null)
    or (status = 'refunded' and issued_at is not null)
  ),
  check (voided_at is null or (issued_at is not null and voided_at >= issued_at))
);

create index flight_ticket_documents_order_status_idx
  on public.flight_ticket_documents (order_id, status);
create unique index flight_ticket_documents_one_active_eticket_uidx
  on public.flight_ticket_documents (order_id, passenger_ref_id)
  where document_type = 'electronic_ticket' and status in ('pending', 'issued');

create table public.flight_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  processor_code text not null check (processor_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  processor_reference_ciphertext text not null
    check (processor_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'),
  processor_reference_sha256 text not null
    check (processor_reference_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  authorized_cents bigint not null default 0 check (authorized_cents >= 0),
  captured_cents bigint not null default 0 check (captured_cents >= 0),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  status text not null check (status in (
    'requires_payment_method', 'requires_action', 'authorized', 'captured',
    'refund_pending', 'partially_refunded', 'refunded', 'cancelled', 'failed', 'ambiguous'
  )),
  authorized_at timestamptz,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (execution_mode <> 'synthetic' or processor_code = 'synthetic'),
  unique (execution_scope_sha256, execution_mode, processor_code, processor_reference_sha256),
  unique (execution_scope_sha256, execution_mode, idempotency_key_sha256),
  check (captured_cents <= authorized_cents),
  check (refunded_cents <= captured_cents),
  check ((authorized_cents > 0) = (authorized_at is not null)),
  check ((captured_cents > 0) = (captured_at is not null)),
  check (authorized_at is null or authorized_at >= created_at),
  check (captured_at is null or (authorized_at is not null and captured_at >= authorized_at)),
  check (
    status not in ('authorized', 'captured', 'refund_pending', 'partially_refunded', 'refunded')
    or authorized_cents > 0
  ),
  check (status <> 'authorized' or (captured_cents = 0 and refunded_cents = 0)),
  check (status <> 'captured' or (captured_cents = authorized_cents and refunded_cents = 0)),
  check (status <> 'cancelled' or (captured_cents = 0 and refunded_cents = 0)),
  check (
    status <> 'failed'
    or (authorized_cents = 0 and captured_cents = 0 and refunded_cents = 0)
  ),
  check (
    status <> 'refund_pending'
    or (captured_cents = authorized_cents and refunded_cents < captured_cents)
  ),
  check (
    status <> 'partially_refunded'
    or (captured_cents = authorized_cents and refunded_cents between 1 and captured_cents - 1)
  ),
  check (status <> 'refunded' or (captured_cents = authorized_cents and refunded_cents = captured_cents))
);

create index flight_payments_order_status_idx
  on public.flight_payments (order_id, status, updated_at desc);
-- Failed attempts may be retried with a new processor identity. Cancelled means
-- an authorization was deliberately voided and the order/payment path is terminal.
create unique index flight_payments_one_nonfailed_attempt_uidx
  on public.flight_payments (order_id)
  where status <> 'failed';

create table public.flight_service_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  request_type text not null check (request_type in (
    'cancel', 'change', 'refund', 'schedule_change', 'name_correction', 'document_reissue'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  secure_request_ref text check (
    secure_request_ref is null or secure_request_ref ~ '^fs_[A-Za-z0-9_-]{16,200}$'
  ),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'requested' check (status in (
    'requested', 'quoted', 'accepted', 'processing', 'completed', 'declined',
    'failed', 'requires_review'
  )),
  provider_case_ref_ciphertext text,
  provider_case_ref_sha256 text check (
    provider_case_ref_sha256 is null or provider_case_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, request_sha256),
  check (
    (provider_case_ref_ciphertext is null and provider_case_ref_sha256 is null)
    or (
      provider_case_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and provider_case_ref_sha256 is not null
    )
  )
);

create index flight_service_requests_order_status_idx
  on public.flight_service_requests (order_id, status, created_at desc);

create table public.flight_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_event_id_sha256 text not null check (provider_event_id_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'order_created', 'order_updated', 'ticket_issued', 'ticket_voided',
    'schedule_changed', 'service_updated', 'unknown'
  )),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null default false,
  order_id uuid references public.flight_orders(id) on delete restrict,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'verified', 'processed', 'duplicate', 'blocked', 'failed')),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (execution_scope_sha256, execution_mode, provider_code, provider_event_id_sha256),
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    processing_status not in ('verified', 'processed') or signature_verified
  ),
  check ((processing_status = 'processed') = (processed_at is not null)),
  check (processed_at is null or processed_at >= received_at)
);

create index flight_provider_events_processing_idx
  on public.flight_provider_events (processing_status, received_at);
create index flight_provider_events_order_idx
  on public.flight_provider_events (order_id, occurred_at desc) where order_id is not null;

create table public.flight_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('search', 'reprice', 'order', 'payment', 'ticket', 'service', 'webhook')),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  key_sha256 text not null check (key_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$'),
  resource_type text check (
    resource_type is null or resource_type in (
      'flight_search', 'flight_offer', 'flight_reprice_receipt', 'flight_order',
      'flight_payment', 'flight_ticket_document', 'flight_service_request', 'flight_provider_event'
    )
  ),
  resource_id uuid,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'succeeded', 'failed', 'ambiguous')),
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_scope_sha256, execution_mode, scope, key_sha256),
  check ((resource_type is null) = (resource_id is null)),
  check (
    (status = 'in_progress' and response_sha256 is null and resource_id is null)
    or (status = 'succeeded' and response_sha256 is not null and resource_id is not null)
    or (status in ('failed', 'ambiguous') and response_sha256 is not null)
  ),
  check (locked_until > created_at)
);

create index flight_idempotency_records_lock_idx
  on public.flight_idempotency_records (status, locked_until);

create table public.flight_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.flight_orders(id) on delete restrict,
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  case_type text not null check (case_type in (
    'ambiguous_order', 'payment_order_mismatch', 'ticket_mismatch',
    'provider_event_gap', 'refund_mismatch', 'servicing_mismatch'
  )),
  subject_type text not null check (subject_type in (
    'flight_order', 'flight_payment', 'flight_ticket_document',
    'flight_service_request', 'flight_provider_event'
  )),
  subject_id uuid not null,
  source_status text not null check (source_status ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_revision_at timestamptz not null,
  expected_state_sha256 text not null check (expected_state_sha256 ~ '^[0-9a-f]{64}$'),
  observed_state_sha256 text not null check (observed_state_sha256 ~ '^[0-9a-f]{64}$'),
  target_status text not null check (target_status ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_authorized_cents bigint check (
    target_authorized_cents is null or target_authorized_cents >= 0
  ),
  target_captured_cents bigint check (
    target_captured_cents is null or target_captured_cents >= 0
  ),
  target_refunded_cents bigint check (
    target_refunded_cents is null or target_refunded_cents >= 0
  ),
  target_state_sha256 text not null check (target_state_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'blocked', 'resolved')),
  resolution_code text check (
    resolution_code is null or resolution_code in (
      'local_state_corrected', 'provider_state_confirmed', 'payment_reversed',
      'ticket_reissued', 'duplicate_suppressed', 'manual_followup_required'
    )
  ),
  resolution_evidence_sha256 text check (
    resolution_evidence_sha256 is null or resolution_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  resolved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (subject_type = 'flight_payment'
      and target_authorized_cents is not null
      and target_captured_cents is not null
      and target_refunded_cents is not null)
    or (subject_type <> 'flight_payment'
      and target_authorized_cents is null
      and target_captured_cents is null
      and target_refunded_cents is null)
  ),
  check (
    (status = 'resolved' and resolution_code is not null and resolution_evidence_sha256 is not null
      and resolved_by is not null and resolved_at is not null)
    or (status <> 'resolved' and resolution_code is null and resolution_evidence_sha256 is null
      and resolved_by is null and resolved_at is null)
  )
);

create index flight_reconciliation_cases_status_idx
  on public.flight_reconciliation_cases (status, created_at);
create index flight_reconciliation_cases_order_idx
  on public.flight_reconciliation_cases (order_id, created_at desc) where order_id is not null;

create or replace function public.protect_flight_runtime_controls()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding_changed boolean;
begin
  if new.control_key is distinct from old.control_key then
    raise exception 'Flight runtime control identity is immutable';
  end if;
  if new.updated_by is null or not exists (
    select 1 from public.profiles
     where id = new.updated_by
       and role = 'admin'
  ) then
    raise exception 'A platform administrator must authorize flight runtime control changes';
  end if;
  if auth.uid() is null or new.updated_by <> auth.uid() then
    raise exception 'Flight runtime control actor must match the authenticated administrator';
  end if;
  if new.activation_evidence_sha256 is null
    or new.activation_evidence_sha256 is not distinct from old.activation_evidence_sha256 then
    raise exception 'Fresh flight activation evidence is required for every runtime control change';
  end if;
  v_binding_changed :=
    new.bound_environment is distinct from old.bound_environment
    or new.bound_project_ref is distinct from old.bound_project_ref
    or new.bound_database_name is distinct from old.bound_database_name
    or new.bound_session_user is distinct from old.bound_session_user
    or new.bound_provider_code is distinct from old.bound_provider_code
    or new.bound_provider_account_sha256 is distinct from old.bound_provider_account_sha256
    or new.bound_point_of_sale is distinct from old.bound_point_of_sale
    or new.bound_content_scope_sha256 is distinct from old.bound_content_scope_sha256
    or new.bound_adapter_version_sha256 is distinct from old.bound_adapter_version_sha256
    or new.bound_payment_processor_code is distinct from old.bound_payment_processor_code
    or new.bound_payment_account_sha256 is distinct from old.bound_payment_account_sha256
    or new.bound_payment_environment is distinct from old.bound_payment_environment
    or new.bound_payment_source_sha256 is distinct from old.bound_payment_source_sha256
    or new.bound_payment_adapter_version_sha256
      is distinct from old.bound_payment_adapter_version_sha256;
  if v_binding_changed
    = (new.bound_execution_scope_sha256 is not distinct from old.bound_execution_scope_sha256) then
    raise exception 'Flight execution scope must change if and only if a bound identity changes';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace function public.record_flight_runtime_control_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.flight_runtime_control_receipts (
    control_key, changed_by, changed_at, previous_activation_evidence_sha256,
    activation_evidence_sha256, execution_kill_switch_engaged,
    synthetic_execution_enabled, provider_sandbox_traffic_enabled,
    provider_live_traffic_enabled, shopping_enabled, order_enabled,
    payment_enabled, ticketing_enabled, servicing_enabled,
    provider_events_enabled, production_release_enabled, bound_environment,
    bound_project_ref, bound_database_name, bound_session_user,
    bound_provider_code, bound_provider_account_sha256, bound_point_of_sale,
    bound_content_scope_sha256, bound_adapter_version_sha256,
    bound_payment_processor_code, bound_payment_account_sha256,
    bound_payment_environment, bound_payment_source_sha256,
    bound_payment_adapter_version_sha256, bound_execution_scope_sha256
  ) values (
    new.control_key, new.updated_by, new.updated_at, old.activation_evidence_sha256,
    new.activation_evidence_sha256, new.execution_kill_switch_engaged,
    new.synthetic_execution_enabled, new.provider_sandbox_traffic_enabled,
    new.provider_live_traffic_enabled, new.shopping_enabled, new.order_enabled,
    new.payment_enabled, new.ticketing_enabled, new.servicing_enabled,
    new.provider_events_enabled, new.production_release_enabled, new.bound_environment,
    new.bound_project_ref, new.bound_database_name, new.bound_session_user,
    new.bound_provider_code, new.bound_provider_account_sha256, new.bound_point_of_sale,
    new.bound_content_scope_sha256, new.bound_adapter_version_sha256,
    new.bound_payment_processor_code, new.bound_payment_account_sha256,
    new.bound_payment_environment, new.bound_payment_source_sha256,
    new.bound_payment_adapter_version_sha256, new.bound_execution_scope_sha256
  );
  return new;
end;
$$;

create trigger flight_runtime_controls_authority_guard
before update on public.flight_runtime_controls
for each row execute function public.protect_flight_runtime_controls();

create trigger flight_runtime_controls_receipt_guard
after update on public.flight_runtime_controls
for each row execute function public.record_flight_runtime_control_receipt();

create or replace function public.flight_runtime_capability_enabled(
  p_execution_mode text,
  p_capability text,
  p_provider_code text default null,
  p_processor_code text default null,
  p_execution_scope_sha256 text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_control public.flight_runtime_controls;
  v_session_environment text := current_setting('app.flight_environment', true);
  v_session_project_ref text := current_setting('app.flight_project_ref', true);
  v_session_authorized text := current_setting('app.flight_execution_authorized', true);
  v_session_evidence text := current_setting('app.flight_activation_evidence_sha256', true);
begin
  if p_capability not in ('shopping', 'order', 'payment', 'ticketing', 'servicing', 'provider_event') then
    return false;
  end if;
  if p_execution_mode not in ('synthetic', 'test', 'live') then
    return false;
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global';
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.activation_evidence_sha256 is null
    or v_control.bound_environment is null
    or v_control.bound_project_ref is null
    or v_control.bound_database_name is null
    or v_control.bound_session_user is null
    or v_control.bound_execution_scope_sha256 is null
    or p_execution_scope_sha256 is distinct from v_control.bound_execution_scope_sha256
    or v_control.updated_by is null
    or not exists (
      select 1 from public.profiles
       where id = v_control.updated_by
         and role = 'admin'
    )
    or not exists (
      select 1 from public.flight_runtime_control_receipts as receipt
       where receipt.control_key = v_control.control_key
         and receipt.changed_by = v_control.updated_by
         and receipt.changed_at = v_control.updated_at
         and receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256
         and receipt.execution_kill_switch_engaged
           = v_control.execution_kill_switch_engaged
         and receipt.synthetic_execution_enabled = v_control.synthetic_execution_enabled
         and receipt.provider_sandbox_traffic_enabled
           = v_control.provider_sandbox_traffic_enabled
         and receipt.provider_live_traffic_enabled = v_control.provider_live_traffic_enabled
         and receipt.shopping_enabled = v_control.shopping_enabled
         and receipt.order_enabled = v_control.order_enabled
         and receipt.payment_enabled = v_control.payment_enabled
         and receipt.ticketing_enabled = v_control.ticketing_enabled
         and receipt.servicing_enabled = v_control.servicing_enabled
         and receipt.provider_events_enabled = v_control.provider_events_enabled
         and receipt.production_release_enabled = v_control.production_release_enabled
         and receipt.bound_environment is not distinct from v_control.bound_environment
         and receipt.bound_project_ref is not distinct from v_control.bound_project_ref
         and receipt.bound_database_name is not distinct from v_control.bound_database_name
         and receipt.bound_session_user is not distinct from v_control.bound_session_user
         and receipt.bound_provider_code is not distinct from v_control.bound_provider_code
         and receipt.bound_provider_account_sha256
           is not distinct from v_control.bound_provider_account_sha256
         and receipt.bound_point_of_sale is not distinct from v_control.bound_point_of_sale
         and receipt.bound_content_scope_sha256
           is not distinct from v_control.bound_content_scope_sha256
         and receipt.bound_adapter_version_sha256
           is not distinct from v_control.bound_adapter_version_sha256
         and receipt.bound_payment_processor_code
           is not distinct from v_control.bound_payment_processor_code
         and receipt.bound_payment_account_sha256
           is not distinct from v_control.bound_payment_account_sha256
         and receipt.bound_payment_environment
           is not distinct from v_control.bound_payment_environment
         and receipt.bound_payment_source_sha256
           is not distinct from v_control.bound_payment_source_sha256
         and receipt.bound_payment_adapter_version_sha256
           is not distinct from v_control.bound_payment_adapter_version_sha256
         and receipt.bound_execution_scope_sha256
           is not distinct from v_control.bound_execution_scope_sha256
    )
    or v_session_authorized is distinct from 'true'
    or v_session_environment is distinct from v_control.bound_environment
    or v_session_project_ref is distinct from v_control.bound_project_ref
    or v_session_evidence is distinct from v_control.activation_evidence_sha256
    or current_database()::text is distinct from v_control.bound_database_name
    or session_user::text is distinct from v_control.bound_session_user then
    return false;
  end if;
  if p_execution_mode = 'synthetic' and not v_control.synthetic_execution_enabled then
    return false;
  end if;
  -- Synthetic fixtures are shopping-only. Orders, payments, tickets, and
  -- servicing require a bound sandbox or live provider execution identity.
  if p_execution_mode = 'synthetic' and p_capability <> 'shopping' then
    return false;
  end if;
  if p_execution_mode = 'synthetic'
    and p_provider_code is not null
    and p_provider_code <> 'synthetic' then
    return false;
  end if;
  if p_execution_mode = 'test'
    and not v_control.provider_sandbox_traffic_enabled then
    return false;
  end if;
  if p_execution_mode = 'live'
    and not (v_control.provider_live_traffic_enabled and v_control.production_release_enabled) then
    return false;
  end if;
  if p_execution_mode in ('test', 'live')
    and (
      v_control.bound_provider_code is null
      or v_control.bound_provider_account_sha256 is null
      or v_control.bound_point_of_sale is null
      or v_control.bound_content_scope_sha256 is null
      or v_control.bound_adapter_version_sha256 is null
      or (p_provider_code is not null and p_provider_code <> v_control.bound_provider_code)
    ) then
    return false;
  end if;
  if p_capability = 'payment'
    and (
      v_control.bound_payment_processor_code is null
      or v_control.bound_payment_account_sha256 is null
      or v_control.bound_payment_environment is distinct from p_execution_mode
      or v_control.bound_payment_source_sha256 is null
      or v_control.bound_payment_adapter_version_sha256 is null
      or (p_processor_code is not null
        and p_processor_code <> v_control.bound_payment_processor_code)
    ) then
    return false;
  end if;

  return case p_capability
    when 'shopping' then v_control.shopping_enabled
    when 'order' then v_control.order_enabled
    when 'payment' then v_control.payment_enabled
    when 'ticketing' then v_control.ticketing_enabled
    when 'servicing' then v_control.servicing_enabled
    when 'provider_event' then v_control.provider_events_enabled
    else false
  end;
end;
$$;

create or replace function public.enforce_flight_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution_mode text := to_jsonb(new) ->> 'execution_mode';
  v_provider_code text := to_jsonb(new) ->> 'provider_code';
  v_processor_code text := to_jsonb(new) ->> 'processor_code';
  v_execution_scope_sha256 text := to_jsonb(new) ->> 'execution_scope_sha256';
begin
  if not public.flight_runtime_capability_enabled(
    v_execution_mode,
    tg_argv[0],
    v_provider_code,
    v_processor_code,
    v_execution_scope_sha256
  ) then
    raise exception 'Flight % capability is disabled for % execution', tg_argv[0], v_execution_mode;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_flight_order_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capability text;
begin
  v_capability := case new.status
    when 'pending_payment' then 'order'
    when 'payment_authorized' then 'payment'
    when 'order_creating' then 'order'
    when 'booked' then 'order'
    when 'ticketing_pending' then 'ticketing'
    when 'ticketed' then 'ticketing'
    when 'servicing' then 'servicing'
    when 'cancellation_pending' then 'servicing'
    when 'refund_pending' then 'servicing'
    when 'refunded' then 'servicing'
    when 'cancelled' then case
      when tg_op = 'UPDATE' and old.status = 'pending_payment' then 'order'
      when tg_op = 'UPDATE' and old.status = 'payment_authorized' then 'payment'
      else 'servicing'
    end
    when 'failed' then case
      when tg_op = 'UPDATE' and old.status in ('ticketing_pending', 'ticketed') then 'ticketing'
      when tg_op = 'UPDATE' and old.status = 'servicing' then 'servicing'
      else 'order'
    end
    when 'requires_review' then case
      when tg_op = 'UPDATE' and old.status in ('ticketing_pending', 'ticketed') then 'ticketing'
      when tg_op = 'UPDATE' and old.status = 'payment_authorized' then 'payment'
      when tg_op = 'UPDATE' and old.status in (
        'servicing', 'cancellation_pending', 'cancelled', 'refund_pending'
      ) then 'servicing'
      else 'order'
    end
    else null
  end;
  if v_capability is null
    or not public.flight_runtime_capability_enabled(
      new.execution_mode,
      v_capability,
      new.provider_code,
      null,
      new.execution_scope_sha256
    ) then
    raise exception 'Flight % capability is disabled for % order status %',
      coalesce(v_capability, 'unknown'), new.execution_mode, new.status;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_flight_evidence_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capability text;
  v_provider_code text;
begin
  if tg_table_name = 'flight_idempotency_records' then
    v_capability := case new.scope
      when 'search' then 'shopping'
      when 'reprice' then 'shopping'
      when 'order' then 'order'
      when 'payment' then 'payment'
      when 'ticket' then 'ticketing'
      when 'service' then 'servicing'
      when 'webhook' then 'provider_event'
      else null
    end;
  elsif tg_table_name = 'flight_reconciliation_cases' then
    v_provider_code := new.provider_code;
    v_capability := case new.case_type
      when 'ambiguous_order' then 'order'
      when 'payment_order_mismatch' then 'payment'
      when 'ticket_mismatch' then 'ticketing'
      when 'provider_event_gap' then 'provider_event'
      when 'refund_mismatch' then 'servicing'
      when 'servicing_mismatch' then 'servicing'
      else null
    end;
  end if;
  if v_capability is null
    or not public.flight_runtime_capability_enabled(
      new.execution_mode,
      v_capability,
      v_provider_code,
      null,
      new.execution_scope_sha256
    ) then
    raise exception 'Flight evidence capability is disabled for % execution', new.execution_mode;
  end if;
  return new;
end;
$$;

create or replace function public.lock_flight_order_parent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid := (to_jsonb(new) ->> 'order_id')::uuid;
begin
  if v_order_id is null then
    return new;
  end if;
  perform 1
    from public.flight_orders
   where id = v_order_id
   for update;
  if not found then
    raise exception 'Flight child mutation requires its locked parent order';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_idempotency_resource()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution_mode text;
  v_execution_scope_sha256 text;
begin
  if new.resource_type is null and new.resource_id is null then
    return new;
  end if;
  if new.resource_type is distinct from (case new.scope
    when 'search' then 'flight_search'
    when 'reprice' then 'flight_reprice_receipt'
    when 'order' then 'flight_order'
    when 'payment' then 'flight_payment'
    when 'ticket' then 'flight_ticket_document'
    when 'service' then 'flight_service_request'
    when 'webhook' then 'flight_provider_event'
    else null
  end) then
    raise exception 'Flight idempotency scope does not match its resource type';
  end if;
  v_execution_mode := case new.resource_type
    when 'flight_search' then (select execution_mode from public.flight_searches where id = new.resource_id)
    when 'flight_offer' then (select execution_mode from public.flight_offers where id = new.resource_id)
    when 'flight_reprice_receipt' then (
      select execution_mode from public.flight_reprice_receipts where id = new.resource_id
    )
    when 'flight_order' then (select execution_mode from public.flight_orders where id = new.resource_id)
    when 'flight_payment' then (select execution_mode from public.flight_payments where id = new.resource_id)
    when 'flight_ticket_document' then (
      select execution_mode from public.flight_ticket_documents where id = new.resource_id
    )
    when 'flight_service_request' then (
      select execution_mode from public.flight_service_requests where id = new.resource_id
    )
    when 'flight_provider_event' then (
      select execution_mode from public.flight_provider_events where id = new.resource_id
    )
    else null
  end;
  v_execution_scope_sha256 := case new.resource_type
    when 'flight_search' then (
      select execution_scope_sha256 from public.flight_searches where id = new.resource_id
    )
    when 'flight_offer' then (
      select execution_scope_sha256 from public.flight_offers where id = new.resource_id
    )
    when 'flight_reprice_receipt' then (
      select execution_scope_sha256
        from public.flight_reprice_receipts where id = new.resource_id
    )
    when 'flight_order' then (
      select execution_scope_sha256 from public.flight_orders where id = new.resource_id
    )
    when 'flight_payment' then (
      select execution_scope_sha256 from public.flight_payments where id = new.resource_id
    )
    when 'flight_ticket_document' then (
      select execution_scope_sha256
        from public.flight_ticket_documents where id = new.resource_id
    )
    when 'flight_service_request' then (
      select execution_scope_sha256
        from public.flight_service_requests where id = new.resource_id
    )
    when 'flight_provider_event' then (
      select execution_scope_sha256
        from public.flight_provider_events where id = new.resource_id
    )
    else null
  end;
  if v_execution_mode is null
    or v_execution_mode <> new.execution_mode
    or v_execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight idempotency resource does not match its execution scope';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_search public.flight_searches;
  v_offer public.flight_offers;
  v_receipt public.flight_reprice_receipts;
  v_segment_count bigint;
  v_first_sequence smallint;
  v_last_sequence smallint;
  v_first_origin text;
  v_last_destination text;
  v_outbound_count bigint;
  v_return_count bigint;
  v_outbound_first_sequence smallint;
  v_outbound_last_sequence smallint;
  v_return_first_sequence smallint;
  v_return_last_sequence smallint;
  v_outbound_first_origin text;
  v_outbound_last_destination text;
  v_return_first_origin text;
  v_return_last_destination text;
  v_outbound_departure_local_date date;
  v_return_departure_local_date date;
  v_outbound_departure_at timestamptz;
begin
  -- The parent order row serializes order-scoped mutations. Order creation also
  -- locks its immutable evidence chain in a fixed search -> offer -> reprice order.
  select * into v_search
    from public.flight_searches where id = new.search_id
    for share;
  select * into v_offer
    from public.flight_offers where id = new.offer_id
    for share;
  select * into v_receipt
    from public.flight_reprice_receipts where id = new.reprice_receipt_id
    for share;

  if v_search.id is null or v_offer.id is null or v_receipt.id is null then
    raise exception 'Complete flight search, offer, and reprice evidence is required';
  end if;
  if tg_op = 'UPDATE'
    and old.provider_order_ref_sha256 is not null
    and (
      new.provider_order_ref_sha256 is distinct from old.provider_order_ref_sha256
      or new.provider_order_ref_ciphertext is distinct from old.provider_order_ref_ciphertext
      or new.provider_created_at is distinct from old.provider_created_at
    ) then
    raise exception 'Flight provider order identity is immutable after binding';
  end if;
  if v_search.customer_id <> new.customer_id
    or v_offer.search_id <> new.search_id
    or v_receipt.offer_id <> new.offer_id then
    raise exception 'Flight order evidence chain does not match';
  end if;
  if v_search.execution_mode <> new.execution_mode
    or v_offer.execution_mode <> new.execution_mode
    or v_receipt.execution_mode <> new.execution_mode
    or v_search.execution_scope_sha256 <> new.execution_scope_sha256
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256
    or v_receipt.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight order execution scope does not match its evidence';
  end if;
  if v_offer.provider_code <> new.provider_code then
    raise exception 'Flight order provider does not match its offer';
  end if;
  if (tg_op = 'INSERT' or new.status in ('pending_payment', 'payment_authorized', 'order_creating'))
    and (
      v_offer.status <> 'offered'
      or v_offer.expires_at <= clock_timestamp()
      or v_receipt.expires_at <= clock_timestamp()
    ) then
    raise exception 'Flight offer or reprice evidence is expired';
  end if;
  if v_receipt.status = 'price_changed'
    and (
      v_receipt.customer_accepted_at is null
      or v_receipt.customer_accepted_by is null
      or v_receipt.customer_acceptance_sha256 is null
      or v_receipt.customer_acceptance_version <> 1
      or v_receipt.customer_accepted_currency <> new.currency
      or v_receipt.customer_accepted_total_cents <> new.total_cents
      or v_receipt.customer_accepted_by <> new.customer_id
    ) then
    raise exception 'Actor-bound customer acceptance is required for a changed flight price';
  end if;
  if v_receipt.status not in ('confirmed', 'price_changed') then
    raise exception 'A successful flight reprice receipt is required';
  end if;
  if v_receipt.currency <> new.currency or v_receipt.repriced_total_cents <> new.total_cents then
    raise exception 'Flight order total does not match the latest reprice receipt';
  end if;
  select
    count(*), min(segment_sequence), max(segment_sequence),
    (array_agg(origin_iata order by segment_sequence))[1],
    (array_agg(destination_iata order by segment_sequence desc))[1]
    into v_segment_count, v_first_sequence, v_last_sequence,
      v_first_origin, v_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256;
  if v_segment_count <> v_offer.segment_count
    or v_first_sequence <> 1
    or v_last_sequence <> v_offer.segment_count
    or v_first_origin <> v_search.origin_iata
    or (
      v_search.journey_type = 'one_way'
      and v_last_destination <> v_search.destination_iata
    )
    or (
      v_search.journey_type = 'round_trip'
      and (
        v_last_destination <> v_search.origin_iata
        or not exists (
          select 1 from public.flight_offer_segments
           where offer_id = new.offer_id
             and execution_mode = new.execution_mode
             and execution_scope_sha256 = new.execution_scope_sha256
             and destination_iata = v_search.destination_iata
        )
      )
    )
    or exists (
      select 1
        from public.flight_offer_segments as prior
        left join public.flight_offer_segments as following
          on following.offer_id = prior.offer_id
         and following.execution_mode = prior.execution_mode
         and following.execution_scope_sha256 = prior.execution_scope_sha256
         and following.segment_sequence = prior.segment_sequence + 1
       where prior.offer_id = new.offer_id
         and prior.execution_mode = new.execution_mode
         and prior.execution_scope_sha256 = new.execution_scope_sha256
         and prior.segment_sequence < v_offer.segment_count
         and (
           following.id is null
           or following.origin_iata <> prior.destination_iata
           or following.departure_at < prior.arrival_at
         )
    )
    or not exists (
      select 1 from public.flight_offer_fare_terms
       where offer_id = new.offer_id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
    ) then
    raise exception 'Complete normalized flight itinerary and fare evidence is required';
  end if;
  if exists (
    select 1 from public.flight_offer_segments
     where offer_id = new.offer_id
       and execution_mode = new.execution_mode
       and execution_scope_sha256 = new.execution_scope_sha256
       and cabin <> v_search.cabin
  ) then
    raise exception 'Flight itinerary cabin does not match the requested cabin';
  end if;
  select
    count(*) filter (where journey_direction = 'outbound'),
    count(*) filter (where journey_direction = 'return'),
    min(segment_sequence) filter (where journey_direction = 'outbound'),
    max(segment_sequence) filter (where journey_direction = 'outbound'),
    min(segment_sequence) filter (where journey_direction = 'return'),
    max(segment_sequence) filter (where journey_direction = 'return')
    into v_outbound_count, v_return_count,
      v_outbound_first_sequence, v_outbound_last_sequence,
      v_return_first_sequence, v_return_last_sequence
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256;
  select origin_iata, departure_local_date, departure_at
    into v_outbound_first_origin, v_outbound_departure_local_date, v_outbound_departure_at
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'outbound'
   order by segment_sequence
   limit 1;
  select destination_iata into v_outbound_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'outbound'
   order by segment_sequence desc
   limit 1;
  select origin_iata, departure_local_date
    into v_return_first_origin, v_return_departure_local_date
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'return'
   order by segment_sequence
   limit 1;
  select destination_iata into v_return_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'return'
   order by segment_sequence desc
   limit 1;
  if v_outbound_count < 1
    or v_outbound_first_sequence <> 1
    or v_outbound_first_origin <> v_search.origin_iata
    or v_outbound_last_destination <> v_search.destination_iata
    or v_outbound_departure_local_date <> v_search.departure_date
    or v_outbound_departure_at <= clock_timestamp() + interval '30 minutes' then
    raise exception 'Flight outbound itinerary does not match the requested route and date';
  end if;
  if v_search.journey_type = 'one_way' and (
    v_return_count <> 0 or v_outbound_count <> v_segment_count
  ) then
    raise exception 'One-way flight itinerary cannot contain return segments';
  end if;
  if v_search.journey_type = 'round_trip' and (
    v_return_count < 1
    or v_outbound_count + v_return_count <> v_segment_count
    or v_outbound_last_sequence >= v_return_first_sequence
    or v_return_first_origin <> v_search.destination_iata
    or v_return_last_destination <> v_search.origin_iata
    or v_return_departure_local_date <> v_search.return_date
    or v_return_last_sequence <> v_segment_count
  ) then
    raise exception 'Flight return itinerary does not match the requested route and date';
  end if;
  if new.provider_order_ref_sha256 is not null and (
    new.ticketing_deadline_at is null
    or new.ticketing_deadline_at <= new.provider_created_at
    or new.ticketing_deadline_at >= v_outbound_departure_at
  ) then
    raise exception 'Flight ticketing deadline must follow provider creation and precede departure';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_offer_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.flight_offers;
  v_new jsonb := to_jsonb(new);
begin
  select * into v_offer
    from public.flight_offers
   where id = new.offer_id;
  if not found
    or v_offer.execution_mode <> new.execution_mode
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight offer snapshot execution mode does not match its offer';
  end if;
  if not public.flight_runtime_capability_enabled(
    new.execution_mode,
    'shopping',
    v_offer.provider_code,
    null,
    new.execution_scope_sha256
  ) then
    raise exception 'Flight offer snapshot provider is not the bound runtime provider';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at <= clock_timestamp() then
    raise exception 'Flight offer snapshot can only be captured for an active offer';
  end if;
  if tg_table_name = 'flight_offer_segments'
    and (v_new ->> 'segment_sequence')::smallint > v_offer.segment_count then
    raise exception 'Flight segment sequence exceeds the offer segment count';
  end if;
  if tg_table_name = 'flight_offer_segments' and (
    exists (
      select 1 from public.flight_offer_segments
       where offer_id = (v_new ->> 'offer_id')::uuid
         and segment_sequence = (v_new ->> 'segment_sequence')::smallint - 1
         and arrival_at > (v_new ->> 'departure_at')::timestamptz
    )
    or exists (
      select 1 from public.flight_offer_segments
       where offer_id = (v_new ->> 'offer_id')::uuid
         and segment_sequence = (v_new ->> 'segment_sequence')::smallint + 1
         and departure_at < (v_new ->> 'arrival_at')::timestamptz
    )
  ) then
    raise exception 'Flight offer segments overlap or are out of chronological order';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_offer_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_search public.flight_searches;
begin
  select * into v_search from public.flight_searches where id = new.search_id;
  if not found then
    raise exception 'Flight offer search evidence is required';
  end if;
  if v_search.execution_mode <> new.execution_mode
    or v_search.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight offer execution scope does not match its search';
  end if;
  if v_search.status not in ('searching', 'complete')
    or v_search.expires_at <= clock_timestamp() then
    raise exception 'Flight offer search evidence is not active';
  end if;
  if new.expires_at > v_search.expires_at then
    raise exception 'Flight offer cannot outlive its search';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_reprice_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.flight_offers;
begin
  select * into v_offer from public.flight_offers where id = new.offer_id;
  if not found then
    raise exception 'Flight reprice offer evidence is required';
  end if;
  if v_offer.execution_mode <> new.execution_mode
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256
    or v_offer.currency <> new.currency
    or v_offer.total_cents <> new.original_total_cents then
    raise exception 'Flight reprice evidence does not match its offer';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at <= clock_timestamp() then
    raise exception 'Flight offer is not active for repricing';
  end if;
  if new.expires_at > v_offer.expires_at then
    raise exception 'Flight reprice evidence cannot outlive its offer';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_child_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.flight_orders;
  v_new jsonb := to_jsonb(new);
  v_child_status text := v_new ->> 'status';
begin
  if tg_table_name = 'flight_reconciliation_cases'
    and (to_jsonb(new) ->> 'status') = 'resolved'
    and (
      auth.uid() is null
      or (to_jsonb(new) ->> 'resolved_by')::uuid <> auth.uid()
      or not exists (
        select 1 from public.profiles
         where id = (to_jsonb(new) ->> 'resolved_by')::uuid
           and role = 'admin'
      )
    ) then
    raise exception 'Flight reconciliation resolution requires its authenticated administrator';
  end if;
  if tg_table_name = 'flight_reconciliation_cases' and not (
    ((v_new ->> 'subject_type') = 'flight_order' and exists (
      select 1 from public.flight_orders as subject
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.id = new.order_id
         and subject.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_payment' and exists (
      select 1
        from public.flight_payments as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_ticket_document' and exists (
      select 1
        from public.flight_ticket_documents as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_service_request' and exists (
      select 1
        from public.flight_service_requests as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_provider_event' and exists (
      select 1 from public.flight_provider_events as subject
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id is not distinct from new.order_id
         and subject.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.processing_status = (v_new ->> 'source_status')
         and coalesce(subject.processed_at, subject.received_at)
           = (v_new ->> 'source_revision_at')::timestamptz
    ))
  ) then
    raise exception 'Flight reconciliation subject, source state, or revision does not match';
  end if;
  if new.order_id is null then
    return new;
  end if;
  select * into v_order
    from public.flight_orders
   where id = new.order_id
   for update;
  if not found
    or v_order.execution_mode <> new.execution_mode
    or v_order.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight child record execution scope does not match its order';
  end if;
  if tg_table_name = 'flight_payments'
    and (
      (to_jsonb(new) ->> 'currency') <> v_order.currency
      or (to_jsonb(new) ->> 'authorized_cents')::bigint not in (0, v_order.total_cents)
    ) then
    raise exception 'Flight payment amount or currency does not match its order';
  end if;
  if tg_table_name = 'flight_payments' and not (
    (v_child_status in ('requires_payment_method', 'requires_action')
      and v_order.status = 'pending_payment')
    or (v_child_status = 'authorized' and v_order.status in (
      'pending_payment', 'payment_authorized', 'order_creating', 'booked', 'requires_review'
    ))
    or (v_child_status = 'captured' and v_order.status in (
      'payment_authorized', 'order_creating', 'booked',
      'ticketing_pending', 'ticketed', 'servicing',
      'cancellation_pending', 'cancelled', 'requires_review'
    ))
    or (v_child_status in ('refund_pending', 'partially_refunded', 'refunded')
      and v_order.status in ('cancelled', 'refund_pending', 'refunded', 'requires_review'))
    or (v_child_status = 'cancelled'
      and v_order.status in ('pending_payment', 'payment_authorized', 'cancelled', 'requires_review'))
    or (v_child_status = 'failed'
      and v_order.status in ('pending_payment', 'payment_authorized', 'failed', 'requires_review'))
    or (v_child_status = 'ambiguous' and v_order.status = 'requires_review')
  ) then
    raise exception 'Flight payment lifecycle is incompatible with its parent order state';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status in ('ticketing_pending', 'ticketed')
    and not (
      (to_jsonb(new) ->> 'status') = 'captured'
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
      and (to_jsonb(new) ->> 'refunded_cents')::bigint = 0
    ) then
    raise exception 'Captured payment evidence cannot drift while an order is ticketing or ticketed';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status = 'refund_pending'
    and not (
      (to_jsonb(new) ->> 'status') in ('refund_pending', 'partially_refunded', 'refunded')
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
    ) then
    raise exception 'Refund-in-progress evidence cannot drift while the order is refund pending';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status = 'refunded'
    and not (
      (to_jsonb(new) ->> 'status') = 'refunded'
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
      and (to_jsonb(new) ->> 'refunded_cents')::bigint = v_order.total_cents
    ) then
    raise exception 'Refund evidence cannot drift after the order is refunded';
  end if;
  if tg_table_name in ('flight_provider_events', 'flight_reconciliation_cases')
    and (to_jsonb(new) ->> 'provider_code') <> v_order.provider_code then
    raise exception 'Flight provider evidence does not match its order';
  end if;
  if tg_table_name = 'flight_service_requests'
    and (to_jsonb(new) ->> 'requested_by')::uuid <> v_order.customer_id
    and not exists (
      select 1 from public.profiles
       where id = (to_jsonb(new) ->> 'requested_by')::uuid
         and role = 'admin'
    ) then
    raise exception 'Flight service requester is not authorized for the order';
  end if;
  if tg_table_name = 'flight_service_requests'
    and v_order.status = 'servicing'
    and (to_jsonb(new) ->> 'status') not in ('accepted', 'processing', 'completed') then
    raise exception 'Service evidence cannot drift while the order is servicing';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and (to_jsonb(new) ->> 'issuing_carrier') is distinct from (
      select offer.validating_carrier
        from public.flight_offers as offer
       where offer.id = v_order.offer_id
         and offer.execution_mode = v_order.execution_mode
         and offer.execution_scope_sha256 = v_order.execution_scope_sha256
    ) then
    raise exception 'Flight ticket issuing carrier does not match the order validating carrier';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and not (
      (v_child_status = 'pending' and v_order.status in ('ticketing_pending', 'servicing'))
      or (v_child_status = 'issued' and v_order.status in (
        'ticketing_pending', 'ticketed', 'servicing',
        'cancellation_pending', 'cancelled', 'requires_review'
      ))
      or (v_child_status in ('voided', 'refunded') and v_order.status in (
        'servicing', 'cancellation_pending', 'cancelled',
        'refund_pending', 'refunded', 'requires_review'
      ))
      or (v_child_status = 'failed'
        and v_order.status in ('ticketing_pending', 'servicing', 'requires_review'))
    ) then
    raise exception 'Flight ticket lifecycle is incompatible with its parent order state';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and v_order.status = 'ticketed'
    and (to_jsonb(new) ->> 'document_type') = 'electronic_ticket'
    and (to_jsonb(new) ->> 'status') <> 'issued' then
    raise exception 'Issued ticket evidence cannot drift while the order is ticketed';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and v_order.status = 'refunded'
    and (to_jsonb(new) ->> 'status') not in ('voided', 'refunded') then
    raise exception 'Ticket refund evidence cannot drift after the order is refunded';
  end if;
  if tg_table_name = 'flight_passenger_refs'
    and tg_op = 'UPDATE'
    and v_order.status in ('ticketing_pending', 'ticketed') then
    raise exception 'Passenger references cannot drift while an order is ticketing or ticketed';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_adults bigint;
  v_expected_children bigint;
  v_expected_infants_in_seat bigint;
  v_expected_infants_on_lap bigint;
  v_actual_adults bigint;
  v_actual_children bigint;
  v_actual_infants_in_seat bigint;
  v_actual_infants_on_lap bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_payment' then
      raise exception 'New flight orders must start pending payment';
    end if;
    if new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null then
      raise exception 'New flight orders cannot contain pre-bound provider evidence';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending_payment' and new.status in ('payment_authorized', 'cancelled', 'failed', 'requires_review'))
    or (old.status = 'payment_authorized'
      and new.status in ('order_creating', 'cancelled', 'requires_review'))
    or (old.status = 'order_creating' and new.status in ('booked', 'requires_review'))
    or (old.status = 'booked'
      and new.status in ('ticketing_pending', 'servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'ticketing_pending' and new.status in ('ticketed', 'requires_review'))
    or (old.status = 'ticketed'
      and new.status in ('servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'servicing'
      and new.status in ('ticketed', 'cancellation_pending', 'requires_review'))
    or (old.status = 'cancellation_pending' and new.status in ('cancelled', 'requires_review'))
    or (old.status = 'cancelled' and new.status = 'refund_pending')
    or (old.status = 'refund_pending' and new.status in ('refunded', 'requires_review'))
    or (old.status = 'requires_review' and new.status in (
      'pending_payment', 'payment_authorized', 'order_creating',
      'ticketing_pending', 'ticketed', 'servicing', 'cancellation_pending',
      'cancelled', 'refund_pending', 'refunded', 'failed'
    ))
  ) then
    raise exception 'Invalid flight order status transition from % to %', old.status, new.status;
  end if;

  -- A review exit may never rewind a provider-bound or serviced order into a
  -- state from which a second provider order could be created. These target
  -- invariants apply independently of the reconciliation case classification.
  if new.status in ('pending_payment', 'payment_authorized', 'order_creating')
    and (
      new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
      or exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
    ) then
    raise exception 'Early flight order states require zero provider-order, ticket, and service liability';
  end if;

  if new.status = 'pending_payment'
    and exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           authorized_cents <> 0
           or captured_cents <> 0
           or refunded_cents <> 0
           or status not in (
             'requires_payment_method', 'requires_action', 'cancelled', 'failed'
           )
         )
    ) then
    raise exception 'Pending flight orders require exact zero monetary liability';
  end if;

  if old.status = 'requires_review'
    and new.status <> old.status
    and not exists (
      select 1
        from public.flight_reconciliation_cases as reconciliation
        join public.profiles as resolver on resolver.id = reconciliation.resolved_by
       where reconciliation.order_id = new.id
         and reconciliation.execution_mode = new.execution_mode
         and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
         and reconciliation.provider_code = new.provider_code
         and reconciliation.status = 'resolved'
         and reconciliation.resolution_evidence_sha256 is not null
         and reconciliation.resolved_at >= old.updated_at
         and resolver.role = 'admin'
         and reconciliation.subject_type = 'flight_order'
         and reconciliation.subject_id = new.id
         and reconciliation.source_status = old.status
         and reconciliation.source_revision_at = old.updated_at
         and reconciliation.target_status = new.status
         and reconciliation.target_state_sha256 = encode(
           extensions.digest(
             convert_to(jsonb_build_object(
               'domain', 'iratepilot.flight.reconciliation.target.v1',
               'subject_type', 'flight_order',
               'subject_id', new.id::text,
               'target_status', new.status,
               'execution_mode', new.execution_mode,
               'execution_scope_sha256', new.execution_scope_sha256
             )::text, 'UTF8'),
             'sha256'
           ),
           'hex'
         )
         and (
           (new.status in ('pending_payment', 'order_creating', 'failed')
             and reconciliation.case_type = 'ambiguous_order')
           or (new.status = 'payment_authorized'
             and reconciliation.case_type = 'payment_order_mismatch')
           or (new.status in ('ticketing_pending', 'ticketed')
             and reconciliation.case_type = 'ticket_mismatch')
           or (new.status in ('refund_pending', 'refunded')
             and reconciliation.case_type = 'refund_mismatch')
           or (new.status in ('servicing', 'cancellation_pending')
             and reconciliation.case_type = 'servicing_mismatch')
           or (new.status = 'cancelled' and (
             (new.provider_order_ref_sha256 is null
               and reconciliation.case_type in ('payment_order_mismatch', 'ambiguous_order'))
             or (new.provider_order_ref_sha256 is not null
               and reconciliation.case_type = 'servicing_mismatch')
           ))
         )
    ) then
    raise exception 'Resolved administrator-attributed reconciliation evidence is required';
  end if;

  if new.status = 'failed' and (
    exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           captured_cents <> refunded_cents
           or status not in ('failed', 'cancelled', 'refunded')
           or (status = 'failed' and authorized_cents > 0)
         )
    )
    or (
      new.provider_order_ref_sha256 is not null
      and not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type = 'cancel'
           and status = 'completed'
      )
    )
    or exists (
      select 1 from public.flight_ticket_documents
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status not in ('voided', 'refunded', 'failed')
    )
  ) then
    raise exception 'Flight orders can fail only with exact zero-liability evidence';
  end if;

  if new.status in ('payment_authorized', 'order_creating', 'booked')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and status in ('authorized', 'captured')
    ) then
    raise exception 'Exact authorized flight payment evidence is required';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and (
      new.ticketing_deadline_at is null
      or new.ticketing_deadline_at <= clock_timestamp()
    ) then
    raise exception 'Flight order ticketing deadline has expired';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and captured_cents = new.total_cents
         and refunded_cents = 0
         and status = 'captured'
    ) then
    raise exception 'Exact captured flight payment evidence is required before ticketing';
  end if;

  if new.status in ('ticketing_pending', 'ticketed') then
    select adult_count, child_count, infant_in_seat_count, infant_on_lap_count
      into v_expected_adults, v_expected_children,
        v_expected_infants_in_seat, v_expected_infants_on_lap
      from public.flight_searches
     where id = new.search_id;
    select
      count(*) filter (where traveler_type = 'adult'),
      count(*) filter (where traveler_type = 'child'),
      count(*) filter (where traveler_type = 'infant_in_seat'),
      count(*) filter (where traveler_type = 'infant_on_lap')
      into v_actual_adults, v_actual_children,
        v_actual_infants_in_seat, v_actual_infants_on_lap
      from public.flight_passenger_refs
     where order_id = new.id
       and execution_mode = new.execution_mode
       and execution_scope_sha256 = new.execution_scope_sha256;
    if v_actual_adults is distinct from v_expected_adults
      or v_actual_children is distinct from v_expected_children
      or v_actual_infants_in_seat is distinct from v_expected_infants_in_seat
      or v_actual_infants_on_lap is distinct from v_expected_infants_on_lap then
      raise exception 'Exact passenger-reference evidence is required before ticketing';
    end if;
  end if;

  if new.status = 'ticketed'
    and exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = new.id
         and passenger.execution_mode = new.execution_mode
         and passenger.execution_scope_sha256 = new.execution_scope_sha256
         and (
           select count(*) from public.flight_ticket_documents as document
            where document.order_id = new.id
               and document.passenger_ref_id = passenger.id
               and document.execution_mode = new.execution_mode
               and document.execution_scope_sha256 = new.execution_scope_sha256
               and document.document_type = 'electronic_ticket'
              and document.status = 'issued'
         ) <> 1
    ) then
    raise exception 'Exactly one issued ticket document is required for every passenger';
  end if;

  if new.status = 'servicing'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status in ('accepted', 'processing')
    ) then
    raise exception 'Accepted flight service evidence is required';
  end if;

  if new.status = 'cancellation_pending'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status in ('accepted', 'processing', 'completed')
    ) then
    raise exception 'Accepted flight cancellation evidence is required';
  end if;

  if new.status = 'cancelled'
    and old.status = 'pending_payment'
    and (
      new.provider_order_ref_sha256 is not null
      or exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and (
             authorized_cents <> 0
             or captured_cents <> 0
             or refunded_cents <> 0
             or status not in ('failed', 'cancelled')
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Pending flight orders can cancel only with exact zero-liability evidence';
  end if;

  if new.status = 'cancelled'
    and old.status <> 'pending_payment'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and (
             (status = 'cancelled' and captured_cents = 0 and refunded_cents = 0)
             or (
               status in ('captured', 'refund_pending', 'partially_refunded', 'refunded')
               and captured_cents = new.total_cents
             )
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact cancelled or captured payment and inactive-ticket evidence is required';
  end if;

  if new.status = 'refund_pending'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and captured_cents = new.total_cents
           and status in ('refund_pending', 'partially_refunded', 'refunded')
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status in ('accepted', 'processing', 'completed')
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact in-progress refund, service, and inactive-ticket evidence is required';
  end if;

  if new.status = 'cancelled' and new.provider_order_ref_sha256 is not null
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status = 'completed'
    ) then
    raise exception 'Completed provider cancellation evidence is required';
  end if;

  if new.status = 'refunded'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and captured_cents = new.total_cents
           and refunded_cents = new.total_cents
           and status = 'refunded'
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status = 'completed'
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact completed refund, service, and ticket evidence is required';
  end if;
  return new;
end;
$$;

create or replace function public.protect_flight_reprice_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.customer_accepted_at is not null
      or new.customer_accepted_by is not null
      or new.customer_acceptance_sha256 is not null
      or new.customer_acceptance_version is not null
      or new.customer_accepted_currency is not null
      or new.customer_accepted_total_cents is not null then
      raise exception 'Flight reprice acceptance must be recorded after receipt creation';
    end if;
    return new;
  end if;
  if old.status = 'price_changed'
    and old.customer_accepted_at is null
    and old.customer_accepted_by is null
    and old.customer_acceptance_sha256 is null
    and old.customer_acceptance_version is null
    and old.customer_accepted_currency is null
    and old.customer_accepted_total_cents is null
    and new.customer_accepted_at is not null
    and new.customer_accepted_by is not null
    and new.customer_acceptance_sha256 is null
    and new.customer_acceptance_version is null
    and new.customer_accepted_currency = old.currency
    and new.customer_accepted_total_cents = old.repriced_total_cents
    and to_jsonb(new) - array[
      'customer_accepted_at', 'customer_accepted_by', 'customer_acceptance_sha256',
      'customer_acceptance_version', 'customer_accepted_currency',
      'customer_accepted_total_cents'
    ] = to_jsonb(old) - array[
      'customer_accepted_at', 'customer_accepted_by', 'customer_acceptance_sha256',
      'customer_acceptance_version', 'customer_accepted_currency',
      'customer_accepted_total_cents'
    ] then
    select search.customer_id into v_customer_id
      from public.flight_offers as offer
      join public.flight_searches as search on search.id = offer.search_id
     where offer.id = new.offer_id;
    if v_customer_id is null
      or new.customer_accepted_by <> v_customer_id
      or auth.uid() is null
      or auth.uid() <> new.customer_accepted_by then
      raise exception 'Flight reprice acceptance actor does not own the search';
    end if;
    new.customer_accepted_at := clock_timestamp();
    new.customer_acceptance_version := 1;
    new.customer_acceptance_sha256 := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'domain', 'iratepilot.flight.reprice.acceptance.v1',
            'receipt_id', old.id::text,
            'offer_id', old.offer_id::text,
            'actor_id', new.customer_accepted_by::text,
            'currency', old.currency,
            'total_cents', old.repriced_total_cents,
            'request_sha256', old.request_sha256,
            'response_sha256', old.response_sha256,
            'execution_mode', old.execution_mode,
            'execution_scope_sha256', old.execution_scope_sha256
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    return new;
  end if;
  raise exception 'Flight reprice evidence is immutable except for one customer acceptance';
end;
$$;

create or replace function public.protect_flight_operational_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    if (tg_table_name = 'flight_searches' and (v_new ->> 'status') <> 'created')
      or (tg_table_name = 'flight_offers' and (v_new ->> 'status') <> 'offered')
      or (tg_table_name = 'flight_ticket_documents' and (v_new ->> 'status') <> 'pending')
      or (tg_table_name = 'flight_payments' and (
        (v_new ->> 'status') <> 'requires_payment_method'
        or (v_new ->> 'authorized_cents')::bigint <> 0
        or (v_new ->> 'captured_cents')::bigint <> 0
        or (v_new ->> 'refunded_cents')::bigint <> 0
      ))
      or (tg_table_name = 'flight_service_requests' and (v_new ->> 'status') <> 'requested')
      or (tg_table_name = 'flight_provider_events' and (
        (v_new ->> 'processing_status') <> 'received'
        or (v_new ->> 'signature_verified')::boolean
        or (v_new ->> 'processed_at') is not null
      ))
      or (tg_table_name = 'flight_idempotency_records'
        and (v_new ->> 'status') <> 'in_progress')
      or (tg_table_name = 'flight_reconciliation_cases' and (v_new ->> 'status') <> 'open') then
      raise exception 'Flight evidence must be inserted in its exact initial lifecycle state';
    end if;
    if tg_table_name = 'flight_passenger_refs'
      and (
        (v_new ->> 'provider_passenger_ref_ciphertext') is not null
        or (v_new ->> 'provider_passenger_ref_sha256') is not null
      ) then
      raise exception 'Flight provider passenger identity must be bound after passenger creation';
    end if;
    return new;
  end if;
  v_old := to_jsonb(old);
  if tg_table_name = 'flight_searches' then
    if v_new - array['status', 'provider_request_sha256', 'updated_at']
      is distinct from v_old - array['status', 'provider_request_sha256', 'updated_at'] then
      raise exception 'Flight search criteria and identity evidence are immutable';
    end if;
    if old.provider_request_sha256 is not null
      and new.provider_request_sha256 is distinct from old.provider_request_sha256 then
      raise exception 'Flight provider request evidence is immutable after binding';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'created' and new.status in ('searching', 'failed', 'expired'))
      or (old.status = 'searching' and new.status in ('complete', 'failed', 'expired'))
      or (old.status = 'complete' and new.status = 'expired')
    ) then
      raise exception 'Invalid flight search status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_offers' then
    if v_new - 'status' is distinct from v_old - 'status' then
      raise exception 'Flight offer price, provider, and itinerary evidence are immutable';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'offered' and new.status in ('expired', 'replaced')) then
      raise exception 'Invalid flight offer status transition from % to %', old.status, new.status;
    end if;
  elsif tg_table_name = 'flight_orders' then
    if v_new - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ] is distinct from v_old - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ] then
      raise exception 'Flight order identity, customer, and commercial evidence are immutable';
    end if;
    if old.ticketing_deadline_at is not null
      and new.ticketing_deadline_at is distinct from old.ticketing_deadline_at then
      raise exception 'Flight ticketing deadline is immutable after binding';
    end if;
    if old.provider_order_ref_sha256 is null
      and new.provider_order_ref_sha256 is not null
      and not (
        old.status = 'order_creating'
        and new.status = 'booked'
        and new.provider_order_ref_ciphertext is not null
        and new.provider_created_at is not null
        and new.ticketing_deadline_at is not null
      ) then
      raise exception 'Flight provider order identity must bind atomically when the order is booked';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_passenger_refs' then
    if v_new - array['provider_passenger_ref_ciphertext', 'provider_passenger_ref_sha256']
      is distinct from v_old - array[
        'provider_passenger_ref_ciphertext', 'provider_passenger_ref_sha256'
      ] then
      raise exception 'Flight passenger linkage and minimized PII evidence are immutable';
    end if;
    if old.provider_passenger_ref_sha256 is not null
      and (
        new.provider_passenger_ref_sha256 is distinct from old.provider_passenger_ref_sha256
        or new.provider_passenger_ref_ciphertext
          is distinct from old.provider_passenger_ref_ciphertext
      ) then
      raise exception 'Flight provider passenger identity is immutable after binding';
    end if;
  elsif tg_table_name = 'flight_ticket_documents' then
    if v_new - array[
      'document_ref_ciphertext', 'document_ref_sha256',
      'status', 'issued_at', 'voided_at', 'updated_at'
    ] is distinct from v_old - array[
      'document_ref_ciphertext', 'document_ref_sha256',
      'status', 'issued_at', 'voided_at', 'updated_at'
    ] then
      raise exception 'Flight ticket document identity and reference evidence are immutable';
    end if;
    if old.document_ref_sha256 is not null and (
      new.document_ref_sha256 is distinct from old.document_ref_sha256
      or new.document_ref_ciphertext is distinct from old.document_ref_ciphertext
    ) then
      raise exception 'Flight ticket provider identity is immutable after binding';
    end if;
    if old.issued_at is not null and new.issued_at is distinct from old.issued_at then
      raise exception 'Flight ticket issuance time is immutable after binding';
    end if;
    if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
      raise exception 'Flight ticket void time is immutable after binding';
    end if;
    if old.status = 'pending' and new.status = 'issued' then
      new.issued_at := clock_timestamp();
    elsif old.status = 'issued' and new.status = 'voided' then
      new.voided_at := clock_timestamp();
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'pending' and new.status in ('issued', 'failed'))
      or (old.status = 'issued' and new.status in ('voided', 'refunded'))
    ) then
      raise exception 'Invalid flight ticket status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_payments' then
    if v_new - array[
      'authorized_cents', 'captured_cents', 'refunded_cents', 'status',
      'authorized_at', 'captured_at', 'updated_at'
    ] is distinct from v_old - array[
      'authorized_cents', 'captured_cents', 'refunded_cents', 'status',
      'authorized_at', 'captured_at', 'updated_at'
    ] then
      raise exception 'Flight payment processor, idempotency, and order evidence are immutable';
    end if;
    if (old.authorized_cents > 0 and new.authorized_cents <> old.authorized_cents)
      or new.authorized_cents < old.authorized_cents
      or new.captured_cents < old.captured_cents
      or new.refunded_cents < old.refunded_cents then
      raise exception 'Flight payment monetary evidence cannot decrease or be rewritten';
    end if;
    if old.authorized_at is not null and new.authorized_at is distinct from old.authorized_at then
      raise exception 'Flight payment authorization time is immutable after binding';
    end if;
    if old.captured_at is not null and new.captured_at is distinct from old.captured_at then
      raise exception 'Flight payment capture time is immutable after binding';
    end if;
    if old.authorized_cents = 0 and new.authorized_cents > 0 then
      new.authorized_at := clock_timestamp();
    end if;
    if old.captured_cents = 0 and new.captured_cents > 0 then
      new.captured_at := clock_timestamp();
    end if;
    if old.status = 'ambiguous'
      and new.status is distinct from old.status
      and not exists (
        select 1
          from public.flight_orders as payment_order
          join public.flight_reconciliation_cases as reconciliation
            on reconciliation.order_id = payment_order.id
          join public.profiles as resolver on resolver.id = reconciliation.resolved_by
         where payment_order.id = new.order_id
           and payment_order.execution_mode = new.execution_mode
           and payment_order.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.execution_mode = new.execution_mode
           and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.provider_code = payment_order.provider_code
           and reconciliation.case_type = case
             when new.status in ('refund_pending', 'partially_refunded', 'refunded')
               then 'refund_mismatch'
             else 'payment_order_mismatch'
           end
           and reconciliation.subject_type = 'flight_payment'
           and reconciliation.subject_id = new.id
           and reconciliation.source_status = old.status
           and reconciliation.source_revision_at = old.updated_at
           and reconciliation.target_status = new.status
           and reconciliation.target_authorized_cents = new.authorized_cents
           and reconciliation.target_captured_cents = new.captured_cents
           and reconciliation.target_refunded_cents = new.refunded_cents
           and reconciliation.target_state_sha256 = encode(
             extensions.digest(
               convert_to(jsonb_build_object(
                 'domain', 'iratepilot.flight.reconciliation.target.v1',
                 'subject_type', 'flight_payment',
                 'subject_id', new.id::text,
                 'target_status', new.status,
                 'target_authorized_cents', new.authorized_cents,
                 'target_captured_cents', new.captured_cents,
                 'target_refunded_cents', new.refunded_cents,
                 'execution_mode', new.execution_mode,
                 'execution_scope_sha256', new.execution_scope_sha256
               )::text, 'UTF8'),
               'sha256'
             ),
             'hex'
           )
           and reconciliation.status = 'resolved'
           and reconciliation.resolution_evidence_sha256 is not null
           and reconciliation.resolved_at >= old.updated_at
           and resolver.role = 'admin'
      ) then
      raise exception 'Resolved payment reconciliation evidence is required after ambiguity';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'requires_payment_method'
        and new.status in ('requires_action', 'authorized', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'requires_action'
        and new.status in ('authorized', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'authorized'
        and new.status in ('captured', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'captured'
        and new.status in ('refund_pending', 'ambiguous'))
      or (old.status = 'refund_pending'
        and new.status in ('partially_refunded', 'refunded', 'ambiguous'))
      or (old.status = 'partially_refunded'
        and new.status in ('refund_pending', 'ambiguous'))
      or (old.status = 'ambiguous'
        and new.status in (
          'authorized', 'captured', 'refund_pending', 'partially_refunded',
          'refunded', 'cancelled', 'failed'
        ))
    ) then
      raise exception 'Invalid flight payment status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_service_requests' then
    if v_new - array[
      'status', 'provider_case_ref_ciphertext', 'provider_case_ref_sha256', 'updated_at'
    ] is distinct from v_old - array[
      'status', 'provider_case_ref_ciphertext', 'provider_case_ref_sha256', 'updated_at'
    ] then
      raise exception 'Flight service request, actor, and reason evidence are immutable';
    end if;
    if old.provider_case_ref_sha256 is not null
      and (
        new.provider_case_ref_sha256 is distinct from old.provider_case_ref_sha256
        or new.provider_case_ref_ciphertext is distinct from old.provider_case_ref_ciphertext
      ) then
      raise exception 'Flight provider service identity is immutable after binding';
    end if;
    if old.status = 'requires_review'
      and new.status is distinct from old.status
      and not exists (
        select 1
          from public.flight_orders as service_order
          join public.flight_reconciliation_cases as reconciliation
            on reconciliation.order_id = service_order.id
          join public.profiles as resolver on resolver.id = reconciliation.resolved_by
         where service_order.id = new.order_id
           and service_order.execution_mode = new.execution_mode
           and service_order.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.execution_mode = new.execution_mode
           and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.provider_code = service_order.provider_code
           and reconciliation.case_type = 'servicing_mismatch'
           and reconciliation.subject_type = 'flight_service_request'
           and reconciliation.subject_id = new.id
           and reconciliation.source_status = old.status
           and reconciliation.source_revision_at = old.updated_at
           and reconciliation.target_status = new.status
           and reconciliation.target_state_sha256 = encode(
             extensions.digest(
               convert_to(jsonb_build_object(
                 'domain', 'iratepilot.flight.reconciliation.target.v1',
                 'subject_type', 'flight_service_request',
                 'subject_id', new.id::text,
                 'target_status', new.status,
                 'execution_mode', new.execution_mode,
                 'execution_scope_sha256', new.execution_scope_sha256
               )::text, 'UTF8'),
               'sha256'
             ),
             'hex'
           )
           and reconciliation.status = 'resolved'
           and reconciliation.resolution_evidence_sha256 is not null
           and reconciliation.resolved_at >= old.updated_at
           and resolver.role = 'admin'
      ) then
      raise exception 'Resolved servicing reconciliation evidence is required after review';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'requested'
        and new.status in ('quoted', 'accepted', 'declined', 'failed', 'requires_review'))
      or (old.status = 'quoted'
        and new.status in ('accepted', 'declined', 'failed', 'requires_review'))
      or (old.status = 'accepted'
        and new.status in ('processing', 'declined', 'failed', 'requires_review'))
      or (old.status = 'processing'
        and new.status in ('completed', 'failed', 'requires_review'))
      or (old.status = 'requires_review'
        and new.status in ('accepted', 'processing', 'completed', 'declined', 'failed'))
    ) then
      raise exception 'Invalid flight service status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_provider_events' then
    if v_new - array['signature_verified', 'processing_status', 'processed_at']
      is distinct from v_old - array['signature_verified', 'processing_status', 'processed_at'] then
      raise exception 'Flight provider event identity and payload digest are immutable';
    end if;
    if old.signature_verified and not new.signature_verified then
      raise exception 'Flight provider signature evidence cannot be revoked';
    end if;
    if old.processed_at is not null and new.processed_at is distinct from old.processed_at then
      raise exception 'Flight provider event processing time is immutable after binding';
    end if;
    if old.processing_status <> 'processed' and new.processing_status = 'processed' then
      new.processed_at := clock_timestamp();
    end if;
    if new.processing_status is distinct from old.processing_status and not (
      (old.processing_status = 'received'
        and new.processing_status in ('verified', 'duplicate', 'blocked', 'failed'))
      or (old.processing_status = 'verified'
        and new.processing_status in ('processed', 'duplicate', 'blocked', 'failed'))
    ) then
      raise exception 'Invalid flight provider-event transition from % to %',
        old.processing_status, new.processing_status;
    end if;
  elsif tg_table_name = 'flight_idempotency_records' then
    if v_new - array[
      'response_sha256', 'resource_type', 'resource_id', 'status', 'locked_until', 'updated_at'
    ] is distinct from v_old - array[
      'response_sha256', 'resource_type', 'resource_id', 'status', 'locked_until', 'updated_at'
    ] then
      raise exception 'Flight idempotency key, request, scope, and mode are immutable';
    end if;
    if (old.response_sha256 is not null
      and new.response_sha256 is distinct from old.response_sha256)
      or (old.resource_id is not null and (
        new.resource_id is distinct from old.resource_id
        or new.resource_type is distinct from old.resource_type
      )) then
      raise exception 'Flight idempotency result evidence is immutable after binding';
    end if;
    if new.locked_until < old.locked_until then
      raise exception 'Flight idempotency lock evidence cannot move backwards';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'in_progress'
        and new.status in ('succeeded', 'failed', 'ambiguous')) then
      raise exception 'Invalid flight idempotency transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_reconciliation_cases' then
    if v_new - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] is distinct from v_old - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] then
      raise exception 'Flight reconciliation identity and observed evidence are immutable';
    end if;
    if old.resolution_evidence_sha256 is not null and (
      new.resolution_evidence_sha256 is distinct from old.resolution_evidence_sha256
      or new.resolution_code is distinct from old.resolution_code
      or new.resolved_by is distinct from old.resolved_by
      or new.resolved_at is distinct from old.resolved_at
    ) then
      raise exception 'Flight reconciliation resolution evidence is immutable after binding';
    end if;
    if old.status <> 'resolved' and new.status = 'resolved' then
      new.resolved_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status in ('investigating', 'blocked', 'resolved'))
      or (old.status = 'investigating' and new.status in ('blocked', 'resolved'))
      or (old.status = 'blocked' and new.status in ('investigating', 'resolved'))
    ) then
      raise exception 'Invalid flight reconciliation transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    raise exception 'Unsupported flight evidence relation %', tg_table_name;
  end if;
  return new;
end;
$$;

create or replace function public.reject_flight_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Append-only flight evidence cannot be updated or deleted';
end;
$$;

revoke all on function public.protect_flight_runtime_controls()
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_runtime_control_receipt()
  from public, anon, authenticated, service_role;
revoke all on function public.flight_runtime_capability_enabled(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.enforce_flight_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.enforce_flight_order_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.enforce_flight_evidence_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.lock_flight_order_parent()
  from public, anon, authenticated;
revoke all on function public.validate_flight_idempotency_resource()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_offer_snapshot()
  from public, anon, authenticated;
revoke all on function public.validate_flight_offer_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_reprice_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_child_mode()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_transition()
  from public, anon, authenticated;
revoke all on function public.protect_flight_reprice_evidence()
  from public, anon, authenticated;
revoke all on function public.protect_flight_operational_evidence()
  from public, anon, authenticated;
revoke all on function public.reject_flight_evidence_mutation()
  from public, anon, authenticated, service_role;
grant execute on function public.flight_runtime_capability_enabled(text, text, text, text, text)
  to service_role;
grant execute on function public.enforce_flight_runtime_capability() to service_role;
grant execute on function public.enforce_flight_order_runtime_capability() to service_role;
grant execute on function public.enforce_flight_evidence_runtime_capability() to service_role;
grant execute on function public.lock_flight_order_parent() to service_role;
grant execute on function public.validate_flight_idempotency_resource() to service_role;
grant execute on function public.validate_flight_order_chain() to service_role;
grant execute on function public.validate_flight_offer_snapshot() to service_role;
grant execute on function public.validate_flight_offer_chain() to service_role;
grant execute on function public.validate_flight_reprice_chain() to service_role;
grant execute on function public.validate_flight_order_child_mode() to service_role;
grant execute on function public.validate_flight_order_transition() to service_role;
grant execute on function public.protect_flight_reprice_evidence() to service_role;
grant execute on function public.protect_flight_operational_evidence() to service_role;

create trigger flight_searches_runtime_guard
before insert or update on public.flight_searches
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_searches_immutable_guard
before insert or update on public.flight_searches
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_offers_runtime_guard
before insert or update on public.flight_offers
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offers_immutable_guard
before insert or update on public.flight_offers
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_offers_evidence_guard
before insert or update of search_id, execution_mode, execution_scope_sha256, expires_at
on public.flight_offers
for each row execute function public.validate_flight_offer_chain();
create trigger flight_offer_segments_runtime_guard
before insert on public.flight_offer_segments
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offer_segments_evidence_guard
before insert on public.flight_offer_segments
for each row execute function public.validate_flight_offer_snapshot();
create trigger flight_offer_segments_append_only_guard
before update or delete on public.flight_offer_segments
for each row execute function public.reject_flight_evidence_mutation();
create trigger flight_offer_fare_terms_runtime_guard
before insert on public.flight_offer_fare_terms
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offer_fare_terms_evidence_guard
before insert on public.flight_offer_fare_terms
for each row execute function public.validate_flight_offer_snapshot();
create trigger flight_offer_fare_terms_append_only_guard
before update or delete on public.flight_offer_fare_terms
for each row execute function public.reject_flight_evidence_mutation();
create trigger flight_reprice_receipts_runtime_guard
before insert or update on public.flight_reprice_receipts
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_reprice_receipts_evidence_guard
before insert or update of offer_id, execution_mode, execution_scope_sha256,
  currency, original_total_cents, expires_at
on public.flight_reprice_receipts
for each row execute function public.validate_flight_reprice_chain();
create trigger flight_reprice_receipts_immutable_guard
before insert or update on public.flight_reprice_receipts
for each row execute function public.protect_flight_reprice_evidence();
create trigger flight_orders_runtime_guard
before insert or update on public.flight_orders
for each row execute function public.enforce_flight_order_runtime_capability();
create trigger flight_orders_evidence_guard
before insert or update of customer_id, search_id, offer_id, reprice_receipt_id,
  execution_mode, provider_code, provider_order_ref_ciphertext,
  execution_scope_sha256, provider_order_ref_sha256, provider_created_at,
  currency, total_cents, status
on public.flight_orders
for each row execute function public.validate_flight_order_chain();
create trigger flight_orders_immutable_guard
before insert or update on public.flight_orders
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_orders_transition_guard
before insert or update of status on public.flight_orders
for each row execute function public.validate_flight_order_transition();
create trigger flight_passenger_refs_00_parent_lock_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.lock_flight_order_parent();
create trigger flight_passenger_refs_runtime_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.enforce_flight_runtime_capability('order');
create trigger flight_passenger_refs_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  traveler_sequence, traveler_type,
  secure_pii_record_ref, pii_record_sha256, provider_passenger_ref_ciphertext,
  provider_passenger_ref_sha256, retention_expires_at
on public.flight_passenger_refs
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_passenger_refs_immutable_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_ticket_documents_00_parent_lock_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.lock_flight_order_parent();
create trigger flight_ticket_documents_runtime_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.enforce_flight_runtime_capability('ticketing');
create trigger flight_ticket_documents_order_mode_guard
before insert or update of order_id, passenger_ref_id, execution_mode,
  execution_scope_sha256, document_type,
  document_ref_ciphertext, document_ref_sha256, issuing_carrier, status, issued_at, voided_at
on public.flight_ticket_documents
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_ticket_documents_immutable_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_payments_00_parent_lock_guard
before insert or update on public.flight_payments
for each row execute function public.lock_flight_order_parent();
create trigger flight_payments_runtime_guard
before insert or update on public.flight_payments
for each row execute function public.enforce_flight_runtime_capability('payment');
create trigger flight_payments_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256, processor_code,
  processor_reference_ciphertext, processor_reference_sha256,
  idempotency_key_sha256, currency, authorized_cents,
  captured_cents, refunded_cents, status, authorized_at, captured_at
on public.flight_payments
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_payments_immutable_guard
before insert or update on public.flight_payments
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_service_requests_00_parent_lock_guard
before insert or update on public.flight_service_requests
for each row execute function public.lock_flight_order_parent();
create trigger flight_service_requests_runtime_guard
before insert or update on public.flight_service_requests
for each row execute function public.enforce_flight_runtime_capability('servicing');
create trigger flight_service_requests_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  requested_by, request_type,
  reason_code, secure_request_ref, request_sha256, status,
  provider_case_ref_ciphertext, provider_case_ref_sha256
on public.flight_service_requests
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_service_requests_immutable_guard
before insert or update on public.flight_service_requests
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_provider_events_00_parent_lock_guard
before insert or update on public.flight_provider_events
for each row execute function public.lock_flight_order_parent();
create trigger flight_provider_events_runtime_guard
before insert or update on public.flight_provider_events
for each row execute function public.enforce_flight_runtime_capability('provider_event');
create trigger flight_provider_events_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256, provider_code,
  provider_event_id_sha256, event_type, payload_sha256,
  signature_verified, processing_status, occurred_at, processed_at
on public.flight_provider_events
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_provider_events_immutable_guard
before insert or update on public.flight_provider_events
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_reconciliation_cases_00_parent_lock_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.lock_flight_order_parent();
create trigger flight_reconciliation_cases_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  provider_code, case_type, subject_type, subject_id,
  source_status, source_revision_at,
  expected_state_sha256, observed_state_sha256,
  target_status, target_authorized_cents, target_captured_cents,
  target_refunded_cents, target_state_sha256, status,
  resolution_code, resolution_evidence_sha256, resolved_by, resolved_at
on public.flight_reconciliation_cases
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_idempotency_records_runtime_guard
before insert or update on public.flight_idempotency_records
for each row execute function public.enforce_flight_evidence_runtime_capability();
create trigger flight_idempotency_records_resource_guard
before insert or update of scope, execution_mode, execution_scope_sha256,
  key_sha256, request_sha256,
  response_sha256, resource_type, resource_id, status, locked_until
on public.flight_idempotency_records
for each row execute function public.validate_flight_idempotency_resource();
create trigger flight_idempotency_records_immutable_guard
before insert or update on public.flight_idempotency_records
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_reconciliation_cases_runtime_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.enforce_flight_evidence_runtime_capability();
create trigger flight_reconciliation_cases_immutable_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_runtime_control_receipts_append_only_guard
before update or delete on public.flight_runtime_control_receipts
for each row execute function public.reject_flight_evidence_mutation();

alter table public.flight_runtime_controls enable row level security;
alter table public.flight_runtime_controls force row level security;
alter table public.flight_runtime_control_receipts enable row level security;
alter table public.flight_runtime_control_receipts force row level security;
alter table public.flight_searches enable row level security;
alter table public.flight_searches force row level security;
alter table public.flight_offers enable row level security;
alter table public.flight_offers force row level security;
alter table public.flight_offer_segments enable row level security;
alter table public.flight_offer_segments force row level security;
alter table public.flight_offer_fare_terms enable row level security;
alter table public.flight_offer_fare_terms force row level security;
alter table public.flight_reprice_receipts enable row level security;
alter table public.flight_reprice_receipts force row level security;
alter table public.flight_orders enable row level security;
alter table public.flight_orders force row level security;
alter table public.flight_passenger_refs enable row level security;
alter table public.flight_passenger_refs force row level security;
alter table public.flight_ticket_documents enable row level security;
alter table public.flight_ticket_documents force row level security;
alter table public.flight_payments enable row level security;
alter table public.flight_payments force row level security;
alter table public.flight_service_requests enable row level security;
alter table public.flight_service_requests force row level security;
alter table public.flight_provider_events enable row level security;
alter table public.flight_provider_events force row level security;
alter table public.flight_idempotency_records enable row level security;
alter table public.flight_idempotency_records force row level security;
alter table public.flight_reconciliation_cases enable row level security;
alter table public.flight_reconciliation_cases force row level security;

revoke all on table
  public.flight_runtime_controls,
  public.flight_runtime_control_receipts,
  public.flight_searches,
  public.flight_offers,
  public.flight_offer_segments,
  public.flight_offer_fare_terms,
  public.flight_reprice_receipts,
  public.flight_orders,
  public.flight_passenger_refs,
  public.flight_ticket_documents,
  public.flight_payments,
  public.flight_service_requests,
  public.flight_provider_events,
  public.flight_idempotency_records,
  public.flight_reconciliation_cases
from public, anon, authenticated, service_role;

grant select on table public.flight_runtime_controls to service_role;
grant select on table public.flight_runtime_control_receipts to service_role;
grant select, update on table public.flight_runtime_controls to authenticated;
grant select on table public.flight_runtime_control_receipts to authenticated;
grant select, insert on table
  public.flight_offer_segments,
  public.flight_offer_fare_terms
to service_role;
grant select, insert, update on table
  public.flight_searches,
  public.flight_offers,
  public.flight_reprice_receipts,
  public.flight_orders,
  public.flight_passenger_refs,
  public.flight_ticket_documents,
  public.flight_payments,
  public.flight_service_requests,
  public.flight_provider_events,
  public.flight_idempotency_records,
  public.flight_reconciliation_cases
to service_role;

grant select on table public.flight_searches to authenticated;
grant select (
  id, search_id, provider_code, execution_mode, currency, base_fare_cents,
  tax_cents, fee_cents, total_cents, validating_carrier, segment_count,
  itinerary_sha256, fare_rules_sha256, status, expires_at, created_at
) on public.flight_offers to authenticated;
grant select on table
  public.flight_offer_segments,
  public.flight_offer_fare_terms
to authenticated;
grant select (
  id, offer_id, execution_mode, currency, original_total_cents,
  repriced_total_cents, status, customer_accepted_at, customer_accepted_by,
  customer_acceptance_version, customer_accepted_currency, customer_accepted_total_cents,
  expires_at, created_at
) on public.flight_reprice_receipts to authenticated;
grant update (
  customer_accepted_at, customer_accepted_by,
  customer_accepted_currency, customer_accepted_total_cents
) on public.flight_reprice_receipts to authenticated;
grant select (
  id, customer_id, search_id, offer_id, reprice_receipt_id, confirmation_code,
  execution_mode, provider_code, currency, total_cents, status,
  provider_created_at, ticketing_deadline_at, created_at, updated_at
) on public.flight_orders to authenticated;
grant select (
  id, order_id, passenger_ref_id, execution_mode, document_type,
  issuing_carrier, status, issued_at, voided_at, created_at, updated_at
) on public.flight_ticket_documents to authenticated;
grant select (
  id, order_id, execution_mode, processor_code, currency, authorized_cents,
  captured_cents, refunded_cents, status, authorized_at, captured_at,
  created_at, updated_at
) on public.flight_payments to authenticated;
grant select (
  id, order_id, requested_by, execution_mode, request_type, reason_code,
  status, created_at, updated_at
) on public.flight_service_requests to authenticated;
grant select on table public.flight_reconciliation_cases to authenticated;
grant update (
  status, resolution_code, resolution_evidence_sha256,
  resolved_by, resolved_at, updated_at
) on public.flight_reconciliation_cases to authenticated;

create policy "Flight admins read runtime controls"
on public.flight_runtime_controls for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins update runtime controls"
on public.flight_runtime_controls for update to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
))
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.profiles
     where profiles.id = auth.uid()
       and profiles.role = 'admin'
  )
);

create policy "Flight admins read runtime control receipts"
on public.flight_runtime_control_receipts for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins read flight reconciliation"
on public.flight_reconciliation_cases for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins resolve flight reconciliation"
on public.flight_reconciliation_cases for update to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
))
with check (
  resolved_by is null
  or (
    resolved_by = auth.uid()
    and exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = 'admin'
    )
  )
);

create policy "Customers read own flight searches"
on public.flight_searches for select to authenticated
using (customer_id = auth.uid());

create policy "Customers read own flight offers"
on public.flight_offers for select to authenticated
using (exists (
  select 1 from public.flight_searches
  where flight_searches.id = flight_offers.search_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight offer segments"
on public.flight_offer_segments for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_offer_segments.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight fare terms"
on public.flight_offer_fare_terms for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_offer_fare_terms.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight reprice receipts"
on public.flight_reprice_receipts for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_reprice_receipts.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers accept own changed flight price"
on public.flight_reprice_receipts for update to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_reprice_receipts.offer_id
    and flight_searches.customer_id = auth.uid()
))
with check (
  customer_accepted_by = auth.uid()
  and exists (
    select 1
    from public.flight_offers
    join public.flight_searches on flight_searches.id = flight_offers.search_id
    where flight_offers.id = flight_reprice_receipts.offer_id
      and flight_searches.customer_id = auth.uid()
  )
);

create policy "Customers read own flight orders"
on public.flight_orders for select to authenticated
using (customer_id = auth.uid());

create policy "Customers read own flight tickets"
on public.flight_ticket_documents for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_ticket_documents.order_id
    and flight_orders.customer_id = auth.uid()
));

create policy "Customers read own flight payments"
on public.flight_payments for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_payments.order_id
    and flight_orders.customer_id = auth.uid()
));

create policy "Customers read own flight service requests"
on public.flight_service_requests for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_service_requests.order_id
    and flight_orders.customer_id = auth.uid()
));

comment on table public.flight_runtime_controls is
  'Fail-closed database activation controls; all external flight capabilities start disabled.';
comment on table public.flight_runtime_control_receipts is
  'Append-only administrator-attributed runtime-control changes; never credentials or raw payloads.';
comment on table public.flight_searches is
  'Sanitized flight shopping criteria; never passenger names, contacts, or identity documents.';
comment on table public.flight_offers is
  'Normalized flight offers with encrypted provider references and payload digests only.';
comment on table public.flight_offer_segments is
  'Immutable normalized non-PII itinerary legs retained for confirmations, trips, and servicing.';
comment on table public.flight_offer_fare_terms is
  'Immutable normalized non-PII fare and baggage terms bound to an offer digest.';
comment on table public.flight_reprice_receipts is
  'Immutable-at-application reprice evidence bound to a single offer and customer acceptance.';
comment on table public.flight_passenger_refs is
  'References to separately protected passenger PII; this table must never contain raw PII or documents.';
comment on table public.flight_payments is
  'Payment lifecycle metadata and encrypted processor references; never PAN, CVC, or client secrets.';
comment on table public.flight_provider_events is
  'Verified airline/content-provider event metadata and payload digests only; payment-processor and raw webhook payloads are not stored.';
comment on table public.flight_idempotency_records is
  'SHA-256 idempotency receipts; raw idempotency keys are never persisted.';
comment on table public.flight_reconciliation_cases is
  'Digest-bound discrepancy cases without raw provider, passenger, payment, or credential payloads.';

commit;


-- Mirrored from migrations/202608240069_flight_provider_request_attempts.sql.
begin;

-- Default-off database foundation only. This migration does not enable flight
-- execution, authorize provider traffic, read credentials, or dispatch requests.
do $$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_runtime_control_receipts') is null
    or to_regprocedure(
      'public.flight_runtime_capability_enabled(text,text,text,text,text)'
    ) is null then
    raise exception 'Flight provider request attempts require migration 068';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight provider request attempts require reviewed SHA-256 support';
  end if;
end;
$$;

create table public.flight_provider_request_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null
    check (tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  commerce_id text not null
    check (commerce_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  operation text not null check (operation in (
    'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'
  )),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null check (execution_mode in ('test', 'live')),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  activation_evidence_sha256 text not null
    check (activation_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_version_sha256 text not null
    check (adapter_version_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_source_sha256 text not null
    check (adapter_source_sha256 ~ '^[0-9a-f]{64}$'),
  provider_account_sha256 text not null
    check (provider_account_sha256 ~ '^[0-9a-f]{64}$'),
  point_of_sale_sha256 text not null
    check (point_of_sale_sha256 ~ '^[0-9a-f]{64}$'),
  content_scope_sha256 text not null
    check (content_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_binding_receipt_sha256 text not null
    check (provider_binding_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  request_plan_sha256 text not null
    check (request_plan_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null
    check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  operation_authority_receipt_sha256 text not null
    check (operation_authority_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  dispatch_not_after timestamptz not null,
  state text not null default 'prepared'
    check (state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked')),
  revision integer not null default 0 check (revision >= 0),
  retry_authorized boolean not null default false check (retry_authorized = false),
  prepared_at timestamptz not null default clock_timestamp(),
  dispatch_started_at timestamptz,
  completed_at timestamptz,
  terminal_http_status smallint
    check (terminal_http_status is null or terminal_http_status between 100 and 599),
  terminal_response_sha256 text
    check (
      terminal_response_sha256 is null
      or terminal_response_sha256 ~ '^[0-9a-f]{64}$'
    ),
  terminal_response_bytes bigint
    check (
      terminal_response_bytes is null
      or terminal_response_bytes between 0 and 1048576
    ),
  terminal_receipt_sha256 text
    check (
      terminal_receipt_sha256 is null
      or terminal_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  check (dispatch_not_after > prepared_at),
  check (
    (state = 'prepared'
      and revision = 0
      and dispatch_started_at is null
      and completed_at is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is null)
    or
    (state = 'dispatching'
      and revision = 1
      and dispatch_started_at is not null
      and completed_at is null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is null)
    or
    (state = 'blocked'
      and revision = 1
      and dispatch_started_at is null
      and completed_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'succeeded'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status between 200 and 299
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'failed'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status between 300 and 599
      and terminal_response_sha256 is not null
      and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or
    (state = 'ambiguous'
      and revision = 2
      and dispatch_started_at is not null
      and completed_at is not null
      and terminal_http_status is null
      and terminal_response_sha256 is null
      and terminal_response_bytes is null
      and terminal_receipt_sha256 is not null)
  ),
  check (dispatch_started_at is null or dispatch_started_at >= prepared_at),
  check (completed_at is null or completed_at >= prepared_at),
  check (
    completed_at is null
    or dispatch_started_at is null
    or completed_at >= dispatch_started_at
  )
);

-- Current transport operations are shopping-only. Exact request identity is
-- unique within the same commerce and execution identity; no retry is implied.
create unique index flight_provider_request_attempts_request_uidx
  on public.flight_provider_request_attempts (
    tenant_id, commerce_id, provider_account_sha256, execution_mode,
    provider_code, operation, request_sha256
  );

create index flight_provider_request_attempts_state_idx
  on public.flight_provider_request_attempts (state, prepared_at);

create function public.protect_flight_provider_request_attempt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight provider request-attempt evidence is append-preserving';
  end if;

  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.commerce_id is distinct from old.commerce_id
    or new.operation is distinct from old.operation
    or new.provider_code is distinct from old.provider_code
    or new.execution_mode is distinct from old.execution_mode
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.activation_evidence_sha256 is distinct from old.activation_evidence_sha256
    or new.adapter_version_sha256 is distinct from old.adapter_version_sha256
    or new.adapter_source_sha256 is distinct from old.adapter_source_sha256
    or new.provider_account_sha256 is distinct from old.provider_account_sha256
    or new.point_of_sale_sha256 is distinct from old.point_of_sale_sha256
    or new.content_scope_sha256 is distinct from old.content_scope_sha256
    or new.provider_binding_receipt_sha256 is distinct from old.provider_binding_receipt_sha256
    or new.request_plan_sha256 is distinct from old.request_plan_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.operation_authority_receipt_sha256
      is distinct from old.operation_authority_receipt_sha256
    or new.dispatch_not_after is distinct from old.dispatch_not_after
    or new.retry_authorized is distinct from old.retry_authorized
    or new.prepared_at is distinct from old.prepared_at then
    raise exception 'Flight provider request-attempt identity is immutable';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Flight provider request-attempt revision must advance by exact CAS';
  end if;

  if old.state = 'prepared' and new.state = 'dispatching' then
    if new.dispatch_started_at is null
      or new.completed_at is not null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is not null then
      raise exception 'Prepared-to-dispatching transition evidence is malformed';
    end if;
    return new;
  end if;

  if old.state = 'prepared' and new.state = 'blocked' then
    if new.dispatch_started_at is not null
      or new.completed_at is null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Prepared-to-blocked transition evidence is malformed';
    end if;
    return new;
  end if;

  if old.state = 'dispatching'
    and new.state in ('succeeded', 'failed', 'ambiguous') then
    if new.dispatch_started_at is distinct from old.dispatch_started_at
      or new.completed_at is null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Dispatch terminal transition evidence is malformed';
    end if;
    return new;
  end if;

  raise exception 'Flight provider request-attempt transition is not authorized';
end;
$$;

create trigger flight_provider_request_attempts_transition_guard
before update or delete on public.flight_provider_request_attempts
for each row execute function public.protect_flight_provider_request_attempt();

create function public.prepare_flight_provider_request_attempt(
  p_tenant_id text,
  p_commerce_id text,
  p_operation text,
  p_provider_code text,
  p_execution_mode text,
  p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_account_sha256 text,
  p_point_of_sale_sha256 text,
  p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_capability text;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request-attempt preparation is service-role only';
  end if;

  if p_operation = 'create_order' then
    raise exception 'Flight create_order HTTP dispatch requires a later durable authority migration';
  end if;
  v_capability := case p_operation
    when 'create_offer_request' then 'shopping'
    when 'retrieve_offer' then 'shopping'
    when 'list_orders_by_offer' then 'shopping'
    else null
  end;
  if v_capability is null then
    raise exception 'Flight provider HTTP operation is not allowlisted';
  end if;
  if p_execution_mode not in ('test', 'live') then
    raise exception 'Flight provider HTTP execution mode must be test or live';
  end if;
  -- The global control row is locked in the same transaction as preparation.
  -- The runtime helper also validates its administrator receipt and session,
  -- project, database, environment, and production bindings.
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    p_execution_mode,
    v_capability,
    p_provider_code,
    null,
    p_execution_scope_sha256
  ) then
    raise exception 'Flight provider runtime capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from p_activation_evidence_sha256
    or v_control.bound_provider_code is distinct from p_provider_code
    or v_control.bound_execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from p_adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from p_provider_account_sha256
    or v_point_of_sale_sha256 is distinct from p_point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from p_content_scope_sha256 then
    raise exception 'Flight provider request binding does not match the locked runtime control';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from p_adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from p_provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from p_operation_authority_receipt_sha256 then
    raise exception 'Flight provider opaque receipt digests are not exactly session-bound';
  end if;

  -- Read the trusted database clock only after all potentially blocking locks.
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight provider request dispatch deadline is invalid';
  end if;

  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at
  ) values (
    p_tenant_id, p_commerce_id, p_operation, p_provider_code, p_execution_mode,
    p_execution_scope_sha256, p_activation_evidence_sha256,
    p_adapter_version_sha256, p_adapter_source_sha256,
    p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
    p_provider_binding_receipt_sha256,
    p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
    p_operation_authority_receipt_sha256, p_dispatch_not_after,
    'prepared', 0, false, v_now
  )
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Flight provider request identity already has an attempt; retry is not authorized';
end;
$$;

create function public.claim_flight_provider_request_attempt_for_dispatch(
  p_attempt_id uuid,
  p_expected_revision integer
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_capability text;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request dispatch claim is service-role only';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight provider request dispatch CAS failed';
  end if;
  v_capability := case v_attempt.operation
    when 'create_offer_request' then 'shopping'
    when 'retrieve_offer' then 'shopping'
    when 'list_orders_by_offer' then 'shopping'
    else null
  end;
  if v_capability is null then
    raise exception 'Flight provider HTTP operation is not allowlisted';
  end if;

  -- The credential must already have been validated while this row remained
  -- prepared. This is the final database claim immediately before HTTP dispatch.
  -- A committed dispatch claim is the explicit in-flight boundary: a later
  -- kill-switch change cannot retroactively revoke that already-claimed attempt.
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    v_attempt.execution_mode,
    v_capability,
    v_attempt.provider_code,
    null,
    v_attempt.execution_scope_sha256
  ) then
    raise exception 'Flight provider runtime capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_provider_code is distinct from v_attempt.provider_code
    or v_control.bound_execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight provider request binding changed before dispatch';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from v_attempt.adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from v_attempt.provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from v_attempt.operation_authority_receipt_sha256 then
    raise exception 'Flight provider opaque receipt digests changed before dispatch';
  end if;

  -- Do not let time spent waiting on either row lock consume authority unseen.
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight provider request dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching',
         revision = revision + 1,
         dispatch_started_at = v_now
   where id = p_attempt_id
     and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight provider request dispatch CAS failed';
  end if;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

create function public.complete_flight_provider_request_attempt(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider request completion is service-role only';
  end if;
  if p_terminal_receipt_sha256 is null
    or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight provider request terminal receipt is required';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight provider request completion CAS failed';
  end if;

  if v_attempt.state = 'prepared' then
    if p_terminal_state <> 'blocked'
      or p_terminal_http_status is not null
      or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null then
      raise exception 'Only a never-dispatched prepared attempt may become blocked';
    end if;
  elsif v_attempt.state = 'dispatching' then
    if p_terminal_state not in ('succeeded', 'failed', 'ambiguous') then
      raise exception 'Dispatching attempt requires an exact terminal outcome';
    end if;
    if p_terminal_state = 'succeeded'
      and (
        p_terminal_http_status is null
        or p_terminal_http_status not between 200 and 299
        or p_terminal_response_sha256 is null
        or p_terminal_response_bytes is null
      ) then
      raise exception 'Successful provider response evidence is incomplete';
    end if;
    if p_terminal_state = 'failed' and p_terminal_http_status is null then
      raise exception 'Dispatched uncertainty must be recorded as ambiguous';
    end if;
    if p_terminal_state = 'failed'
      and (
        p_terminal_http_status not between 300 and 599
        or p_terminal_response_sha256 is null
        or p_terminal_response_bytes is null
      ) then
      raise exception 'Known provider failure response evidence is incomplete';
    end if;
    if p_terminal_state = 'ambiguous'
      and (
        p_terminal_http_status is not null
        or p_terminal_response_sha256 is not null
        or p_terminal_response_bytes is not null
      ) then
      raise exception 'Ambiguous provider dispatch cannot claim a response';
    end if;
  else
    raise exception 'Terminal flight provider request-attempt evidence is immutable';
  end if;

  v_now := clock_timestamp();
  update public.flight_provider_request_attempts
     set state = p_terminal_state,
         revision = revision + 1,
         completed_at = v_now,
         terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         terminal_receipt_sha256 = p_terminal_receipt_sha256
   where id = p_attempt_id
     and state = v_attempt.state
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight provider request completion CAS failed';
  end if;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

alter table public.flight_provider_request_attempts enable row level security;
alter table public.flight_provider_request_attempts force row level security;

revoke all on table public.flight_provider_request_attempts
  from public, anon, authenticated, service_role;
grant select on table public.flight_provider_request_attempts to service_role;

revoke all on function public.protect_flight_provider_request_attempt()
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer)
  to service_role;
grant execute on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) to service_role;

comment on table public.flight_provider_request_attempts is
  'Digest-only outbound flight HTTP attempt journal. No request/response bodies, URLs, credentials, PII, or provider resource identifiers.';
comment on column public.flight_provider_request_attempts.provider_binding_receipt_sha256 is
  'Opaque receipt digest exact-matched to the service session; this migration does not authenticate or mint it.';
comment on column public.flight_provider_request_attempts.operation_authority_receipt_sha256 is
  'Opaque operation-gate receipt digest exact-matched to the service session; this migration does not authenticate or mint it.';
comment on function public.prepare_flight_provider_request_attempt(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz
) is
  'Prepares one exact shopping request after locked runtime/provider and exact session-bound opaque receipt-digest rechecks; create_order and retries remain unauthorized.';
comment on function public.claim_flight_provider_request_attempt_for_dispatch(uuid, integer) is
  'Exact CAS claim after credential validation and immediately before HTTP dispatch; rechecks kill switch, bindings, opaque receipt digests, and expiry.';
comment on function public.complete_flight_provider_request_attempt(
  uuid, integer, text, smallint, text, bigint, text
) is
  'Records only digest-bound terminal evidence. Any uncertain dispatch must become ambiguous and cannot be retried here.';

commit;

-- Mirrored from migrations/202608250070_flight_duffel_test_order_attempts.sql.

begin;

-- Test-mode Duffel order dispatch only. This migration does not enable any
-- runtime capability, alter the kill switch, authorize Production, or permit
-- retries. It extends the immutable 069 journal with one exact operation.
do $$
begin
  if to_regclass('public.flight_provider_request_attempts') is null
    or to_regprocedure(
      'public.complete_flight_provider_request_attempt(uuid,integer,text,smallint,text,bigint,text)'
    ) is null then
    raise exception 'Duffel test order attempts require migration 069';
  end if;
end;
$$;

alter table public.flight_provider_request_attempts
  drop constraint flight_provider_request_attempts_operation_check;
alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_operation_check
  check (operation in (
    'create_offer_request', 'retrieve_offer', 'list_orders_by_offer', 'create_order'
  ));

create function public.prepare_flight_provider_order_attempt(
  p_tenant_id text,
  p_commerce_id text,
  p_provider_code text,
  p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_account_sha256 text,
  p_point_of_sale_sha256 text,
  p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider order-attempt preparation is service-role only';
  end if;
  if p_provider_code <> 'duffel' then
    raise exception 'Flight provider order attempt is restricted to Duffel test mode';
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    'test', 'order', p_provider_code, null, p_execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'payment', p_provider_code, 'duffel_balance', p_execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'ticketing', p_provider_code, null, p_execution_scope_sha256
  ) then
    raise exception 'Duffel test order, settlement, or ticketing capability is disabled';
  end if;

  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from p_activation_evidence_sha256
    or v_control.bound_environment <> 'preview'
    or v_control.bound_project_ref <> 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_provider_code is distinct from p_provider_code
    or v_control.bound_execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from p_adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from p_provider_account_sha256
    or v_point_of_sale_sha256 is distinct from p_point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from p_content_scope_sha256
    or v_control.bound_payment_processor_code <> 'duffel_balance'
    or v_control.bound_payment_environment <> 'test' then
    raise exception 'Duffel test order binding does not match the locked runtime control';
  end if;
  if current_setting('app.flight_adapter_source_sha256', true)
      is distinct from p_adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from p_provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from p_operation_authority_receipt_sha256 then
    raise exception 'Duffel test order opaque receipt digests are not exactly session-bound';
  end if;

  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Duffel test order dispatch deadline is invalid';
  end if;

  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at
  ) values (
    p_tenant_id, p_commerce_id, 'create_order', p_provider_code, 'test',
    p_execution_scope_sha256, p_activation_evidence_sha256,
    p_adapter_version_sha256, p_adapter_source_sha256,
    p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
    p_provider_binding_receipt_sha256,
    p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
    p_operation_authority_receipt_sha256, p_dispatch_not_after,
    'prepared', 0, false, v_now
  )
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Duffel test order request already has an attempt; retry is not authorized';
end;
$$;

create function public.claim_flight_provider_order_attempt_for_dispatch(
  p_attempt_id uuid,
  p_expected_revision integer
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider order dispatch claim is service-role only';
  end if;
  select * into v_attempt
    from public.flight_provider_request_attempts
   where id = p_attempt_id
   for update;
  if not found
    or v_attempt.operation <> 'create_order'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Duffel test order dispatch CAS failed';
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found or v_control.execution_kill_switch_engaged then
    raise exception 'Flight provider traffic is blocked by the runtime kill switch';
  end if;
  if not public.flight_runtime_capability_enabled(
    'test', 'order', 'duffel', null, v_attempt.execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'payment', 'duffel', 'duffel_balance', v_attempt.execution_scope_sha256
  ) or not public.flight_runtime_capability_enabled(
    'test', 'ticketing', 'duffel', null, v_attempt.execution_scope_sha256
  ) then
    raise exception 'Duffel test order capability changed before dispatch';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_control.activation_evidence_sha256 is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_environment <> 'preview'
    or v_control.bound_project_ref <> 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_provider_code is distinct from v_attempt.provider_code
    or v_control.bound_execution_scope_sha256 is distinct from v_attempt.execution_scope_sha256
    or v_control.bound_adapter_version_sha256 is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_provider_account_sha256 is distinct from v_attempt.provider_account_sha256
    or v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256
    or v_control.bound_content_scope_sha256 is distinct from v_attempt.content_scope_sha256
    or current_setting('app.flight_adapter_source_sha256', true)
      is distinct from v_attempt.adapter_source_sha256
    or current_setting('app.flight_provider_binding_receipt_sha256', true)
      is distinct from v_attempt.provider_binding_receipt_sha256
    or current_setting('app.flight_request_authority_receipt_sha256', true)
      is distinct from v_attempt.operation_authority_receipt_sha256 then
    raise exception 'Duffel test order binding changed before dispatch';
  end if;

  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Duffel test order dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching', revision = revision + 1, dispatch_started_at = v_now
   where id = p_attempt_id and state = 'prepared' and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Duffel test order dispatch CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$$;

revoke all on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer)
  to service_role;

comment on function public.prepare_flight_provider_order_attempt(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) is 'Prepares exactly one non-retryable Duffel test order attempt after order, settlement, ticketing, runtime, provider, and opaque receipt checks.';
comment on function public.claim_flight_provider_order_attempt_for_dispatch(uuid, integer) is
  'Atomically rechecks the exact Preview Duffel test-order authority immediately before the one allowed HTTP dispatch.';

commit;


-- Mirrored from migrations/202608250071_flight_duffel_preview_rpc_bridge.sql.

begin;

-- PostgREST-safe service-role wrappers. They bind the three opaque receipt
-- digests into transaction-local settings before delegating to 069/070.
-- They do not enable runtime controls or weaken the underlying CAS functions.
create function public.prepare_flight_provider_attempt_rpc(
  p_tenant_id text,
  p_commerce_id text,
  p_operation text,
  p_provider_code text,
  p_execution_mode text,
  p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_account_sha256 text,
  p_point_of_sale_sha256 text,
  p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider attempt RPC bridge is service-role only';
  end if;
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    if p_execution_mode <> 'test' then
      raise exception 'Duffel order RPC bridge is test-only';
    end if;
    return query select * from public.prepare_flight_provider_order_attempt(
      p_tenant_id, p_commerce_id, p_provider_code,
      p_execution_scope_sha256, p_activation_evidence_sha256,
      p_adapter_version_sha256, p_adapter_source_sha256,
      p_provider_account_sha256, p_point_of_sale_sha256,
      p_content_scope_sha256, p_provider_binding_receipt_sha256,
      p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
      p_operation_authority_receipt_sha256, p_dispatch_not_after
    );
  else
    return query select * from public.prepare_flight_provider_request_attempt(
      p_tenant_id, p_commerce_id, p_operation, p_provider_code, p_execution_mode,
      p_execution_scope_sha256, p_activation_evidence_sha256,
      p_adapter_version_sha256, p_adapter_source_sha256,
      p_provider_account_sha256, p_point_of_sale_sha256,
      p_content_scope_sha256, p_provider_binding_receipt_sha256,
      p_request_plan_sha256, p_request_sha256, p_request_body_sha256,
      p_operation_authority_receipt_sha256, p_dispatch_not_after
    );
  end if;
end;
$$;

create function public.claim_flight_provider_attempt_rpc(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_operation text,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider claim RPC bridge is service-role only';
  end if;
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    return query select * from public.claim_flight_provider_order_attempt_for_dispatch(
      p_attempt_id, p_expected_revision
    );
  else
    return query select * from public.claim_flight_provider_request_attempt_for_dispatch(
      p_attempt_id, p_expected_revision
    );
  end if;
end;
$$;

revoke all on function public.prepare_flight_provider_attempt_rpc(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_flight_provider_attempt_rpc(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_provider_attempt_rpc(
  uuid, integer, text, text, text, text
) to service_role;

commit;


-- Mirrored from migrations/202608250072_flight_duffel_preview_runtime_assertions.sql.
begin;

-- Complete the PostgREST bridge by binding the runtime assertions required by
-- migration 068 into the same transaction as each 069/070 prepare or claim.
create or replace function public.prepare_flight_provider_attempt_rpc(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text,
  p_activation_evidence_sha256 text, p_adapter_version_sha256 text,
  p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider attempt RPC bridge is service-role only';
  end if;
  perform set_config('app.flight_environment', 'preview', true);
  perform set_config('app.flight_project_ref', 'eiqmdldjnedqgbtoozqa', true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config('app.flight_activation_evidence_sha256', p_activation_evidence_sha256, true);
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    if p_execution_mode <> 'test' then raise exception 'Duffel order RPC bridge is test-only'; end if;
    return query select * from public.prepare_flight_provider_order_attempt(
      p_tenant_id, p_commerce_id, p_provider_code, p_execution_scope_sha256,
      p_activation_evidence_sha256, p_adapter_version_sha256, p_adapter_source_sha256,
      p_provider_account_sha256, p_point_of_sale_sha256, p_content_scope_sha256,
      p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
      p_request_body_sha256, p_operation_authority_receipt_sha256, p_dispatch_not_after
    );
  else
    return query select * from public.prepare_flight_provider_request_attempt(
      p_tenant_id, p_commerce_id, p_operation, p_provider_code, p_execution_mode,
      p_execution_scope_sha256, p_activation_evidence_sha256, p_adapter_version_sha256,
      p_adapter_source_sha256, p_provider_account_sha256, p_point_of_sale_sha256,
      p_content_scope_sha256, p_provider_binding_receipt_sha256, p_request_plan_sha256,
      p_request_sha256, p_request_body_sha256, p_operation_authority_receipt_sha256,
      p_dispatch_not_after
    );
  end if;
end;
$$;

create or replace function public.claim_flight_provider_attempt_rpc(
  p_attempt_id uuid, p_expected_revision integer, p_operation text,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_activation_evidence_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight provider claim RPC bridge is service-role only';
  end if;
  select activation_evidence_sha256 into v_activation_evidence_sha256
    from public.flight_provider_request_attempts where id = p_attempt_id;
  if not found then raise exception 'Flight provider claim RPC attempt is unavailable'; end if;
  perform set_config('app.flight_environment', 'preview', true);
  perform set_config('app.flight_project_ref', 'eiqmdldjnedqgbtoozqa', true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config('app.flight_activation_evidence_sha256', v_activation_evidence_sha256, true);
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config('app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true);
  perform set_config('app.flight_request_authority_receipt_sha256', p_operation_authority_receipt_sha256, true);
  if p_operation = 'create_order' then
    return query select * from public.claim_flight_provider_order_attempt_for_dispatch(p_attempt_id, p_expected_revision);
  end if;
  return query select * from public.claim_flight_provider_request_attempt_for_dispatch(p_attempt_id, p_expected_revision);
end;
$$;

commit;
