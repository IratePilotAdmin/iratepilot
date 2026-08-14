-- Read-only production schema inventory.
-- Run this before repairing migration history or applying migrations.
select
  to_regclass('supabase_migrations.schema_migrations')::text as migration_history_table,
  to_regclass('public.booking_messages')::text as booking_messages_table,
  to_regprocedure('public.send_booking_message(uuid,text)')::text as send_booking_message_function,
  to_regprocedure('public.cancel_unpaid_confirmed_booking(uuid,text)')::text as cancel_unpaid_booking_function,
  to_regprocedure('public.review_booking(uuid,text,text)')::text as review_booking_function,
  to_regprocedure('public.finalize_test_booking_refund(uuid,text,numeric)')::text as finalize_refund_function,
  to_regclass('public.integration_rate_limit_slots')::text as synxis_rate_limit_table,
  to_regprocedure('public.reserve_synxis_rate_limit_slot(text,integer)')::text as synxis_rate_limit_function,
  to_regclass('public.synxis_crs_launch_evidence')::text as synxis_launch_evidence_table,
  to_regclass('public.synxis_crs_evidence_audit')::text as synxis_evidence_audit_table,
  to_regclass('public.synxis_request_journal')::text as synxis_request_journal_table,
  to_regprocedure('public.begin_synxis_request_attempt(text,integer,text,text)')::text as synxis_begin_attempt_function,
  to_regprocedure('public.complete_synxis_request_attempt(uuid,text,integer)')::text as synxis_complete_attempt_function,
  to_regclass('public.synxis_certification_export_receipts')::text as synxis_export_receipts_table,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'synxis_certification_export_receipts'
      and column_name = 'receipt_binding_required'
  ) as synxis_schema_v2_column,
  to_regclass('public.property_synxis_onboarding_requests')::text as synxis_property_onboarding_table,
  to_regclass('public.partner_team_members')::text as partner_team_members_table,
  to_regprocedure('public.resolve_partner_integration_access()')::text as partner_integration_access_function,
  to_regclass('public.partner_team_invitations')::text as partner_team_invitations_table,
  to_regprocedure('public.accept_partner_team_invitation(uuid)')::text as partner_invitation_acceptance_function,
  to_regclass('public.partner_team_access_events')::text as partner_team_access_events_table,
  to_regprocedure('public.revoke_own_partner_team_invitation(uuid)')::text as partner_invitation_revocation_function,
  to_regprocedure('public.disable_own_partner_team_member(uuid)')::text as partner_member_deactivation_function,
  (
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public'
  ) as public_table_count,
  coalesce((
    select jsonb_agg(tablename order by tablename)
    from pg_catalog.pg_tables
    where schemaname = 'public'
  ), '[]'::jsonb) as public_tables;
