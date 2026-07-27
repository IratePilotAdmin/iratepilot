begin;

create extension if not exists "uuid-ossp";

alter table public.partners
  add column if not exists software_plan text not null default 'none',
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists subscription_renews_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

do $$ begin
  alter table public.partners add constraint partners_software_plan_check
    check (software_plan in ('none','starter','professional','premium','enterprise'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.partners add constraint partners_subscription_status_check
    check (subscription_status in ('inactive','active','past_due','cancelled'));
exception when duplicate_object then null;
end $$;

create table if not exists public.booking_financials (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  partner_id uuid not null references public.partners(id),
  gross_room_revenue numeric(12,2) not null check (gross_room_revenue >= 0),
  partner_commission numeric(12,2) not null check (partner_commission >= 0),
  partner_net numeric(12,2) not null check (partner_net >= 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','eligible','drafted','paid','void')),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_payouts (
  id uuid primary key default uuid_generate_v4(),
  partner_id uuid not null references public.partners(id),
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.revenue_daily_inputs (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  stay_date date not null,
  rooms_available integer not null check (rooms_available >= 0),
  rooms_sold integer not null check (rooms_sold >= 0),
  current_rate numeric(12,2) not null check (current_rate >= 0),
  competitor_rate numeric(12,2) check (competitor_rate >= 0),
  last_year_occupancy numeric(5,2) check (last_year_occupancy between 0 and 100),
  event_name text,
  source text not null default 'csv',
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique(room_id, stay_date)
);

create table if not exists public.revenue_recommendations (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  stay_date date not null,
  current_rate numeric(12,2) not null,
  recommended_rate numeric(12,2) not null,
  occupancy_forecast numeric(5,2) not null check (occupancy_forecast between 0 and 100),
  estimated_revenue_impact numeric(12,2) not null default 0,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','superseded')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists one_pending_revenue_recommendation
  on public.revenue_recommendations(room_id, stay_date)
  where status = 'pending';

create table if not exists public.revenue_audit_log (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties(id) on delete cascade,
  recommendation_id uuid references public.revenue_recommendations(id) on delete set null,
  actor_id uuid references public.profiles(id),
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.revenue_daily_reports (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties(id) on delete cascade,
  report_date date not null,
  forecast_window_days integer not null default 90,
  average_occupancy numeric(5,2) not null default 0,
  average_daily_rate numeric(12,2) not null default 0,
  forecast_revenue numeric(12,2) not null default 0,
  pending_actions integer not null default 0,
  summary text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(property_id, report_date)
);

alter table public.booking_financials enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.revenue_daily_inputs enable row level security;
alter table public.revenue_recommendations enable row level security;
alter table public.revenue_audit_log enable row level security;
alter table public.revenue_daily_reports enable row level security;

drop policy if exists "Partners can view own booking financials" on public.booking_financials;
create policy "Partners can view own booking financials" on public.booking_financials for select using (
  exists (select 1 from public.partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
drop policy if exists "Partners can view own payouts" on public.partner_payouts;
create policy "Partners can view own payouts" on public.partner_payouts for select using (
  exists (select 1 from public.partners where partners.id = partner_id and partners.owner_id = auth.uid())
);
drop policy if exists "Admins can manage booking financials" on public.booking_financials;
create policy "Admins can manage booking financials" on public.booking_financials for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "Admins can manage partner payouts" on public.partner_payouts;
create policy "Admins can manage partner payouts" on public.partner_payouts for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

drop policy if exists "Partners can manage own revenue inputs" on public.revenue_daily_inputs;
create policy "Partners can manage own revenue inputs" on public.revenue_daily_inputs for all using (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
);
drop policy if exists "Partners can manage own revenue recommendations" on public.revenue_recommendations;
create policy "Partners can manage own revenue recommendations" on public.revenue_recommendations for all using (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
);
drop policy if exists "Partners can view own revenue audit" on public.revenue_audit_log;
create policy "Partners can view own revenue audit" on public.revenue_audit_log for select using (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
);
drop policy if exists "Partners can create own revenue audit" on public.revenue_audit_log;
create policy "Partners can create own revenue audit" on public.revenue_audit_log for insert with check (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
);
drop policy if exists "Partners can manage own revenue reports" on public.revenue_daily_reports;
create policy "Partners can manage own revenue reports" on public.revenue_daily_reports for all using (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
) with check (
  exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
    where properties.id = property_id and partners.owner_id = auth.uid())
);

drop policy if exists "Admins can manage revenue inputs" on public.revenue_daily_inputs;
create policy "Admins can manage revenue inputs" on public.revenue_daily_inputs for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
drop policy if exists "Admins can manage revenue recommendations" on public.revenue_recommendations;
create policy "Admins can manage revenue recommendations" on public.revenue_recommendations for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
drop policy if exists "Admins can manage revenue audit" on public.revenue_audit_log;
create policy "Admins can manage revenue audit" on public.revenue_audit_log for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
drop policy if exists "Admins can manage revenue reports" on public.revenue_daily_reports;
create policy "Admins can manage revenue reports" on public.revenue_daily_reports for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create or replace function public.review_revenue_recommendation(p_recommendation_id uuid, p_decision text)
returns public.revenue_recommendations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recommendation public.revenue_recommendations;
  v_authorized boolean;
  v_status text;
begin
  select * into v_recommendation from public.revenue_recommendations
    where id = p_recommendation_id for update;
  if not found then raise exception 'Recommendation not found'; end if;
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
    union all
    select 1 from public.properties p join public.partners pa on pa.id = p.partner_id
      where p.id = v_recommendation.property_id and pa.owner_id = auth.uid()
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_recommendation.status <> 'pending' then raise exception 'Recommendation already reviewed'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  v_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if v_status = 'approved' then
    update public.inventory set rate = v_recommendation.recommended_rate
      where room_id = v_recommendation.room_id and stay_date = v_recommendation.stay_date;
  end if;
  update public.revenue_recommendations
    set status = v_status, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_recommendation_id returning * into v_recommendation;
  insert into public.revenue_audit_log (property_id, recommendation_id, actor_id, action, details)
    values (
      v_recommendation.property_id, v_recommendation.id, auth.uid(),
      'recommendation_' || v_status,
      jsonb_build_object(
        'stay_date', v_recommendation.stay_date,
        'old_rate', v_recommendation.current_rate,
        'recommended_rate', v_recommendation.recommended_rate,
        'inventory_updated', v_status = 'approved'
      )
    );
  return v_recommendation;
end;
$$;

revoke all on function public.review_revenue_recommendation(uuid, text) from public;
grant execute on function public.review_revenue_recommendation(uuid, text) to authenticated;

create or replace function public.review_booking(p_booking_id uuid, p_decision text, p_reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_authorized boolean;
  v_expected integer;
  v_available integer;
  v_tier text;
  v_points integer;
  v_partner_id uuid;
  v_commission numeric(12,2);
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
    union all
    select 1 from public.properties p join public.partners pa on pa.id = p.partner_id
      where p.id = v_booking.property_id and pa.owner_id = auth.uid()
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_booking.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;

  if p_decision = 'approve' then
    v_expected := v_booking.check_out - v_booking.check_in;
    perform 1 from public.inventory
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out
      for update;
    select count(*) into v_available from public.inventory
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out
        and available_units > 0;
    if v_available <> v_expected then raise exception 'Inventory is no longer available'; end if;
    update public.inventory set available_units = available_units - 1
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in and stay_date < v_booking.check_out;
    update public.bookings
      set status = 'confirmed', cancellation_reason = null, updated_at = now()
      where id = p_booking_id returning * into v_booking;
    select membership_tier into v_tier from public.profiles where id = v_booking.customer_id;
    v_points := case
      when v_tier = 'business' then floor(v_booking.subtotal)::integer * 2
      when v_tier = 'basic' then floor(v_booking.subtotal)::integer
      else 0
    end;
    if v_points > 0 then
      insert into public.reward_ledger (user_id, booking_id, points, description)
        values (v_booking.customer_id, v_booking.id, v_points,
          'Points earned for ' || v_booking.confirmation_code);
      update public.profiles set reward_points = reward_points + v_points
        where id = v_booking.customer_id;
    end if;
    select partner_id into v_partner_id from public.properties where id = v_booking.property_id;
    v_commission := round(v_booking.subtotal * 0.10, 2);
    insert into public.booking_financials (
      booking_id, partner_id, gross_room_revenue, partner_commission, partner_net, status
    ) values (
      v_booking.id, v_partner_id, v_booking.subtotal, v_commission,
      v_booking.subtotal - v_commission, 'awaiting_payment'
    ) on conflict (booking_id) do nothing;
    insert into public.notifications (user_id, title, body) values (
      v_booking.customer_id, 'Booking request approved',
      'Your iRatePilot request ' || v_booking.confirmation_code ||
        ' has been approved. No payment has been collected.'
    );
  elsif p_decision = 'reject' then
    update public.bookings
      set status = 'cancelled',
          cancellation_reason = coalesce(nullif(p_reason,''), 'Property declined the request'),
          updated_at = now()
      where id = p_booking_id returning * into v_booking;
    insert into public.notifications (user_id, title, body) values (
      v_booking.customer_id, 'Booking request declined',
      'Your iRatePilot request ' || v_booking.confirmation_code ||
        ' was declined. No payment was collected.'
    );
  else
    raise exception 'Invalid review decision';
  end if;
  return v_booking;
end;
$$;

revoke all on function public.review_booking(uuid, text, text) from public;
grant execute on function public.review_booking(uuid, text, text) to authenticated;

commit;
