-- Run after schema.sql or the upgrade migration. Every result should be true.
select
  to_regclass('public.profiles') is not null as profiles_ready,
  to_regclass('public.properties') is not null as properties_ready,
  to_regclass('public.bookings') is not null as bookings_ready,
  to_regclass('public.one_open_booking_per_stay') is not null as booking_deduplication_ready,
  to_regclass('public.booking_financials') is not null as finance_ready,
  to_regclass('public.revenue_daily_inputs') is not null as revenue_inputs_ready,
  to_regclass('public.revenue_recommendations') is not null as recommendations_ready,
  to_regclass('public.revenue_audit_log') is not null as audit_ready,
  to_regclass('public.revenue_daily_reports') is not null as reports_ready,
  to_regclass('public.email_outbox') is not null as email_outbox_ready,
  to_regclass('public.property_synxis_onboarding_requests') is not null as synxis_onboarding_ready,
  to_regclass('public.partner_team_members') is not null as partner_team_ready,
  to_regclass('public.partner_team_invitations') is not null as partner_team_invitations_ready,
  to_regclass('public.partner_team_access_events') is not null as partner_team_audit_ready;

select
  relname as table_name,
  relrowsecurity as row_level_security_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles','partners','properties','rooms','inventory','bookings',
    'booking_financials','partner_payouts','revenue_daily_inputs',
    'revenue_recommendations','revenue_audit_log','revenue_daily_reports',
    'email_outbox','property_synxis_onboarding_requests','partner_team_members',
    'partner_team_invitations','partner_team_access_events'
  )
order by relname;

select
  count(*) = 2
  and bool_and(position('inventory.stay_date >= CURRENT_DATE' in with_check) > 0)
    as future_partner_inventory_writes_ready
from pg_policies
where schemaname = 'public'
  and tablename = 'inventory'
  and policyname in (
    'Hotel managers create partner inventory',
    'Hotel managers update partner inventory'
  );

select
  to_regprocedure('public.review_booking(uuid,text,text)') is not null as booking_review_ready,
  to_regprocedure('public.cancel_pending_booking(uuid,text)') is not null as cancellation_ready,
  to_regprocedure('public.review_revenue_recommendation(uuid,text)') is not null as revenue_approval_ready,
  to_regprocedure('public.review_partner_application(uuid,text)') is not null as partner_provisioning_ready,
  has_function_privilege(
    'authenticated',
    'public.review_partner_application(uuid,text)',
    'execute'
  ) as authenticated_partner_provisioning_ready,
  not has_function_privilege(
    'anon',
    'public.review_partner_application(uuid,text)',
    'execute'
  ) as anonymous_partner_provisioning_blocked,
  to_regprocedure('public.claim_transactional_email_job()') is not null as email_claim_ready,
  has_function_privilege(
    'service_role',
    'public.claim_transactional_email_job()',
    'execute'
  ) as service_role_email_claim_ready,
  not has_function_privilege(
    'anon',
    'public.claim_transactional_email_job()',
    'execute'
  ) as anonymous_email_claim_blocked,
  to_regprocedure('public.can_manage_partner_hotels(uuid)') is not null as hotel_access_check_ready,
  to_regprocedure('public.resolve_partner_hotel_access()') is not null as hotel_access_resolver_ready,
  to_regprocedure('public.accept_partner_team_invitation(uuid)') is not null as partner_invitation_acceptance_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partner_team_invitations'
      and column_name = 'can_manage_hotels'
      and column_default = 'false'
      and is_nullable = 'NO'
  ) as disclosed_hotel_access_invitation_ready,
  position(
    'v_invitation.can_manage_hotels'
    in lower(pg_get_functiondef(
      'public.accept_partner_team_invitation(uuid)'::regprocedure
    ))
  ) > 0 as invitation_scoped_hotel_access_ready,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.properties'::regclass
      and tgname = 'enforce_delegated_hotel_manager_property_fields'
      and tgenabled = 'O' and not tgisinternal
  ) as delegated_property_guard_ready,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.rooms'::regclass
      and tgname = 'enforce_hotel_manager_room_property_immutability'
      and tgenabled = 'O' and not tgisinternal
  ) as room_assignment_guard_ready,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.inventory'::regclass
      and tgname = 'enforce_hotel_manager_inventory_room_immutability'
      and tgenabled = 'O' and not tgisinternal
      and position(
        'update of room_id, stay_date'
        in lower(pg_get_triggerdef(oid))
      ) > 0
  )
  and position(
    'new.stay_date is distinct from old.stay_date'
    in lower(pg_get_functiondef(
      'public.enforce_hotel_manager_inventory_room_immutability()'::regprocedure
    ))
  ) > 0 as inventory_assignment_guard_ready;
