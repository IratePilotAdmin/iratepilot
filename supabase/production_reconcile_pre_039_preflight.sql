-- Read-only preflight for the production contracts skipped before SynXis migration 039.
with duplicate_open_bookings as (
  select count(*)::integer as count from (
    select 1 from public.bookings
    where status in ('pending', 'confirmed')
    group by customer_id, room_id, check_in, check_out having count(*) > 1
  ) duplicates
), duplicate_payment_intents as (
  select count(*)::integer as count from (
    select 1 from public.bookings
    where stripe_payment_intent_id is not null
    group by stripe_payment_intent_id having count(*) > 1
  ) duplicates
), duplicate_pending_applications as (
  select count(*)::integer as count from (
    select 1 from public.partner_applications
    where status = 'pending'
    group by lower(trim(email)) having count(*) > 1
  ) duplicates
), unapproved_active_properties as (
  select count(*)::integer as count
  from public.properties
  where active = true and not exists (
    select 1 from public.partners
    where partners.id = properties.partner_id and partners.status = 'approved'
  )
), data_bounds as (
  select jsonb_build_object(
    'rooms_max_guests', (select count(*) from public.rooms where max_guests not between 1 and 30),
    'rooms_base_rate', (select count(*) from public.rooms where base_rate not between 25 and 25000),
    'inventory_available_units', (select count(*) from public.inventory where available_units not between 0 and 500),
    'inventory_rate', (select count(*) from public.inventory where rate not between 25 and 25000),
    'partner_application_status', (select count(*) from public.partner_applications where status not in ('pending','approved','declined'))
  ) as counts
)
select jsonb_build_object(
  'ready_to_apply',
    duplicate_open_bookings.count = 0
    and duplicate_payment_intents.count = 0
    and duplicate_pending_applications.count = 0
    and unapproved_active_properties.count = 0,
  'blocking_rows', jsonb_build_object(
    'duplicate_open_booking_groups', duplicate_open_bookings.count,
    'duplicate_payment_intent_groups', duplicate_payment_intents.count,
    'duplicate_pending_application_groups', duplicate_pending_applications.count,
    'unapproved_active_properties', unapproved_active_properties.count
  ),
  'existing_bound_violations', data_bounds.counts,
  'contracts', jsonb_build_object(
    'update_own_profile', to_regprocedure('public.update_own_profile(text,text)') is not null,
    'approved_property_helper', to_regprocedure('public.is_approved_marketplace_property(uuid)') is not null,
    'approved_room_helper', to_regprocedure('public.is_approved_marketplace_room(uuid)') is not null,
    'approved_booking_trigger', exists (select 1 from pg_catalog.pg_trigger where tgname = 'enforce_approved_partner_booking' and not tgisinternal),
    'property_activation_trigger', exists (select 1 from pg_catalog.pg_trigger where tgname = 'enforce_partner_before_property_activation' and not tgisinternal),
    'open_booking_index', to_regclass('public.one_open_booking_per_stay') is not null,
    'payment_intent_index', to_regclass('public.bookings_stripe_payment_intent_id_key') is not null,
    'pending_application_index', to_regclass('public.one_pending_partner_application_per_email') is not null,
    'admin_read_policy', exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'partner_applications' and policyname = 'Admins can view partner applications'),
    'rooms_max_guests_constraint', exists (select 1 from pg_catalog.pg_constraint where conname = 'rooms_max_guests_bounds'),
    'rooms_base_rate_constraint', exists (select 1 from pg_catalog.pg_constraint where conname = 'rooms_base_rate_bounds'),
    'inventory_units_constraint', exists (select 1 from pg_catalog.pg_constraint where conname = 'inventory_available_units_bounds'),
    'inventory_rate_constraint', exists (select 1 from pg_catalog.pg_constraint where conname = 'inventory_rate_bounds'),
    'partner_status_constraint', exists (select 1 from pg_catalog.pg_constraint where conname = 'partner_applications_status_check')
  )
) as production_reconcile_pre_039_preflight
from duplicate_open_bookings, duplicate_payment_intents, duplicate_pending_applications,
  unapproved_active_properties, data_bounds;
