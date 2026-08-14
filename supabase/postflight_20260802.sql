-- iRatePilot consolidated migration postflight
-- Run after migrations 202608020001-202608020025.
-- Every boolean should be true and every blocker query should return zero rows.

select
  to_regclass('public.booking_messages') is not null as booking_messages_ready,
  to_regclass('public.one_open_booking_per_stay') is not null as booking_deduplication_ready,
  to_regclass('public.booking_financials') is not null as booking_financials_ready,
  to_regclass('public.email_outbox') is not null as email_outbox_ready;

select
  to_regprocedure('public.review_booking(uuid,text,text)') is not null as review_booking_ready,
  to_regprocedure('public.cancel_pending_booking(uuid,text)') is not null as cancel_pending_ready,
  to_regprocedure('public.cancel_unpaid_confirmed_booking(uuid,text)') is not null as cancel_unpaid_ready,
  to_regprocedure('public.finalize_test_booking_refund(uuid,text,numeric)') is not null as refund_finalizer_ready,
  to_regprocedure('public.send_booking_message(uuid,text)') is not null as booking_messages_function_ready,
  to_regprocedure('public.review_partner_application(uuid,text)') is not null as partner_review_ready,
  to_regprocedure('public.claim_transactional_email_job()') is not null as email_claim_ready;

select
  has_function_privilege('authenticated', 'public.review_booking(uuid,text,text)', 'execute')
    as authenticated_review_booking_ready,
  not has_function_privilege('anon', 'public.review_booking(uuid,text,text)', 'execute')
    as anon_review_booking_blocked,
  has_function_privilege('authenticated', 'public.cancel_unpaid_confirmed_booking(uuid,text)', 'execute')
    as authenticated_cancel_unpaid_ready,
  not has_function_privilege('anon', 'public.cancel_unpaid_confirmed_booking(uuid,text)', 'execute')
    as anon_cancel_unpaid_blocked,
  has_function_privilege('service_role', 'public.finalize_test_booking_refund(uuid,text,numeric)', 'execute')
    as service_role_refund_ready,
  not has_function_privilege('authenticated', 'public.finalize_test_booking_refund(uuid,text,numeric)', 'execute')
    as authenticated_refund_blocked,
  has_function_privilege('authenticated', 'public.send_booking_message(uuid,text)', 'execute')
    as authenticated_messages_ready,
  not has_function_privilege('anon', 'public.send_booking_message(uuid,text)', 'execute')
    as anon_messages_blocked,
  has_function_privilege('service_role', 'public.claim_transactional_email_job()', 'execute')
    as service_role_email_claim_ready,
  not has_function_privilege('anon', 'public.claim_transactional_email_job()', 'execute')
    as anon_email_claim_blocked;

select
  relname as table_name,
  relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles','partners','properties','rooms','inventory','bookings',
    'booking_status_history','booking_cancellation_requests','booking_messages',
    'booking_financials','partner_payouts','reward_ledger','notifications',
    'revenue_daily_inputs','revenue_recommendations','revenue_audit_log',
    'revenue_daily_reports','email_outbox'
  )
order by relname;

select
  count(*) = 1
    and bool_and(position('stay_date >= CURRENT_DATE' in with_check) > 0)
    as future_inventory_policy_ready
from pg_policies
where schemaname = 'public'
  and tablename = 'inventory'
  and policyname = 'Partners can manage own inventory';

select
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.booking_cancellation_requests'::regclass
      and conname = 'booking_cancellation_requests_status_check'
      and pg_get_constraintdef(oid) like '%processing%'
  ) as cancellation_processing_state_ready,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'booking_messages'
      and indexname = 'booking_messages_thread_idx'
  ) as booking_message_index_ready;

-- Must return zero rows.
select customer_id, room_id, check_in, check_out, count(*)
from public.bookings
where status in ('pending', 'confirmed')
group by customer_id, room_id, check_in, check_out
having count(*) > 1;

-- Must return zero rows.
select stripe_payment_intent_id, count(*)
from public.bookings
where stripe_payment_intent_id is not null
group by stripe_payment_intent_id
having count(*) > 1;

-- Must return zero rows.
select p.id, p.name, pa.status
from public.properties p
join public.partners pa on pa.id = p.partner_id
where p.active = true and pa.status <> 'approved';
