-- Run after schema.sql or the upgrade migration. Every result should be true.
select
  to_regclass('public.profiles') is not null as profiles_ready,
  to_regclass('public.properties') is not null as properties_ready,
  to_regclass('public.bookings') is not null as bookings_ready,
  to_regclass('public.booking_financials') is not null as finance_ready,
  to_regclass('public.revenue_daily_inputs') is not null as revenue_inputs_ready,
  to_regclass('public.revenue_recommendations') is not null as recommendations_ready,
  to_regclass('public.revenue_audit_log') is not null as audit_ready,
  to_regclass('public.revenue_daily_reports') is not null as reports_ready;

select
  relname as table_name,
  relrowsecurity as row_level_security_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles','partners','properties','rooms','inventory','bookings',
    'booking_financials','partner_payouts','revenue_daily_inputs',
    'revenue_recommendations','revenue_audit_log','revenue_daily_reports'
  )
order by relname;

select
  to_regprocedure('public.review_booking(uuid,text,text)') is not null as booking_review_ready,
  to_regprocedure('public.cancel_pending_booking(uuid,text)') is not null as cancellation_ready,
  to_regprocedure('public.review_revenue_recommendation(uuid,text)') is not null as revenue_approval_ready;
