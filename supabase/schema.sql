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
  status text not null default 'pending'
    constraint partner_applications_status_check check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);

create unique index one_pending_partner_application_per_email
  on partner_applications (lower(trim(email)))
  where status = 'pending';

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
        set business_name = excluded.business_name, status = 'approved';
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
