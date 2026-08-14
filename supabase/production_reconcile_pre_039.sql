-- Production-only forward reconciliation for skipped pre-039 security contracts.
-- Do not run without a current backup, a successful preflight, and explicit production-write approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1 from public.bookings where status in ('pending', 'confirmed')
    group by customer_id, room_id, check_in, check_out having count(*) > 1
  ) then raise exception 'Resolve duplicate open bookings before reconciliation'; end if;
  if exists (
    select 1 from public.bookings where stripe_payment_intent_id is not null
    group by stripe_payment_intent_id having count(*) > 1
  ) then raise exception 'Resolve duplicate Stripe payment bookings before reconciliation'; end if;
  if exists (
    select 1 from public.partner_applications where status = 'pending'
    group by lower(trim(email)) having count(*) > 1
  ) then raise exception 'Resolve duplicate pending partner applications before reconciliation'; end if;
  if exists (
    select 1 from public.properties where active = true and not exists (
      select 1 from public.partners
      where partners.id = properties.partner_id and partners.status = 'approved'
    )
  ) then raise exception 'Review active properties without an approved partner before reconciliation'; end if;
end;
$$;

create unique index if not exists one_open_booking_per_stay
  on public.bookings (customer_id, room_id, check_in, check_out)
  where status in ('pending', 'confirmed');
create unique index if not exists bookings_stripe_payment_intent_id_key
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists one_pending_partner_application_per_email
  on public.partner_applications (lower(trim(email)))
  where status = 'pending';

drop policy if exists "Users can update own profile" on public.profiles;
create or replace function public.update_own_profile(p_full_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_phone is not null and char_length(trim(p_phone)) > 30 then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;
  update public.profiles set full_name = trim(p_full_name), phone = nullif(trim(p_phone), '')
  where id = auth.uid() returning * into v_profile;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('full_name', v_profile.full_name, 'phone', v_profile.phone);
end;
$$;
revoke all on function public.update_own_profile(text, text) from public;
grant execute on function public.update_own_profile(text, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'rooms_max_guests_bounds' and conrelid = 'public.rooms'::regclass) then
    alter table public.rooms add constraint rooms_max_guests_bounds check (max_guests between 1 and 30) not valid;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'rooms_base_rate_bounds' and conrelid = 'public.rooms'::regclass) then
    alter table public.rooms add constraint rooms_base_rate_bounds check (base_rate between 25 and 25000) not valid;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'inventory_available_units_bounds' and conrelid = 'public.inventory'::regclass) then
    alter table public.inventory add constraint inventory_available_units_bounds check (available_units between 0 and 500) not valid;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'inventory_rate_bounds' and conrelid = 'public.inventory'::regclass) then
    alter table public.inventory add constraint inventory_rate_bounds check (rate between 25 and 25000) not valid;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'partner_applications_status_check' and conrelid = 'public.partner_applications'::regclass) then
    alter table public.partner_applications add constraint partner_applications_status_check check (status in ('pending','approved','declined')) not valid;
  end if;
end;
$$;

drop policy if exists "Admins can manage partner applications" on public.partner_applications;
drop policy if exists "Admins can view partner applications" on public.partner_applications;
create policy "Admins can view partner applications" on public.partner_applications for select
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create or replace function public.is_approved_marketplace_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.properties join public.partners on partners.id = properties.partner_id
  where properties.id = p_property_id and properties.active = true and partners.status = 'approved');
$$;
create or replace function public.is_approved_marketplace_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
  join public.partners on partners.id = properties.partner_id where rooms.id = p_room_id
  and rooms.active = true and properties.active = true and partners.status = 'approved');
$$;
revoke all on function public.is_approved_marketplace_property(uuid) from public;
revoke all on function public.is_approved_marketplace_room(uuid) from public;
grant execute on function public.is_approved_marketplace_property(uuid) to anon, authenticated;
grant execute on function public.is_approved_marketplace_room(uuid) to anon, authenticated;

drop policy if exists "Public can view active properties" on public.properties;
create policy "Public can view active properties" on public.properties for select
using (active = true and public.is_approved_marketplace_property(id));
drop policy if exists "Public can view active rooms" on public.rooms;
create policy "Public can view active rooms" on public.rooms for select
using (active = true and public.is_approved_marketplace_property(property_id));
drop policy if exists "Public can view inventory" on public.inventory;
create policy "Public can view inventory" on public.inventory for select
using (public.is_approved_marketplace_room(room_id));

create or replace function public.enforce_approved_partner_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id where rooms.id = new.room_id
    and properties.id = new.property_id and rooms.active = true and properties.active = true
    and partners.status = 'approved') then
    raise exception 'Bookings require an active room from an approved partner' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_approved_partner_booking() from public;
drop trigger if exists enforce_approved_partner_booking on public.bookings;
create trigger enforce_approved_partner_booking before insert or update of property_id, room_id
on public.bookings for each row execute function public.enforce_approved_partner_booking();

create or replace function public.enforce_partner_before_property_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active = true and not exists (select 1 from public.partners
    where partners.id = new.partner_id and partners.status = 'approved') then
    raise exception 'Approve the partner account before activating the property' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_partner_before_property_activation() from public;
drop trigger if exists enforce_partner_before_property_activation on public.properties;
create trigger enforce_partner_before_property_activation before insert or update of active, partner_id
on public.properties for each row execute function public.enforce_partner_before_property_activation();

commit;
