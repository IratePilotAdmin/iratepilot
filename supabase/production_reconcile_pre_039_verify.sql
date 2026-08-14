-- Read-only verification after the pre-039 forward reconciliation.
with contracts as (
  select jsonb_build_object(
    'update_own_profile', coalesce(pg_get_functiondef(to_regprocedure('public.update_own_profile(text,text)')) like '%SECURITY DEFINER%', false),
    'approved_property_helper', coalesce(pg_get_functiondef(to_regprocedure('public.is_approved_marketplace_property(uuid)')) like '%partners.status = ''approved''%', false),
    'approved_room_helper', coalesce(pg_get_functiondef(to_regprocedure('public.is_approved_marketplace_room(uuid)')) like '%partners.status = ''approved''%', false),
    'approved_booking_trigger', coalesce((select pg_get_triggerdef(oid) like '%enforce_approved_partner_booking%' from pg_catalog.pg_trigger where tgname = 'enforce_approved_partner_booking' and tgrelid = 'public.bookings'::regclass and not tgisinternal), false),
    'property_activation_trigger', coalesce((select pg_get_triggerdef(oid) like '%enforce_partner_before_property_activation%' from pg_catalog.pg_trigger where tgname = 'enforce_partner_before_property_activation' and tgrelid = 'public.properties'::regclass and not tgisinternal), false),
    'open_booking_index', coalesce(pg_get_indexdef(to_regclass('public.one_open_booking_per_stay')) like '%customer_id, room_id, check_in, check_out%', false),
    'payment_intent_index', coalesce(pg_get_indexdef(to_regclass('public.bookings_stripe_payment_intent_id_key')) like '%stripe_payment_intent_id%', false),
    'pending_application_index', coalesce(pg_get_indexdef(to_regclass('public.one_pending_partner_application_per_email')) like '%lower%email%status%pending%', false),
    'admin_read_policy', exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'partner_applications' and policyname = 'Admins can view partner applications' and cmd = 'SELECT'),
    'legacy_admin_manage_policy_removed', not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'partner_applications' and policyname = 'Admins can manage partner applications'),
    'profile_update_policy_removed', not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update own profile'),
    'rooms_max_guests_constraint', coalesce((select pg_get_constraintdef(oid) like '%max_guests >= 1%max_guests <= 30%' from pg_catalog.pg_constraint where conname = 'rooms_max_guests_bounds' and conrelid = 'public.rooms'::regclass), false),
    'rooms_base_rate_constraint', coalesce((select pg_get_constraintdef(oid) like '%base_rate >= 25%base_rate <= 25000%' from pg_catalog.pg_constraint where conname = 'rooms_base_rate_bounds' and conrelid = 'public.rooms'::regclass), false),
    'inventory_units_constraint', coalesce((select pg_get_constraintdef(oid) like '%available_units >= 0%available_units <= 500%' from pg_catalog.pg_constraint where conname = 'inventory_available_units_bounds' and conrelid = 'public.inventory'::regclass), false),
    'inventory_rate_constraint', coalesce((select pg_get_constraintdef(oid) like '%rate >= 25%rate <= 25000%' from pg_catalog.pg_constraint where conname = 'inventory_rate_bounds' and conrelid = 'public.inventory'::regclass), false),
    'partner_status_constraint', coalesce((select pg_get_constraintdef(oid) like '%pending%approved%declined%' from pg_catalog.pg_constraint where conname = 'partner_applications_status_check' and conrelid = 'public.partner_applications'::regclass), false)
  ) as evidence
)
select jsonb_build_object(
  'ready_for_history_repair', not exists (
    select 1 from jsonb_each_text(contracts.evidence) where value <> 'true'
  ),
  'contracts', contracts.evidence
) as production_reconcile_pre_039_verification
from contracts;
