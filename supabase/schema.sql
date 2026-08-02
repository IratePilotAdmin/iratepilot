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
  reward_points integer not null default 0 check (reward_points >= 0),
  created_at timestamptz not null default now()
);

create table partner_applications (
  id uuid primary key default uuid_generate_v4(),
  property_name text not null,
  contact_name text not null,
  email text not null,
  property_type property_type not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table contact_messages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

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
  max_guests integer not null default 2,
  base_rate numeric(12,2) not null,
  active boolean not null default true
);

create table inventory (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  stay_date date not null,
  available_units integer not null default 0,
  rate numeric(12,2) not null,
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

create table email_outbox (
  id uuid primary key default uuid_generate_v4(),
  recipient_email text not null,
  subject text not null,
  template_name text not null,
  template_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  resend_email_id text,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_outbox_processing_idx
  on email_outbox (status, scheduled_at);

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
alter table email_outbox enable row level security;
alter table reward_ledger enable row level security;
alter table booking_financials enable row level security;
alter table partner_payouts enable row level security;
alter table revenue_daily_inputs enable row level security;
alter table revenue_recommendations enable row level security;
alter table revenue_audit_log enable row level security;
alter table revenue_daily_reports enable row level security;

create policy "Public can view active properties" on properties for select using (active = true);
create policy "Public can view active rooms" on rooms for select using (active = true);
create policy "Public can view inventory" on inventory for select using (true);
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Customers can view own bookings" on bookings for select using (auth.uid() = customer_id);
create policy "Customers can create own pending bookings" on bookings for insert with check (
  auth.uid() = customer_id and status = 'pending' and stripe_payment_intent_id is null
);
create policy "Partners can view own property bookings" on bookings for select using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = bookings.property_id and partners.owner_id = auth.uid())
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
  exists (select 1 from bookings join properties on properties.id = bookings.property_id join partners on partners.id = properties.partner_id where bookings.id = booking_id and partners.owner_id = auth.uid())
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
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
create policy "Partners can view own payouts" on partner_payouts for select using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
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
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
);
create policy "Partners can manage own revenue recommendations" on revenue_recommendations for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
);
create policy "Partners can view own revenue audit" on revenue_audit_log for select using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
);
create policy "Partners can create own revenue audit" on revenue_audit_log for insert with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
);
create policy "Partners can manage own revenue reports" on revenue_daily_reports for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = property_id and partners.owner_id = auth.uid())
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
create policy "Public can submit partner applications" on partner_applications for insert with check (true);
create policy "Public can submit contact messages" on contact_messages for insert with check (true);
create policy "Partners can create own partner record" on partners for insert with check (auth.uid() = owner_id);
create policy "Partners can view own partner record" on partners for select using (auth.uid() = owner_id);
create policy "Partners can create own properties" on properties for insert with check (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
create policy "Partners can view own properties" on properties for select using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
create policy "Partners can update own properties" on properties for update using (
  exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
) with check (
  active = false and exists (select 1 from partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
create policy "Partners can manage own rooms" on rooms for all using (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = rooms.property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from properties join partners on partners.id = properties.partner_id where properties.id = rooms.property_id and partners.owner_id = auth.uid())
);
create policy "Partners can manage own inventory" on inventory for all using (
  exists (select 1 from rooms join properties on properties.id = rooms.property_id join partners on partners.id = properties.partner_id where rooms.id = inventory.room_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from rooms join properties on properties.id = rooms.property_id join partners on partners.id = properties.partner_id where rooms.id = inventory.room_id and partners.owner_id = auth.uid())
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

create or replace function public.claim_email_outbox_job()
returns setof public.email_outbox
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  with next_job as (
    select candidate.id
    from public.email_outbox as candidate
    where candidate.scheduled_at <= now()
      and candidate.attempts < 3
      and (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.updated_at < now() - interval '15 minutes'
        )
      )
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit 1
  )
  update public.email_outbox as outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      last_error = null,
      processed_at = null,
      updated_at = now()
  from next_job
  where outbox.id = next_job.id
  returning outbox.*;
end;
$$;

create or replace function public.notify_approved_partner_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select id into v_user_id
    from auth.users
    where lower(email) = lower(new.email)
    order by created_at limit 1;

    if v_user_id is not null then
      insert into public.notifications (user_id, title, body)
      values (
        v_user_id,
        'Partner access approved',
        'Your iRatePilot partner account is ready. Finish your property setup to start accepting bookings.'
      );

      insert into public.email_outbox (
        recipient_email, subject, template_name, template_data
      ) values (
        new.email,
        'Your iRatePilot partner account is approved',
        'partner_application_approved',
        jsonb_build_object(
          'recipient_name', new.contact_name,
          'message', 'Your partner account is approved. Finish your property setup to start accepting bookings.',
          'action_url', 'https://www.iratepilot.com/partner/dashboard'
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_partner_application_approved on partner_applications;
create trigger on_partner_application_approved
  after update of status on partner_applications
  for each row execute procedure public.notify_approved_partner_application();

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
      where p.id = v_recommendation.property_id and pa.owner_id = auth.uid()
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
      where p.id = v_booking.property_id and pa.owner_id = auth.uid()
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_booking.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;

  if p_decision = 'approve' then
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
    select membership_tier into v_tier from profiles where id = v_booking.customer_id;
    v_points := case when v_tier = 'business' then floor(v_booking.subtotal)::integer * 2
                     when v_tier = 'basic' then floor(v_booking.subtotal)::integer
                     else 0 end;
    if v_points > 0 then
      insert into reward_ledger (user_id, booking_id, points, description)
      values (v_booking.customer_id, v_booking.id, v_points, 'Points earned for ' || v_booking.confirmation_code);
      update profiles set reward_points = reward_points + v_points where id = v_booking.customer_id;
    end if;
    select partner_id into v_partner_id from properties where id = v_booking.property_id;
    v_commission := round(v_booking.subtotal * 0.10, 2);
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

revoke all on function public.review_revenue_recommendation(uuid, text) from public;
grant execute on function public.review_revenue_recommendation(uuid, text) to authenticated;
revoke all on email_outbox from anon, authenticated;
grant all on email_outbox to service_role;
revoke all on function public.claim_email_outbox_job()
  from public, anon, authenticated;
grant execute on function public.claim_email_outbox_job() to service_role;
revoke all on function public.notify_approved_partner_application()
  from public, anon, authenticated;
revoke all on function public.review_partner_application(uuid, text)
  from public, anon, service_role;
grant execute on function public.review_partner_application(uuid, text) to authenticated;
revoke all on function public.review_booking(uuid, text, text) from public;
grant execute on function public.review_booking(uuid, text, text) to authenticated;
revoke all on function public.cancel_pending_booking(uuid, text) from public;
grant execute on function public.cancel_pending_booking(uuid, text) to authenticated;
