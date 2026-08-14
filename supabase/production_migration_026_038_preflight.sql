-- Read-only production reconciliation for migrations 026 through 038.
select jsonb_build_object(
  '026', to_regprocedure('public.complete_approved_booking_test_payment(uuid,uuid,text,integer)') is not null,
  '027', exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'booking_financials_stripe_transfer_status_check'
      and pg_get_constraintdef(oid) like '%cancelled%'
  ),
  '028', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name = 'stripe_payment_mode'
  ) and to_regprocedure('public.complete_approved_booking_payment(uuid,uuid,text,integer,text)') is not null
    and coalesce(
      pg_get_functiondef(to_regprocedure('public.finalize_booking_refund(uuid,text,numeric)'))
        like '%then ''cancelled''%', false
    ),
  '029', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners'
      and column_name = 'stripe_connect_mode'
  ),
  '030', to_regclass('public.mobile_push_tokens') is not null,
  '031', to_regclass('public.property_pms_connections') is not null,
  '032', to_regclass('public.property_pms_credentials') is not null
    and to_regclass('public.pms_connection_test_events') is not null,
  '033', coalesce(
    pg_get_functiondef(to_regprocedure('public.apply_marketplace_commission()'))
      like '%0.14%', false
  ),
  '034', to_regclass('public.priority_pms_launch_evidence') is not null,
  '035', (
    select count(*) = 3 from information_schema.columns
    where table_schema = 'public' and table_name = 'priority_pms_launch_evidence'
      and column_name in ('webhook_validated', 'production_smoke_validated', 'live_enabled')
  ),
  '036', (
    select count(*) = 5 from information_schema.columns
    where table_schema = 'public' and table_name = 'priority_pms_launch_evidence'
      and column_name in (
        'vendor_approval_reference', 'approved_environment', 'property_code',
        'support_contact', 'verification_notes'
      )
  ),
  '037', (
    select count(*) = 5 from information_schema.columns
    where table_schema = 'public' and table_name = 'property_pms_connections'
      and column_name in (
        'hotel_authorized', 'room_type_mapping', 'rate_plan_mapping',
        'tax_fee_mapping', 'cancellation_policy_mapping'
      )
  ),
  '038', exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'priority_pms_launch_evidence_provider_id_check'
      and pg_get_constraintdef(oid) like '%hotelogix%'
      and pg_get_constraintdef(oid) like '%oracle-opera%'
  )
) as migration_026_038;
