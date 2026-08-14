-- Run after schema.sql or the upgrade migrations. Every boolean result should be true.

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
  to_regclass('public.booking_messages') is not null as booking_messages_ready,
  to_regclass('public.booking_messages_thread_idx') is not null as booking_messages_index_ready;

select
  relname as table_name,
  relrowsecurity as row_level_security_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles','partners','properties','rooms','inventory','bookings',
    'booking_financials','partner_payouts','revenue_daily_inputs',
    'revenue_recommendations','revenue_audit_log','revenue_daily_reports',
    'email_outbox','booking_cancellation_requests','booking_messages'
  )
order by relname;

select exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'inventory'
    and policyname = 'Partners can manage own inventory'
    and position('stay_date >= CURRENT_DATE' in coalesce(with_check, '')) > 0
) as future_partner_inventory_writes_ready;

select exists (
  select 1
  from pg_constraint
  where conrelid = 'public.booking_cancellation_requests'::regclass
    and conname = 'booking_cancellation_requests_status_check'
    and position('processing' in pg_get_constraintdef(oid)) > 0
) as cancellation_processing_status_ready;

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
  to_regprocedure('public.send_booking_message(uuid,text)') is not null as booking_message_send_ready,
  has_function_privilege(
    'authenticated',
    'public.send_booking_message(uuid,text)',
    'execute'
  ) as authenticated_booking_message_send_ready,
  not has_function_privilege(
    'anon',
    'public.send_booking_message(uuid,text)',
    'execute'
  ) as anonymous_booking_message_send_blocked,
  to_regprocedure('public.finalize_test_booking_refund(uuid,text,numeric)') is not null as refund_finalization_ready,
  has_function_privilege(
    'service_role',
    'public.finalize_test_booking_refund(uuid,text,numeric)',
    'execute'
  ) as service_role_refund_finalization_ready,
  not has_function_privilege(
    'authenticated',
    'public.finalize_test_booking_refund(uuid,text,numeric)',
    'execute'
  ) as authenticated_refund_finalization_blocked,
  not has_function_privilege(
    'anon',
    'public.finalize_test_booking_refund(uuid,text,numeric)',
    'execute'
  ) as anonymous_refund_finalization_blocked,
  to_regprocedure('public.cancel_unpaid_confirmed_booking(uuid,text)') is not null as unpaid_booking_cancellation_ready,
  has_function_privilege(
    'authenticated',
    'public.cancel_unpaid_confirmed_booking(uuid,text)',
    'execute'
  ) as authenticated_unpaid_booking_cancellation_ready,
  has_function_privilege(
    'service_role',
    'public.cancel_unpaid_confirmed_booking(uuid,text)',
    'execute'
  ) as service_role_unpaid_booking_cancellation_ready,
  not has_function_privilege(
    'anon',
    'public.cancel_unpaid_confirmed_booking(uuid,text)',
    'execute'
  ) as anonymous_unpaid_booking_cancellation_blocked,
  to_regprocedure(
    'public.complete_approved_booking_test_payment(uuid,uuid,text,integer)'
  ) is not null as approved_booking_test_payment_ready,
  has_function_privilege(
    'service_role',
    'public.complete_approved_booking_test_payment(uuid,uuid,text,integer)',
    'execute'
  ) as service_role_approved_booking_test_payment_ready,
  not has_function_privilege(
    'authenticated',
    'public.complete_approved_booking_test_payment(uuid,uuid,text,integer)',
    'execute'
  ) as authenticated_approved_booking_test_payment_blocked,
  not has_function_privilege(
    'anon',
    'public.complete_approved_booking_test_payment(uuid,uuid,text,integer)',
    'execute'
  ) as anonymous_approved_booking_test_payment_blocked;
