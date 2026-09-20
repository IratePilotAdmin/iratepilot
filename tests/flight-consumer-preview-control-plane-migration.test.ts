import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608250076_flight_consumer_preview_control_plane.sql";
const rollbackPath =
  "supabase/rollbacks/202608250076_flight_consumer_preview_control_plane.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("\ncreate ", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("flight consumer Preview control-plane migration", () => {
  it("requires the full 075 orchestration foundation", () => {
    expect(migration).toContain("flight_consumer_webhook_ledger");
    expect(migration).toContain("flight_payment_operation_attempts");
    expect(migration).toContain("flight_payment_refund_evidence");
    expect(migration).toContain(
      "public.get_flight_consumer_preview_runtime_authority_v1()",
    );
    expect(migration).toContain(
      "public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)",
    );
    expect(migration).toContain("extensions.digest(bytea,text)");
  });

  it("derives every final Preview binding and scope inside PostgreSQL", () => {
    const scope = functionBody("flight_consumer_preview_target_scope_sha256_v1");
    for (const preimage of [
      "duffel-test-account:acc_0000B9iZ8kto4H8uYhKSzO",
      "duffel-test-zz-usd-adult-v1",
      "iratepilot-duffel-preview-adapter-v1",
      "stripe-payment-intents:test:manual-capture:v1",
      "iratepilot-flight-consumer-preview-stripe-adapter-v1",
      "duffel-test-balance:acc_0000B9iZ8kto4H8uYhKSzO",
      "duffel-provider-balance:test:v1",
      "iratepilot-duffel-balance-adapter-v1",
    ]) expect(scope).toContain(preimage);
    expect(scope).toContain("iratepilot.flight.consumer-preview.execution-scope.v1");
    expect(scope).toContain("'bound_environment', 'preview'");
    expect(scope).toContain("'bound_project_ref', 'eiqmdldjnedqgbtoozqa'");
    expect(scope).toContain("'bound_payment_processor_code', 'stripe'");
    expect(scope).toContain(
      "'bound_provider_settlement_processor_code', 'duffel_balance'",
    );
  });

  it("activates only from an exact receipted locked predecessor", () => {
    const activation = functionBody("activate_flight_consumer_preview_v1");
    expect(activation).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(activation).toContain("where id = v_actor and role = 'admin'");
    expect(activation).toContain("current_database()::text <> 'postgres'");
    expect(activation).toContain("session_user::text <> 'authenticator'");
    expect(activation).toContain("p_expected_updated_at");
    expect(activation).toContain("p_expected_execution_scope_sha256");
    expect(activation).toContain("p_expected_activation_evidence_sha256");
    expect(activation).toContain("p_expected_runtime_control_receipt_sha256");
    expect(activation).toContain("flight_current_runtime_control_receipt_sha256_v1");
    expect(activation).toContain("v_is_v8_predecessor");
    expect(activation).toContain("v_is_target_predecessor");
    expect(activation).toContain("p_stripe_account_id !~ '^acct_");
    expect(activation).toContain("convert_to(p_stripe_account_id, 'UTF8')");
    expect(activation).not.toContain("p_bound_provider_account_sha256");
    expect(activation).not.toContain("p_bound_payment_account_sha256");
    expect(activation).not.toContain("p_bound_execution_scope_sha256");
    expect(activation).toContain(
      "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
    );
    expect(activation).toContain(
      "6d558fb287fb8ef863a031a3bcd0e9a91602405f16bba660814b4a7b12486ccb",
    );
    expect(activation).toContain("execution_kill_switch_engaged = false");
    expect(activation).toContain("provider_sandbox_traffic_enabled = true");
    expect(activation).toContain("provider_live_traffic_enabled = false");
    expect(activation).toContain("production_release_enabled = false");
    expect(activation).toContain("servicing_enabled = false");
  });

  it("relocks by exact CAS without changing any binding or scope", () => {
    const relock = functionBody("relock_flight_consumer_preview_v1");
    expect(relock).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(relock).toContain("p_expected_runtime_control_receipt_sha256");
    expect(relock).toContain("flight_consumer_preview_control_is_bound_v1");
    expect(relock).toContain("iratepilot.flight.consumer-preview.relock-evidence.v1");
    expect(relock).toContain("execution_kill_switch_engaged = true");
    for (const flag of [
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
    ]) expect(relock).toContain(`${flag} = false`);
    expect(relock).not.toMatch(/set[\s\S]*bound_execution_scope_sha256\s*=/);
  });

  it("uses the official Duffel v2 webhook event vocabulary", () => {
    for (const eventType of [
      "order.created",
      "order.creation_failed",
      "air.order.changed",
      "order.airline_initiated_change_detected",
    ]) expect(migration).toContain(`'${eventType}'`);
    const record = functionBody("record_flight_consumer_verified_webhook_v1");
    expect(record).not.toContain("'order.updated'");
    expect(record).not.toContain("'order.cancelled'");
    expect(record).not.toContain("'order.ticketed'");
    expect(record).not.toContain("'ping.triggered'");
    for (const stripeEvent of [
      "payment_intent.requires_action",
      "payment_intent.amount_capturable_updated",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
      "payment_intent.succeeded",
      "charge.refunded",
    ]) expect(record).toContain(stripeEvent);
    expect(migration).toContain(
      "raise exception 'Unrecognized legacy Duffel webhook evidence must be reviewed before 076'",
    );
    const linkedRecord = functionBody(
      "record_flight_consumer_verified_duffel_order_webhook_v1",
    );
    expect(linkedRecord).toContain("p_live_mode is distinct from false");
    expect(linkedRecord).toContain("provider_live_mode");
  });

  it("adds token-fenced webhook claim, stale reclaim, and completion", () => {
    expect(migration).toContain("processing_lease_token_sha256");
    expect(migration).toContain("processing_lease_acquired_at");
    expect(migration).toContain("processing_lease_expires_at");
    expect(migration).toContain("processing_attempt_count");
    const claim = functionBody("claim_flight_consumer_webhook_lease_v1");
    expect(claim).toContain("p_lease_duration_seconds not between 30 and 300");
    expect(claim).toContain("state = 'processing', revision = revision + 1");
    expect(claim).toContain("processing_attempt_count = 1");
    const reclaim = functionBody("reclaim_flight_consumer_webhook_v1");
    expect(reclaim).toContain("p_expected_revision is distinct from 1");
    expect(reclaim).toContain("p_stale_before > v_now - interval '2 minutes'");
    expect(reclaim).toContain("processing_lease_expires_at > v_now");
    expect(reclaim).toContain(
      "processing_attempt_count = greatest(ledger.processing_attempt_count, 1) + 1",
    );
    expect(reclaim).not.toContain("revision = revision + 1");
    const completion = functionBody("complete_flight_consumer_webhook_lease_v1");
    expect(completion).toContain("processing_lease_token_sha256 = p_lease_token_sha256");
    expect(completion).toContain("state = p_outcome, revision = 2");
    const legacyCompletion = functionBody("complete_flight_consumer_webhook_v1");
    expect(legacyCompletion).toContain("processing_lease_token_sha256 is not null");
  });

  it("provides owner-scoped completion, refund, and search recovery", () => {
    const completion = functionBody("get_flight_consumer_completion_recovery_v1");
    for (const field of [
      "order_id uuid",
      "payment_id uuid",
      "processor_reference_ciphertext text",
      "processor_reference_sha256 text",
      "amount_cents bigint",
      "execution_scope_sha256 text",
    ]) expect(completion).toContain(field);
    expect(completion).toContain("flight_order.customer_id = p_customer_id");
    expect(completion).toContain("flight_order.consumer_flow_version = 1");
    expect(completion).toContain("assert_flight_consumer_preview_runtime_v1");
    const refund = functionBody("get_flight_consumer_refund_evidence_v1");
    expect(refund).toContain("attempt.operation = 'refund'");
    expect(refund).toContain("attempt.state = 'succeeded' and attempt.revision = 2");
    const search = functionBody("get_flight_consumer_search_recovery_v1");
    for (const field of [
      "attempt_revision integer",
      "attempt_state text",
      "request_sha256 text",
      "operation_authority_receipt_sha256 text",
      "terminal_response_sha256 text",
      "terminal_receipt_sha256 text",
    ]) expect(search).toContain(field);
    expect(search).toContain("attempt.operation = 'create_offer_request'");
    expect(search).toContain("v_attempt.retry_authorized");
    expect(search).not.toContain("ciphertext_base64url");
  });

  it("replaces revoked reconciliation reads with one scoped JSON projection", () => {
    const context = functionBody("get_flight_consumer_reconciliation_context_v1");
    for (const key of [
      "'order'",
      "'payment'",
      "'providerAttempt'",
      "'safeResolution'",
      "'refundAttempt'",
      "'refundEvidence'",
      "'ticketCount'",
    ]) expect(context).toContain(key);
    expect(context).toContain("flight_order.customer_id = p_customer_id");
    expect(context).toContain("flight_order.consumer_flow_version = 1");
    expect(context).toContain("assert_flight_consumer_preview_runtime_v1");
    expect(context).toContain("processor_reference_ciphertext");
    expect(context).not.toMatch(/\b(?:card_number|cvc|client_secret|raw_payload)\b/i);
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_reconciliation_context_v1\(uuid, uuid\)\s+to service_role;/,
    );
  });

  it("exposes sanitized authenticated-admin reconciliation list/detail/resolve RPCs", () => {
    for (const name of [
      "list_flight_consumer_admin_reconciliation_v1",
      "get_flight_consumer_admin_reconciliation_v1",
      "resolve_flight_consumer_admin_reconciliation_v1",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("auth.role()");
      expect(body).toContain("role = 'admin'");
      expect(body).toContain("flight_consumer_preview_control_is_bound_v1");
      expect(body).not.toContain("processor_reference_ciphertext");
      expect(body).not.toContain("provider_order_ref_ciphertext");
    }
    const resolution = functionBody("resolve_flight_consumer_admin_reconciliation_v1");
    expect(resolution).toContain("p_expected_updated_at");
    expect(resolution).toContain("resolved_by = v_actor");
    expect(resolution).toContain("'replay'::text");
    expect(resolution).toContain("'resolved'::text");
  });

  it("resolves a unique async Duffel webhook link without redispatch", () => {
    const link = functionBody("resolve_flight_consumer_duffel_webhook_link_v1");
    for (const field of [
      "order_id uuid",
      "customer_id uuid",
      "provider_attempt_id uuid",
      "order_status text",
      "execution_scope_sha256 text",
    ]) expect(link).toContain(field);
    expect(link).toContain("flight_order.status in ('requires_review', 'order_creating')");
    expect(link).toContain("offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256");
    expect(link).toContain("attempt.state = 'succeeded' and attempt.revision = 2");
    expect(link).toContain("payment.status = 'captured'");
    expect(link).toContain("v_count <> 1");
    expect(link).toContain("not attempt.retry_authorized");
    expect(link).not.toContain("insert into public.flight_provider_request_attempts");
    expect(link).not.toContain("state = 'dispatching'");
  });

  it("stores separately authenticated encrypted GET-order recovery evidence", () => {
    expect(migration).toContain("create table public.flight_order_recovery_evidence_vault");
    const record = functionBody(
      "record_flight_consumer_duffel_order_recovery_evidence_v1",
    );
    expect(record).toContain("v_ledger.event_type <> 'order.created'");
    expect(record).toContain("v_ledger.state <> 'processed' or v_ledger.revision <> 2");
    expect(record).toContain("v_attempt.state <> 'succeeded' or v_attempt.revision <> 2");
    expect(record).toContain("payment.status = 'captured'");
    expect(record).toContain("p_provider_response_sha256");
    expect(record).not.toContain(
      "p_provider_response_sha256 is distinct from v_attempt.terminal_response_sha256",
    );
    expect(record).toContain("insert into public.flight_order_recovery_evidence_vault");
    expect(record).toContain("Flight Duffel order recovery evidence replay collides");
    const load = functionBody(
      "load_flight_consumer_duffel_order_recovery_evidence_v1",
    );
    expect(load).toContain("ciphertext_base64url text");
    expect(load).toContain("ledger.state = 'processed' and ledger.revision = 2");
    expect(load).toContain("evidence.retention_expires_at > clock_timestamp()");
  });

  it("forces RLS and never grants direct vault access", () => {
    expect(migration).toContain(
      "alter table public.flight_order_recovery_evidence_vault enable row level security",
    );
    expect(migration).toContain(
      "alter table public.flight_order_recovery_evidence_vault force row level security",
    );
    expect(migration).toMatch(
      /revoke all on table public\.flight_order_recovery_evidence_vault\s+from public, anon, authenticated, service_role;/,
    );
    expect(migration).not.toMatch(
      /grant [^;]+ on table public\.flight_order_recovery_evidence_vault/i,
    );
    for (const helper of [
      "flight_current_runtime_control_receipt_sha256_v1",
      "flight_consumer_preview_target_scope_sha256_v1",
      "flight_consumer_preview_control_is_bound_v1",
    ]) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${helper}`),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${helper}`),
      );
    }
  });

  it("grants activation only to authenticated admins and recovery only to service role", () => {
    expect(migration).toMatch(
      /grant execute on function public\.activate_flight_consumer_preview_v1\([\s\S]*?\) to authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.relock_flight_consumer_preview_v1\([\s\S]*?\) to authenticated;/,
    );
    for (const name of [
      "get_flight_consumer_completion_recovery_v1",
      "get_flight_consumer_refund_evidence_v1",
      "get_flight_consumer_search_recovery_v1",
      "resolve_flight_consumer_duffel_webhook_link_v1",
      "record_flight_consumer_duffel_order_recovery_evidence_v1",
      "load_flight_consumer_duffel_order_recovery_evidence_v1",
    ]) expect(migration).toMatch(
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\) to service_role;`),
    );
  });

  it("uses an evidence-preserving forward-only rollback", () => {
    expect(rollback).toContain("Migration 076 is forward-only");
    expect(rollback).toContain("flight_consumer_webhook_ledger");
    expect(rollback).toContain("flight_order_recovery_evidence_vault");
    expect(rollback).toContain("relock_flight_consumer_preview_v1");
    expect(rollback).not.toMatch(/\b(?:drop|truncate|delete|update|insert)\b/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker =
      "-- Mirrored from migrations/202608250076_flight_consumer_preview_control_plane.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
