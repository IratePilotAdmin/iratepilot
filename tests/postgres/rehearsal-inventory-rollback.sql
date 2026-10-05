-- Run only against the empty, isolated PMS rehearsal project.
-- This tests the minimum room and nightly inventory shape; it does not publish
-- a listing or create an Auth login. Every synthetic row is rolled back.
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '11000000-0000-4000-8000-000000000011',
  'inventory-owner@example.invalid',
  now(),
  '{"full_name":"Synthetic Inventory Owner"}'
);

insert into public.partners (id, owner_id, business_name, status)
values (
  '22000000-0000-4000-8000-000000000022',
  '11000000-0000-4000-8000-000000000011',
  'Synthetic Rehearsal Partner',
  'approved'
);

insert into public.properties (
  id, partner_id, name, slug, type, city, country, listing_scope, active
) values (
  '33000000-0000-4000-8000-000000000033',
  '22000000-0000-4000-8000-000000000022',
  'Synthetic Rehearsal Hotel',
  'synthetic-rehearsal-hotel',
  'hotel',
  'Test City',
  'US',
  'synthetic',
  false
);

insert into public.rooms (id, property_id, name, max_guests, base_rate, active)
values (
  '44000000-0000-4000-8000-000000000044',
  '33000000-0000-4000-8000-000000000033',
  'Synthetic King',
  2,
  109,
  true
);

insert into public.inventory (room_id, stay_date, available_units, rate)
values
  ('44000000-0000-4000-8000-000000000044', current_date + 7, 1, 109),
  ('44000000-0000-4000-8000-000000000044', current_date + 8, 1, 119);

do $assert_rehearsal_inventory$
begin
  if (
    select count(*) = 2
      and count(distinct stay_date) = 2
      and min(available_units) = 1
      and sum(rate) = 228
    from public.inventory
    where room_id = '44000000-0000-4000-8000-000000000044'
  ) is not true then
    raise exception 'Synthetic two-night inventory is not bookable';
  end if;
  if public.is_approved_marketplace_property(
    '33000000-0000-4000-8000-000000000033'
  ) then
    raise exception 'Synthetic property unexpectedly passed commercial approval';
  end if;
end;
$assert_rehearsal_inventory$;

rollback;

select
  (select count(*) from public.properties where slug = 'synthetic-rehearsal-hotel') as properties_left,
  (select count(*) from public.inventory where room_id = '44000000-0000-4000-8000-000000000044') as inventory_rows_left,
  (select count(*) from auth.users where id = '11000000-0000-4000-8000-000000000011') as auth_users_left;
