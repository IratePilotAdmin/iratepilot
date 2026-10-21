-- Preserve the Data API privileges that existing projects received before Supabase
-- stopped granting new public-schema relations automatically on 2026-10-30.
-- This explicit allowlist keeps fresh migration replays and preview branches aligned
-- with production without restoring broad ALTER DEFAULT PRIVILEGES behavior.

grant select on table
  public."booking_messages",
  public."direct_hotel_runtime_controls"
to anon;

grant select, insert, update, delete on table
  public."booking_cancellation_requests",
  public."booking_financials",
  public."booking_status_history",
  public."bookings",
  public."contact_messages",
  public."inventory",
  public."notifications",
  public."partner_applications",
  public."partner_payouts",
  public."partners",
  public."profiles",
  public."properties"
to anon;

grant select, insert, update, delete on table
  public."revenue_audit_log",
  public."revenue_daily_inputs",
  public."revenue_daily_reports",
  public."revenue_recommendations",
  public."reward_ledger",
  public."rooms",
  public."stripe_financial_events"
to anon;

grant select on table
  public."booking_messages",
  public."direct_hotel_runtime_controls",
  public."flight_offer_fare_terms",
  public."flight_offer_segments",
  public."flight_reconciliation_cases",
  public."flight_runtime_control_receipts",
  public."flight_runtime_controls",
  public."flight_searches",
  public."hotel_commercial_agreement_evidence",
  public."hotel_commercial_agreement_terminations",
  public."hotel_commercial_agreement_version_retirements",
  public."hotel_commercial_agreement_versions"
to authenticated;

grant select on table
  public."hotel_inventory_holds",
  public."hotel_legacy_transaction_controls",
  public."hotel_marketplace_release_authorization_revocations",
  public."hotel_marketplace_release_authorizations",
  public."hotel_payment_launch_authorization_revocations",
  public."hotel_payment_launch_authorizations",
  public."hotel_stay_request_events",
  public."hotel_stay_requests",
  public."partner_application_review_evidence",
  public."partner_team_access_events",
  public."property_commercial_review_evidence"
to authenticated;

grant select, insert, update, delete on table
  public."booking_cancellation_requests",
  public."booking_financials",
  public."booking_status_history",
  public."bookings",
  public."contact_messages",
  public."inventory",
  public."mobile_push_tokens",
  public."notifications",
  public."partner_applications",
  public."partner_payouts",
  public."partner_team_invitations",
  public."partner_team_members"
to authenticated;

grant select, insert, update, delete on table
  public."partners",
  public."profiles",
  public."properties",
  public."property_pms_connections",
  public."property_synxis_onboarding_requests",
  public."revenue_audit_log",
  public."revenue_daily_inputs",
  public."revenue_daily_reports",
  public."revenue_recommendations",
  public."reward_ledger",
  public."rooms",
  public."stripe_financial_events"
to authenticated;

grant select on table
  public."ai_travel_request_windows",
  public."flight_provider_request_attempts",
  public."flight_runtime_control_receipts",
  public."flight_runtime_controls"
to service_role;

grant select, delete on table
  public."irp_pms_outbox_connections"
to service_role;

grant select, insert on table
  public."flight_offer_fare_terms",
  public."flight_offer_segments",
  public."partner_application_review_evidence",
  public."property_commercial_review_evidence"
to service_role;

grant select, insert, update, delete on table
  public."ai_hotel_planner_quota_windows",
  public."ai_hotel_planner_runtime_readiness",
  public."automation_escalation_events",
  public."automation_escalation_policies",
  public."automation_escalations",
  public."automation_executor_registry",
  public."automation_incident_events",
  public."automation_incident_notes",
  public."automation_incidents",
  public."automation_policy_scans",
  public."automation_provider_health_snapshots",
  public."automation_retry_approvals"
to service_role;

grant select, insert, update, delete on table
  public."automation_retry_receipts",
  public."automation_retry_requests",
  public."automation_sandbox_execution_events",
  public."automation_sandbox_executions",
  public."automation_slo_evaluations",
  public."booking_cancellation_requests",
  public."booking_financials",
  public."booking_messages",
  public."booking_status_history",
  public."bookings",
  public."contact_messages",
  public."direct_hotel_runtime_controls"
to service_role;

grant select, insert, update, delete on table
  public."email_delivery_events",
  public."email_outbox",
  public."email_suppressions",
  public."hotel_inventory_holds",
  public."hotel_legacy_transaction_controls",
  public."hotel_stay_request_events",
  public."hotel_stay_requests",
  public."integration_rate_limit_slots",
  public."inventory",
  public."irp_pms_baseline_runs",
  public."irp_pms_booking_versions",
  public."irp_pms_delivery_controls"
to service_role;

grant select, insert, update, delete on table
  public."irp_pms_outbox",
  public."mobile_push_tokens",
  public."notifications",
  public."partner_applications",
  public."partner_payouts",
  public."partner_team_access_events",
  public."partner_team_invitations",
  public."partner_team_members",
  public."partners",
  public."pms_connection_test_events",
  public."pms_webhook_event_receipts",
  public."priority_pms_launch_evidence"
to service_role;

grant select, insert, update, delete on table
  public."profiles",
  public."properties",
  public."property_pms_connections",
  public."property_pms_credentials",
  public."property_synxis_onboarding_requests",
  public."revenue_audit_log",
  public."revenue_daily_inputs",
  public."revenue_daily_reports",
  public."revenue_recommendations",
  public."reward_ledger",
  public."rooms",
  public."stripe_financial_events"
to service_role;

grant select, insert, update, delete on table
  public."synxis_certification_export_receipts",
  public."synxis_crs_evidence_audit",
  public."synxis_crs_launch_evidence",
  public."synxis_request_journal"
to service_role;

grant select, insert, update on table
  public."flight_idempotency_records",
  public."flight_offers",
  public."flight_orders",
  public."flight_passenger_refs",
  public."flight_payments",
  public."flight_provider_events",
  public."flight_reconciliation_cases",
  public."flight_reprice_receipts",
  public."flight_searches",
  public."flight_service_requests",
  public."flight_ticket_documents"
to service_role;

