import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608260120_flight_consumer_webhook_operational_escalation.sql";
const rollbackPath =
  "supabase/rollbacks/202608260120_flight_consumer_webhook_operational_escalation.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const duffelWebhook = readFileSync(
  "lib/flights/consumer-preview/duffel-webhook.server.ts",
  "utf8",
);

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate ", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("Consumer Preview webhook operational escalation migration", () => {
  it("adds one immutable webhook source link per reconciliation case", () => {
    expect(migration).toContain(
      "add column source_webhook_ledger_id uuid\n    references public.flight_consumer_webhook_ledger(id) on delete restrict",
    );
    expect(migration).toContain(
      "create unique index flight_reconciliation_source_webhook_ledger_uidx",
    );
    expect(migration).toContain("where source_webhook_ledger_id is not null");
  });

  it("links Duffel creation failures by offer and post-ticket changes by order", () => {
    const resolver = functionBody("resolve_flight_consumer_duffel_webhook_link_v1");
    expect(resolver).toContain("p_provider_order_ref_sha256 is null\n      and p_provider_offer_ref_sha256 is null");
    expect(resolver).toContain("p_provider_offer_ref_sha256 is null\n       or offer.provider_offer_ref_sha256");
    expect(resolver).toContain("flight_order.provider_order_ref_sha256 = p_provider_order_ref_sha256");
    for (const status of ["order_creating", "ticketing_pending", "ticketed", "servicing"]) {
      expect(resolver).toContain(`'${status}'`);
    }

    const recorder = functionBody(
      "record_flight_consumer_verified_duffel_order_webhook_v1",
    );
    expect(recorder).toContain("p_event_type = 'order.creation_failed'");
    expect(recorder).toContain(
      "or (p_event_type = 'order.creation_failed'\n      and v_order.status not in ('order_creating', 'requires_review'))",
    );
    expect(recorder).not.toContain(
      "p_event_type in ('order.created', 'order.creation_failed')",
    );
    expect(recorder).toContain("and p_provider_offer_ref_sha256 is null");
    expect(recorder).toContain("'air.order.changed', 'order.airline_initiated_change_detected'");
    expect(recorder).toContain("and p_provider_order_ref_sha256 is null");
    expect(recorder.indexOf("select * into v_existing"))
      .toBeLessThan(recorder.indexOf("select * into v_link"));
    expect(recorder).toContain("v_existing.occurred_at <> p_occurred_at");

    const replay = functionBody(
      "resolve_flight_consumer_duffel_webhook_replay_v1",
    );
    expect(replay).toContain("coalesce(auth.role(), '') <> 'service_role'");
    for (const immutableField of [
      "event_id_sha256",
      "idempotency_sha256",
      "payload_sha256",
      "semantic_sha256",
      "verification_receipt_sha256",
      "occurred_at",
      "provider_order_ref_sha256",
      "provider_offer_ref_sha256",
    ]) expect(replay).toContain(`v_existing.${immutableField}`);
    expect(replay).toContain("Flight Duffel webhook replay envelope collides");
    expect(replay).toContain("return query select true, null::uuid");
    expect(replay).not.toContain("payment.status = 'captured'");

    const leaseBound = functionBody(
      "get_flight_consumer_async_duffel_convergence_lease_bound_v1",
    );
    expect(leaseBound).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(leaseBound).toContain(
      "ledger.processing_lease_token_sha256\n        = p_expected_lease_token_sha256",
    );
    expect(leaseBound).toContain(
      "convergence.ledger_state = 'processed'",
    );
    expect(leaseBound).toContain("p_expected_lease_token_sha256 is null");
    expect(leaseBound).toContain("ledger.completed_at is not null");
    expect(leaseBound).toContain("ledger.outcome_sha256 is not null");
    expect(leaseBound).toContain("ledger.processing_attempt_count = 0");
    expect(leaseBound).toContain("ledger.processing_lease_token_sha256 is null");
    expect(leaseBound).toContain("ledger.processing_attempt_count >= 1");
    expect(leaseBound).toContain("ledger.processing_lease_token_sha256 is not null");
  });

  it("persists canonical identities for unlinked Duffel delivery and exact replay", () => {
    const unlinkedRecorder = functionBody(
      "record_flight_consumer_verified_unlinked_duffel_webhook_v1",
    );
    expect(unlinkedRecorder).toContain("coalesce(auth.role(), '') <> 'service_role'");
    for (const eventType of [
      "order.created",
      "order.creation_failed",
      "air.order.changed",
      "order.airline_initiated_change_detected",
    ]) expect(unlinkedRecorder).toContain(`'${eventType}'`);
    expect(unlinkedRecorder).toContain(
      "provider_offer_ref_sha256, provider_order_ref_sha256",
    );
    expect(unlinkedRecorder).toContain(
      "p_provider_offer_ref_sha256, p_provider_order_ref_sha256",
    );
    expect(unlinkedRecorder).toContain("v_existing.order_id is not null");
    expect(unlinkedRecorder).toContain(
      "v_existing.provider_order_ref_sha256 is not null",
    );
    expect(unlinkedRecorder).toContain(
      "v_existing.provider_offer_ref_sha256 is not null",
    );
    expect(migration).toContain(
      "'unlinked_ingress_rpc',\n          'record_flight_consumer_verified_unlinked_duffel_webhook_v1'",
    );
    expect(duffelWebhook).toContain(
      '"record_flight_consumer_verified_unlinked_duffel_webhook_v1",',
    );
    for (const parameter of [
      "p_event_id_sha256",
      "p_idempotency_sha256",
      "p_event_type",
      "p_payload_sha256",
      "p_semantic_sha256",
      "p_verification_receipt_sha256",
      "p_occurred_at",
      "p_live_mode",
      "p_provider_order_ref_sha256",
      "p_provider_offer_ref_sha256",
    ]) expect(duffelWebhook).toContain(parameter);
  });

  it("opens only a local provider-event-gap case for exact adverse linked signals", () => {
    const escalation = functionBody(
      "record_flight_consumer_webhook_operational_escalation_v1",
    );
    expect(escalation).toContain("coalesce(auth.role(), '') <> 'service_role'");
    for (const eventType of [
      "order.creation_failed",
      "air.order.changed",
      "order.airline_initiated_change_detected",
      "payment_intent.payment_failed",
      "charge.refunded",
    ]) expect(escalation).toContain(`'${eventType}'`);
    expect(escalation).toContain("v_ledger.state = 'processing'");
    expect(escalation).toContain("v_ledger.state in ('processed', 'duplicate', 'blocked')");
    expect(escalation).toContain("'provider_event_gap'");
    expect(escalation).toContain("v_source_status, v_target_authorized_cents");
    expect(escalation).not.toMatch(/update\s+public\.flight_(orders|payments)/i);
    expect(escalation).not.toContain("flight_service_requests");
  });

  it("replays from immutable ledger-to-case identity after mutable lifecycle revisions", () => {
    const escalation = functionBody(
      "record_flight_consumer_webhook_operational_escalation_v1",
    );
    const replayStart = escalation.indexOf(
      "-- A replay is bound to immutable verified-webhook identity.",
    );
    const replayEnd = escalation.indexOf("if v_ledger.source = 'duffel' then", replayStart);
    expect(replayStart).toBeGreaterThan(0);
    expect(replayEnd).toBeGreaterThan(replayStart);
    const replay = escalation.slice(replayStart, replayEnd);
    expect(replay).toContain("reconciliation.source_webhook_ledger_id = v_ledger.id");
    expect(replay).toContain("v_case.observed_state_sha256 <> v_observed_state_sha256");
    expect(replay).not.toContain("v_case.source_revision_at");
    expect(replay).not.toContain("v_case.source_status");
    expect(replay).not.toContain("v_case.expected_state_sha256");
    expect(replay).not.toContain("v_case.target_state_sha256");
    expect(replay).not.toContain("v_payment.updated_at");
    expect(replay).not.toContain("v_order.updated_at");
  });

  it("resolves a Duffel operational case after lease completion advances only the order revision", () => {
    const validator = functionBody(
      "validate_flight_consumer_webhook_case_resolution_v1",
    );
    expect(validator).toContain(
      "app.flight_consumer_webhook_case_resolution_expected_updated_at",
    );
    expect(validator).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(validator).toContain("new.resolved_by is distinct from auth.uid()");
    expect(validator).toContain("where id = auth.uid() and role = 'admin'");
    expect(validator).toContain("old.source_webhook_ledger_id is null");
    expect(validator).toContain("old.case_type <> 'provider_event_gap'");
    expect(validator).toContain("old.subject_type <> 'flight_order'");
    expect(validator).toContain(
      "ledger.state in ('processed', 'duplicate', 'blocked')",
    );
    for (const terminalState of ["processed", "duplicate", "blocked"]) {
      expect(validator).toContain(`'${terminalState}'`);
    }
    expect(validator).toContain("ledger.revision = 2");
    expect(validator).toContain("ledger.processing_attempt_count = 0");
    expect(validator).toContain("ledger.processing_lease_token_sha256 is null");
    expect(validator).toContain("ledger.processing_attempt_count >= 1");
    expect(validator).toContain("ledger.processing_lease_token_sha256 is not null");
    expect(validator).toContain(
      "ledger.processing_lease_expires_at\n           > ledger.processing_lease_acquired_at",
    );
    expect(validator).toContain(
      "flight_order.updated_at >= old.source_revision_at",
    );
    expect(validator).not.toContain(
      "flight_order.updated_at = old.source_revision_at",
    );
    expect(validator).toContain("flight_order.status = old.source_status");
    expect(validator).toContain("flight_order.status = old.target_status");
    expect(validator).toContain("payment.status = 'captured'");
    expect(validator).toContain("payment.refunded_cents = 0");
    expect(validator).toContain("attempt.state = 'succeeded'");
    expect(validator).toContain("old.expected_state_sha256 <> v_expected_state_sha256");
    expect(validator).toContain("old.observed_state_sha256 <> v_observed_state_sha256");
    expect(validator).toContain("old.target_state_sha256 <> v_target_state_sha256");
    expect(validator).not.toMatch(/update\s+public\.flight_(orders|payments)/i);

    expect(migration).toContain(
      "rename to resolve_flight_consumer_admin_reconciliation_080_v1",
    );
    expect(migration).toMatch(
      /revoke all on function\s+public\.resolve_flight_consumer_admin_reconciliation_080_v1\([\s\S]*?\)\s+from public, anon, authenticated, service_role;/,
    );
    const resolverStart = migration.lastIndexOf(
      "create function public.resolve_flight_consumer_admin_reconciliation_v1(",
    );
    expect(resolverStart).toBeGreaterThan(0);
    const resolver = migration.slice(
      resolverStart,
      migration.indexOf("\n-- Private contract identity", resolverStart),
    );
    expect(resolver).toContain(
      "'app.flight_consumer_webhook_case_resolution_expected_updated_at'",
    );
    expect(resolver).toContain("p_expected_updated_at::text");
    expect(resolver).toContain(
      "resolve_flight_consumer_admin_reconciliation_080_v1",
    );
    expect(migration).toContain(
      "create trigger flight_reconciliation_cases_webhook_resolution_guard",
    );
    expect(migration).toContain(
      "app.flight_consumer_async_system_resolution_authorized",
    );
    expect(migration).not.toContain(
      "drop trigger flight_reconciliation_cases_immutable_guard",
    );
    expect(migration).toContain(
      "execute function public.validate_flight_consumer_webhook_case_resolution_v1()",
    );
  });

  it("keeps activation closed on an 080-only database and gates the unlock update", () => {
    expect(migration).toContain(
      "do $flight_consumer_preview_081_relocked_precondition$",
    );
    expect(migration).toContain("and control.execution_kill_switch_engaged");
    for (const capability of [
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
    ]) expect(migration).toContain(`and not control.${capability}`);
    expect(migration).toContain(
      "requires relock before migration",
    );
    expect(migration).toContain(
      "rename to get_flight_consumer_preview_activation_preflight_080_v1",
    );
    expect(migration).toContain("rename to activate_flight_consumer_preview_080_v1");
    expect(migration).toContain(
      "'flight-consumer-preview-activation-preflight-v2'::text",
    );
    expect(migration).toContain("flight_consumer_preview_activation_manifest_sha256_v3");
    expect(migration).toContain(
      "b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a",
    );
    expect(migration).toContain("create trigger flight_runtime_controls_081_activation_gate");
    expect(migration).toContain(
      "raise exception 'Flight Consumer Preview activation requires migration 081'",
    );
    expect(migration).toMatch(
      /revoke all on function\s+public\.get_flight_consumer_preview_activation_preflight_080_v1\(text\),[\s\S]*public\.activate_flight_consumer_preview_080_v1/,
    );

    const activationStart = migration.lastIndexOf(
      "create function public.activate_flight_consumer_preview_v1(",
    );
    expect(activationStart).toBeGreaterThan(0);
    const activation = migration.slice(
      activationStart,
      migration.indexOf("\nrevoke all", activationStart),
    );
    expect(activation).toContain(
      "'iratepilot.flight.consumer-preview.activation-evidence.v3'",
    );
    expect(activation).toContain(
      "'activation_manifest_sha256', v_manifest_sha256",
    );
    expect(activation).toContain(
      "'operational_escalation_contract_sha256'",
    );
    expect(activation).toContain(
      "set activation_evidence_sha256 = v_activation_evidence_sha256",
    );
    expect(activation.indexOf("'activation_manifest_sha256', v_manifest_sha256"))
      .toBeLessThan(activation.indexOf("set activation_evidence_sha256"));
    expect(activation.indexOf("set activation_evidence_sha256"))
      .toBeLessThan(activation.lastIndexOf("flight_current_runtime_control_receipt_sha256_v1"));
    expect(activation).toContain(
      "v_runtime_control_receipt_sha256 = v_080.runtime_control_receipt_sha256",
    );
  });

  it("keeps the escalation RPC service-role only and rollback forward-only", () => {
    expect(migration).toMatch(
      /grant execute on function\s+public\.record_flight_consumer_webhook_operational_escalation_v1\([^;]*\)\s+to service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*?public\.resolve_flight_consumer_duffel_webhook_replay_v1\([\s\S]*?\)\s+to service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*?public\.record_flight_consumer_verified_unlinked_duffel_webhook_v1\([\s\S]*?\)\s+to service_role;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function\s+public\.record_flight_consumer_webhook_operational_escalation_v1\([^;]*\)\s+to authenticated;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function[\s\S]*?public\.record_flight_consumer_verified_unlinked_duffel_webhook_v1\([^;]*\)\s+to authenticated;/,
    );
    expect(rollback).toContain("Migration 081 is forward-only");
    expect(rollback).toContain("source_webhook_ledger_id is not null");
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
