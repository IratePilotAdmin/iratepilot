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
  to_regclass('public.email_outbox') is not null as email_outbox_ready;

select
  relname as table_name,
  relrowsecurity as row_level_security_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles','partners','properties','rooms','inventory','bookings',
    'booking_financials','partner_payouts','revenue_daily_inputs',
    'revenue_recommendations','revenue_audit_log','revenue_daily_reports',
    'email_outbox'
  )
order by relname;

select
  position('stay_date >= CURRENT_DATE' in with_check) > 0
    as future_partner_inventory_writes_ready
from pg_policies
where schemaname = 'public'
  and tablename = 'inventory'
  and policyname = 'Partners can manage own inventory';

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
  ) as anonymous_email_claim_blocked;
