import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202608230068_flight_commerce_foundation.sql";
const migration = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const rollback = readFileSync(
  "supabase/rollbacks/202608230068_flight_commerce_foundation.rollback.sql",
  "utf8",
);
const bootstrap = readFileSync("supabase/schema.sql", "utf8");

const tables = [
  "flight_runtime_controls",
  "flight_runtime_control_receipts",
  "flight_searches",
  "flight_offers",
  "flight_offer_segments",
  "flight_offer_fare_terms",
  "flight_reprice_receipts",
  "flight_orders",
  "flight_passenger_refs",
  "flight_ticket_documents",
  "flight_payments",
  "flight_service_requests",
  "flight_provider_events",
  "flight_idempotency_records",
  "flight_reconciliation_cases",
] as const;

describe("flight commerce foundation migration", () => {
  it("defines every end-to-end commerce evidence relation in one unapplied transaction", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const table of tables) {
      expect(migration).toContain(`create table public.${table}`);
    }
    for (const receipt of [
      "request_fingerprint_sha256",
      "provider_offer_ref_sha256",
      "terms_summary_sha256",
      "customer_acceptance_sha256",
      "secure_pii_record_ref",
      "document_ref_sha256",
      "processor_reference_sha256",
      "provider_event_id_sha256",
      "expected_state_sha256",
      "observed_state_sha256",
    ]) {
      expect(migration).toContain(receipt);
    }
  });

  it("keeps every execution mode disabled until exact session and database binding is authorized", () => {
    expect(migration).toContain("execution_kill_switch_engaged boolean not null default true");
    for (const control of [
      "synthetic_execution_enabled",
      "provider_sandbox_traffic_enabled",
      "provider_live_traffic_enabled",
      "shopping_enabled",
      "order_enabled",
      "payment_enabled",
      "ticketing_enabled",
      "servicing_enabled",
      "provider_events_enabled",
      "production_release_enabled",
    ]) {
      expect(migration).toContain(`${control} boolean not null default false`);
    }
    for (const binding of [
      "bound_environment",
      "bound_project_ref",
      "bound_database_name",
      "bound_session_user",
      "bound_provider_code",
      "bound_provider_account_sha256",
      "bound_point_of_sale",
      "bound_content_scope_sha256",
      "bound_adapter_version_sha256",
      "bound_payment_processor_code",
      "bound_payment_account_sha256",
      "bound_payment_environment",
      "bound_payment_source_sha256",
      "bound_payment_adapter_version_sha256",
      "bound_execution_scope_sha256",
      "activation_evidence_sha256",
    ]) {
      expect(migration).toContain(binding);
    }
    for (const sessionSetting of [
      "app.flight_environment",
      "app.flight_project_ref",
      "app.flight_execution_authorized",
      "app.flight_activation_evidence_sha256",
    ]) {
      expect(migration).toContain(`current_setting('${sessionSetting}', true)`);
    }
    expect(migration).toContain("v_control.execution_kill_switch_engaged");
    expect(migration).toContain("current_database()::text is distinct from v_control.bound_database_name");
    expect(migration).toContain("session_user::text is distinct from v_control.bound_session_user");
    expect(migration).toContain("receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256");
    expect(migration).toContain("receipt.bound_provider_code is not distinct from v_control.bound_provider_code");
    expect(migration).toContain("role = 'admin'");
    expect(migration).toContain("new.updated_by <> auth.uid()");
    expect(migration).toContain("Fresh flight activation evidence is required");
    expect(migration).toContain("p_execution_mode = 'synthetic' and not v_control.synthetic_execution_enabled");
    expect(migration).toContain("p_execution_mode = 'synthetic' and p_capability <> 'shopping'");
    expect(migration).not.toMatch(/if p_execution_mode = 'synthetic' then\s+return true;/);
    expect(migration).toContain(
      "p_capability not in ('shopping', 'order', 'payment', 'ticketing', 'servicing', 'provider_event')",
    );
    expect(migration).toContain(
      "grant execute on function public.flight_runtime_capability_enabled(text, text, text, text, text)",
    );
    expect(migration).not.toContain(
      "flight_runtime_capability_enabled(text, text, text) to service_role",
    );
    expect(migration).toContain(
      "p_execution_scope_sha256 is distinct from v_control.bound_execution_scope_sha256",
    );
    expect(migration).toContain(
      "Flight execution scope must change if and only if a bound identity changes",
    );
    expect(migration).toMatch(
      /enforce_flight_evidence_runtime_capability\(\)[\s\S]{0,220}declare\s+v_capability text;\s+v_provider_code text;/,
    );
  });

  it("uses stage-specific order authorities and corresponding state evidence", () => {
    expect(migration).toContain("enforce_flight_order_runtime_capability()");
    expect(migration).toContain("when 'pending_payment' then 'order'");
    expect(migration).toContain("when 'payment_authorized' then 'payment'");
    expect(migration).toContain("when 'order_creating' then 'order'");
    expect(migration).toContain("when 'ticketing_pending' then 'ticketing'");
    expect(migration).toContain("when 'servicing' then 'servicing'");
    expect(migration).toContain("when 'cancellation_pending' then 'servicing'");
    expect(migration).toContain("when 'refund_pending' then 'servicing'");
    expect(migration).toContain(
      "for each row execute function public.enforce_flight_order_runtime_capability()",
    );
    expect(migration).not.toMatch(
      /create trigger flight_orders_runtime_guard[\s\S]{0,180}enforce_flight_runtime_capability\('shopping'\)/,
    );
    for (const evidence of [
      "Exact authorized flight payment evidence is required",
      "Exact captured flight payment evidence is required before ticketing",
      "Exact passenger-reference evidence is required before ticketing",
      "Exactly one issued ticket document is required for every passenger",
      "Accepted flight service evidence is required",
      "Accepted flight cancellation evidence is required",
      "Completed provider cancellation evidence is required",
      "Exact in-progress refund, service, and inactive-ticket evidence is required",
      "Exact completed refund, service, and ticket evidence is required",
    ]) {
      expect(migration).toContain(evidence);
    }
    expect(migration).toMatch(
      /flight_orders_evidence_guard[\s\S]{0,420}provider_created_at,\s+currency, total_cents, status/,
    );
    expect(migration).toContain(
      "new.status in ('pending_payment', 'payment_authorized', 'order_creating')",
    );
  });

  it("revalidates every cross-order field that can change authoritative evidence", () => {
    expect(migration).toMatch(
      /flight_payments_order_mode_guard[\s\S]{0,440}order_id, execution_mode, execution_scope_sha256, processor_code,[\s\S]*?idempotency_key_sha256, currency, authorized_cents,[\s\S]*?captured_cents, refunded_cents, status/,
    );
    expect(migration).toMatch(
      /flight_provider_events_order_mode_guard[\s\S]{0,240}order_id, execution_mode, execution_scope_sha256, provider_code,[\s\S]*?signature_verified, processing_status/,
    );
    expect(migration).toMatch(
      /flight_service_requests_order_mode_guard[\s\S]{0,400}order_id, execution_mode, execution_scope_sha256,[\s\S]*?requested_by, request_type,[\s\S]*?request_sha256, status/,
    );
    expect(migration).toContain("flight_passenger_refs_order_mode_guard");
    expect(migration).toContain("flight_idempotency_records_resource_guard");
    expect(migration).toContain("Flight idempotency resource does not match its execution scope");
    expect(migration).toContain("Flight provider order identity is immutable after binding");
    expect(migration).toContain(
      "Flight provider order identity must bind atomically when the order is booked",
    );
    expect(migration).toContain(
      "Flight ticketing deadline must follow provider creation and precede departure",
    );
    expect(migration).toContain("Flight order ticketing deadline has expired");
    expect(migration).toMatch(
      /new\.status in \('ticketing_pending', 'ticketed'\)[\s\S]{0,100}new\.ticketing_deadline_at <= clock_timestamp\(\)/,
    );
    expect(migration).toContain("Flight provider event identity and payload digest are immutable");
    expect(migration).toContain("Flight payment processor, idempotency, and order evidence are immutable");
    expect(migration).toContain("Flight reconciliation identity and observed evidence are immutable");
    for (const relation of [
      "flight_searches",
      "flight_offers",
      "flight_orders",
      "flight_passenger_refs",
      "flight_ticket_documents",
      "flight_payments",
      "flight_service_requests",
      "flight_provider_events",
      "flight_idempotency_records",
      "flight_reconciliation_cases",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `before insert or update on public\\.${relation}\\s+for each row execute function public\\.protect_flight_operational_evidence\\(\\)`,
        ),
      );
    }
    expect(migration).toContain("Flight evidence must be inserted in its exact initial lifecycle state");
  });

  it("requires a separate actor-bound receipt for changed-price acceptance", () => {
    expect(migration).toContain("customer_accepted_by uuid references public.profiles(id)");
    expect(migration).toContain("customer_acceptance_sha256 text check");
    expect(migration).toContain("customer_acceptance_version smallint check");
    expect(migration).toContain("customer_accepted_currency text check");
    expect(migration).toContain("customer_accepted_total_cents bigint check");
    expect(migration).toContain("Flight reprice acceptance must be recorded after receipt creation");
    expect(migration).toContain("new.customer_accepted_by <> v_customer_id");
    expect(migration).toContain("auth.uid() <> new.customer_accepted_by");
    expect(migration).toContain("new.customer_accepted_currency = old.currency");
    expect(migration).toContain("new.customer_accepted_total_cents = old.repriced_total_cents");
    expect(migration).toContain('create policy "Customers accept own changed flight price"');
    expect(migration).toContain("Actor-bound customer acceptance is required for a changed flight price");
    expect(migration).toContain("to_regprocedure('extensions.digest(bytea,text)')");
    expect(migration).toContain("iratepilot.flight.reprice.acceptance.v1");
    expect(migration).toContain("new.customer_acceptance_version := 1");
    expect(migration).toContain("new.customer_acceptance_sha256 := encode(");
    expect(migration).not.toMatch(
      /grant update \([\s\S]{0,180}customer_acceptance_sha256[\s\S]{0,80}\) on public\.flight_reprice_receipts/,
    );
    expect(migration).toMatch(
      /create trigger flight_reprice_receipts_immutable_guard\s+before insert or update/,
    );
  });

  it("stores no arbitrary itinerary, fare-rule, provider, passenger, or payment JSON", () => {
    expect(migration).toContain("itinerary_sha256 text not null");
    expect(migration).toContain("fare_rules_sha256 text not null");
    expect(migration).toContain("create table public.flight_offer_segments");
    expect(migration).toContain("create table public.flight_offer_fare_terms");
    expect(migration).toContain("origin_iata text not null");
    expect(migration).toContain("operating_carrier text not null");
    expect(migration).toContain("marketing_flight_number text not null");
    expect(migration).not.toMatch(/^\s*flight_number text not null/m);
    expect(migration).toContain("journey_direction text not null");
    expect(migration).toContain("departure_local_date date not null");
    expect(migration).toContain("arrival_local_date date not null");
    expect(migration).toMatch(
      /departure_local_date between\s+\(departure_at at time zone 'UTC'\)::date - 1\s+and \(departure_at at time zone 'UTC'\)::date \+ 1/,
    );
    expect(migration).toMatch(
      /arrival_local_date between\s+\(arrival_at at time zone 'UTC'\)::date - 1\s+and \(arrival_at at time zone 'UTC'\)::date \+ 1/,
    );
    expect(migration).toContain("terms_summary_sha256 text not null");
    expect(migration).toContain("Complete normalized flight itinerary and fare evidence is required");
    expect(migration).toContain("v_search.journey_type = 'round_trip'");
    expect(migration).toContain("following.origin_iata <> prior.destination_iata");
    expect(migration).toContain("Flight itinerary cabin does not match the requested cabin");
    expect(migration).toContain(
      "Flight outbound itinerary does not match the requested route and date",
    );
    expect(migration).toContain(
      "Flight return itinerary does not match the requested route and date",
    );
    expect(migration).toContain("v_outbound_last_sequence >= v_return_first_sequence");
    expect(migration).toContain(
      "v_outbound_departure_at <= clock_timestamp() + interval '30 minutes'",
    );
    expect(migration).toContain(
      "arrival_at = departure_at + duration_minutes * interval '1 minute'",
    );
    expect(migration).not.toContain("flight_json_is_sanitized");
    expect(migration).not.toMatch(/\bitinerary\s+jsonb\b/i);
    expect(migration).not.toMatch(/\bfare_rules(?:_summary)?\s+jsonb\b/i);
    expect(migration).not.toMatch(/\b(raw_)?payload\s+jsonb\b/i);
    expect(migration).not.toMatch(/\b(passenger|payment)_json\b/i);
    expect(migration).toContain("provider_payload_sha256");
    expect(migration).toContain("payload_sha256");
    expect(migration).not.toContain("'payment_updated'");
    expect(migration).toContain("payment-processor and raw webhook payloads are not stored");
    expect(migration).toContain("pii_record_sha256");
    expect(migration).toContain("idempotency_key_sha256");
  });

  it("enables forced RLS without giving any role delete or truncate authority", () => {
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toMatch(
      /revoke all on table[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(/grant select, insert, update on table[\s\S]*?to service_role;/);
    expect(migration).toContain(
      "grant select on table public.flight_runtime_controls to service_role",
    );
    expect(migration).toContain(
      "grant select on table public.flight_runtime_control_receipts to service_role",
    );
    expect(migration).toMatch(
      /grant select, insert on table\s+public\.flight_offer_segments,\s+public\.flight_offer_fare_terms\s+to service_role/,
    );
    expect(migration).not.toMatch(/grant all on table[\s\S]*?to service_role;/);
    expect(migration).not.toMatch(/grant (delete|truncate)/i);
    expect(migration.match(/for update to authenticated/g)).toHaveLength(3);
    expect(migration).not.toMatch(/for (insert|delete) to authenticated/i);
    expect(migration).toContain('create policy "Flight admins update runtime controls"');
    expect(migration).toContain('create policy "Flight admins resolve flight reconciliation"');
    expect(migration).toContain('create policy "Customers read own flight orders"');
    expect(migration).toContain('create policy "Customers read own flight offer segments"');
    expect(migration).toContain('create policy "Customers read own flight fare terms"');
    expect(migration).toContain("customer_id = auth.uid()");
  });

  it("scopes provider identities and external references to the exact execution environment", () => {
    expect(migration.match(/execution_scope_sha256 text not null/g)).toHaveLength(13);
    for (const binding of [
      "bound_provider_code is not null",
      "bound_provider_account_sha256 is not null",
      "bound_point_of_sale is not null",
      "bound_content_scope_sha256 is not null",
      "bound_adapter_version_sha256 is not null",
      "bound_payment_processor_code is not null",
      "bound_payment_account_sha256 is not null",
      "bound_payment_source_sha256 is not null",
      "bound_payment_adapter_version_sha256 is not null",
    ]) {
      expect(migration).toContain(binding);
    }
    expect(migration).toContain(
      "p_provider_code is not null and p_provider_code <> v_control.bound_provider_code",
    );
    expect(migration).toContain(
      "p_processor_code <> v_control.bound_payment_processor_code",
    );
    for (const scopedUnique of [
      "unique (execution_scope_sha256, execution_mode, provider_code, provider_offer_ref_sha256)",
      "unique (execution_scope_sha256, execution_mode, provider_code, provider_order_ref_sha256)",
      "unique (execution_scope_sha256, execution_mode, document_ref_sha256)",
      "unique (execution_scope_sha256, execution_mode, processor_code, processor_reference_sha256)",
      "unique (execution_scope_sha256, execution_mode, idempotency_key_sha256)",
      "unique (execution_scope_sha256, execution_mode, provider_code, provider_event_id_sha256)",
      "unique (execution_scope_sha256, execution_mode, scope, key_sha256)",
    ]) {
      expect(migration).toContain(scopedUnique);
    }
  });

  it("quarantines ambiguous payments and requires an explicit cancellation-refund lifecycle", () => {
    expect(migration).toContain("create unique index flight_payments_one_nonfailed_attempt_uidx");
    expect(migration).toContain("where status <> 'failed'");
    expect(migration).toContain(
      "status <> 'cancelled' or (captured_cents = 0 and refunded_cents = 0)",
    );
    expect(migration).toMatch(
      /status <> 'failed'\s+or \(authorized_cents = 0 and captured_cents = 0 and refunded_cents = 0\)/,
    );
    expect(migration).toContain("'cancellation_pending',");
    expect(migration).toContain("'cancelled', 'refund_pending', 'refunded'");
    expect(migration).toContain(
      "old.status = 'cancellation_pending' and new.status in ('cancelled', 'requires_review')",
    );
    expect(migration).toContain("old.status = 'cancelled' and new.status = 'refund_pending'");
    expect(migration).toContain(
      "old.status = 'refund_pending' and new.status in ('refunded', 'requires_review')",
    );
    expect(migration).toContain("Refund-in-progress evidence cannot drift");
    expect(migration).toContain("Ticket refund evidence cannot drift");
    expect(migration).toContain("Resolved payment reconciliation evidence is required after ambiguity");
    expect(migration).toContain(
      "Resolved servicing reconciliation evidence is required after review",
    );
    expect(migration).toContain(
      "Resolved administrator-attributed reconciliation evidence is required",
    );
    for (const binding of [
      "subject_type text not null",
      "subject_id uuid not null",
      "source_status text not null",
      "source_revision_at timestamptz not null",
      "target_status text not null",
      "target_state_sha256 text not null",
      "target_authorized_cents bigint",
      "target_captured_cents bigint",
      "target_refunded_cents bigint",
    ]) {
      expect(migration).toContain(binding);
    }
    expect(migration).toContain(
      "Flight reconciliation subject, source state, or revision does not match",
    );
    expect(migration).toContain("iratepilot.flight.reconciliation.target.v1");
    expect(migration).toContain("reconciliation.subject_type = 'flight_order'");
    expect(migration).toContain("reconciliation.subject_type = 'flight_payment'");
    expect(migration).toContain("reconciliation.subject_type = 'flight_service_request'");
    expect(migration).toContain("reconciliation.source_revision_at = old.updated_at");
    expect(migration).toContain("reconciliation.target_status = new.status");
    expect(migration).toContain(
      "new.status in ('pending_payment', 'order_creating', 'failed')",
    );
    expect(migration).toContain("reconciliation.case_type = 'ambiguous_order'");
    expect(migration).toMatch(
      /new\.status = 'cancelled'[\s\S]{0,220}new\.provider_order_ref_sha256 is null[\s\S]{0,180}reconciliation\.case_type in \('payment_order_mismatch', 'ambiguous_order'\)/,
    );
    expect(migration).toMatch(
      /new\.status = 'cancelled'[\s\S]{0,420}new\.provider_order_ref_sha256 is not null[\s\S]{0,120}reconciliation\.case_type = 'servicing_mismatch'/,
    );
    expect(migration).not.toMatch(
      /old\.status = 'requires_review' and new\.status in \([^)]*'booked'/,
    );
    expect(migration).toContain(
      "Early flight order states require zero provider-order, ticket, and service liability",
    );
    expect(migration).toMatch(
      /new\.status in \('pending_payment', 'payment_authorized', 'order_creating'\)[\s\S]{0,900}new\.provider_order_ref_sha256 is not null[\s\S]{0,900}from public\.flight_ticket_documents[\s\S]{0,900}from public\.flight_service_requests/,
    );
    expect(migration).toContain(
      "Pending flight orders require exact zero monetary liability",
    );
    expect(migration).toMatch(
      /new\.status = 'pending_payment'[\s\S]{0,700}authorized_cents <> 0[\s\S]{0,500}status not in \([\s\S]{0,160}'requires_payment_method', 'requires_action', 'cancelled', 'failed'/,
    );
    expect(migration).toContain(
      "Flight reconciliation resolution requires its authenticated administrator",
    );
    expect(migration).toContain("new.resolved_at := greatest(clock_timestamp()");
    expect(migration).toContain("Flight orders can fail only with exact zero-liability evidence");
    expect(migration).toContain(
      "Pending flight orders can cancel only with exact zero-liability evidence",
    );
    expect(migration).toContain(
      "Exact cancelled or captured payment and inactive-ticket evidence is required",
    );
    expect(migration).toContain(
      "Flight payment lifecycle is incompatible with its parent order state",
    );
    expect(migration).toContain(
      "Flight ticket lifecycle is incompatible with its parent order state",
    );
    expect(migration).toMatch(
      /v_child_status = 'captured'[\s\S]{0,220}v_order\.status in \(\s*'payment_authorized', 'order_creating', 'booked'/,
    );
    expect(migration).toMatch(
      /v_child_status = 'pending'[\s\S]{0,120}v_order\.status in \('ticketing_pending', 'servicing'\)/,
    );
    expect(migration).not.toContain(
      "old.status = 'payment_authorized' and new.status in ('order_creating', 'cancelled', 'failed'",
    );
  });

  it("captures ticket identity exactly once and prevents duplicate active e-tickets", () => {
    expect(migration).toContain("document_ref_ciphertext text,");
    expect(migration).toContain("document_ref_sha256 is null or document_ref_sha256");
    expect(migration).toContain("status in ('pending', 'failed')");
    expect(migration).toContain("Flight ticket provider identity is immutable after binding");
    expect(migration).toContain("issuing_carrier text not null");
    expect(migration).toContain(
      "Flight ticket issuing carrier does not match the order validating carrier",
    );
    expect(migration).toContain("create unique index flight_ticket_documents_one_active_eticket_uidx");
    expect(migration).toContain(
      "where document_type = 'electronic_ticket' and status in ('pending', 'issued')",
    );
    expect(migration).toContain(
      "Exactly one issued ticket document is required for every passenger",
    );
    expect(migration).toContain("status not in ('voided', 'refunded', 'failed')");
  });

  it("preserves seated and lap infant distinctions through ticketing evidence", () => {
    expect(migration).toContain("infant_in_seat_count smallint not null default 0");
    expect(migration).toContain("infant_on_lap_count smallint not null default 0");
    expect(migration).toContain("infant_on_lap_count <= adult_count");
    expect(migration).toContain(
      "traveler_type in ('adult', 'child', 'infant_in_seat', 'infant_on_lap')",
    );
    expect(migration).toContain(
      "v_actual_infants_in_seat is distinct from v_expected_infants_in_seat",
    );
    expect(migration).toContain(
      "v_actual_infants_on_lap is distinct from v_expected_infants_on_lap",
    );
    expect(migration).not.toMatch(/\binfant_count\b/);
  });

  it("serializes each order and its child evidence before evaluating cross-row gates", () => {
    expect(migration).toContain("create or replace function public.lock_flight_order_parent()");
    expect(migration).toMatch(
      /create or replace function public\.lock_flight_order_parent\(\)[\s\S]*?from public\.flight_orders[\s\S]*?for update;/,
    );
    for (const trigger of [
      "flight_passenger_refs_00_parent_lock_guard",
      "flight_ticket_documents_00_parent_lock_guard",
      "flight_payments_00_parent_lock_guard",
      "flight_service_requests_00_parent_lock_guard",
      "flight_provider_events_00_parent_lock_guard",
      "flight_reconciliation_cases_00_parent_lock_guard",
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
      expect(rollback).toContain(`drop trigger ${trigger}`);
    }
    expect(migration).toMatch(
      /from public\.flight_searches where id = new\.search_id\s+for share;/,
    );
    expect(migration).toMatch(
      /from public\.flight_offers where id = new\.offer_id\s+for share;/,
    );
    expect(migration).toMatch(
      /from public\.flight_reprice_receipts where id = new\.reprice_receipt_id\s+for share;/,
    );
    expect(migration).toContain("v_offer.expires_at <= clock_timestamp()");
    expect(migration).toContain("new.ticketing_deadline_at <= clock_timestamp()");
    expect(rollback).toContain("drop function public.lock_flight_order_parent()");
  });

  it("binds idempotency scopes to exact resource kinds and complete result evidence", () => {
    expect(migration).toContain(
      "if new.resource_type is distinct from (case new.scope",
    );
    expect(migration).toContain("end) then");
    for (const mapping of [
      "when 'search' then 'flight_search'",
      "when 'reprice' then 'flight_reprice_receipt'",
      "when 'order' then 'flight_order'",
      "when 'payment' then 'flight_payment'",
      "when 'ticket' then 'flight_ticket_document'",
      "when 'service' then 'flight_service_request'",
      "when 'webhook' then 'flight_provider_event'",
    ]) {
      expect(migration).toContain(mapping);
    }
    expect(migration).toContain("Flight idempotency scope does not match its resource type");
    expect(migration).toContain(
      "status = 'succeeded' and response_sha256 is not null and resource_id is not null",
    );
  });

  it("allows repeat searches only after the matching active search closes", () => {
    expect(migration).toContain("create unique index flight_searches_active_fingerprint_uidx");
    expect(migration).toContain("where status in ('created', 'searching')");
    expect(migration).not.toContain("unique (customer_id, request_fingerprint_sha256)");
  });

  it("locks every relation before checking and performing a guarded rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: flight provider request-attempt migration 069 is still installed",
    );
    expect(rollback).toContain(
      "to_regclass('public.flight_provider_request_attempts') is not null",
    );
    expect(rollback).toContain("in access exclusive mode;");
    expect(rollback.indexOf("in access exclusive mode;")).toBeLessThan(
      rollback.indexOf("Refusing rollback: flight commerce evidence exists"),
    );
    for (const table of tables.filter((table) => table !== "flight_runtime_controls")) {
      expect(rollback).toContain(`exists (select 1 from public.${table})`);
      expect(rollback).toContain(`drop table public.${table}`);
    }
    expect(rollback).toContain("drop trigger flight_idempotency_records_resource_guard");
    expect(rollback).toContain("drop trigger flight_offer_segments_append_only_guard");
    expect(rollback).toContain("drop trigger flight_runtime_controls_receipt_guard");
    expect(rollback).toContain("drop trigger flight_payments_00_parent_lock_guard");
    expect(rollback).toContain("drop trigger flight_ticket_documents_00_parent_lock_guard");
    expect(rollback).toContain("drop function public.enforce_flight_order_runtime_capability()");
    expect(rollback).toContain("drop function public.lock_flight_order_parent()");
    expect(rollback).toContain(
      "drop function public.flight_runtime_capability_enabled(text, text, text, text, text)",
    );
    expect(rollback.indexOf("drop function public.flight_runtime_capability_enabled")).toBeLessThan(
      rollback.indexOf("drop table public.flight_runtime_controls"),
    );
  });

  it("mirrors migration 068 exactly in the bootstrap schema", () => {
    const marker = `-- Mirrored from migrations/${migrationName}.`;
    expect(bootstrap.match(new RegExp(marker.replaceAll(".", "\\."), "g"))).toHaveLength(1);
    expect(bootstrap).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
