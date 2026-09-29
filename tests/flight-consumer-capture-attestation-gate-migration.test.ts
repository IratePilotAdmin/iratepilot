import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "202608260132_flight_consumer_capture_attestation_gate.sql";
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations",
  migrationName,
), "utf8");
const rollback = readFileSync(resolve(
  process.cwd(),
  "supabase/rollbacks/202608260132_flight_consumer_capture_attestation_gate.rollback.sql",
), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const marker = `-- Mirrored from migrations/${migrationName}.`;
const nextMarker =
  "-- Mirrored from migrations/202608260133_flight_consumer_completion_lease_qualification_repair.sql.";

function functionBody() {
  const start = migration.indexOf(
    "create function public.record_flight_consumer_capture_attestation_mismatch_v1",
  );
  const end = migration.indexOf(
    "$record_flight_consumer_capture_attestation_mismatch_093$;",
    start,
  );
  return migration.slice(start, end);
}

describe("Flight Consumer Preview capture attestation gate migration", () => {
  it("is ordered after frozen 092, relocked, and mirrored exactly", () => {
    expect(migration).toContain("requires migrations 068 through 092");
    expect(migration).toContain("Active Flight reconciliation blocks Duffel dispatch");
    expect(migration).toContain("migration 093 requires relock before hardening");
    const markerIndex = schema.lastIndexOf(marker);
    expect(markerIndex).toBeGreaterThan(0);
    const nextMarkerIndex = schema.indexOf(nextMarker, markerIndex + marker.length);
    expect(nextMarkerIndex).toBeGreaterThan(markerIndex);
    expect(schema.slice(markerIndex + marker.length, nextMarkerIndex).trim()).toBe(
      migration.trim(),
    );
  });

  it("uses order-first locking and exact succeeded-rev2 capture evidence", () => {
    const body = functionBody();
    const discover = body.indexOf("select attempt.order_id, attempt.payment_id");
    const orderLock = body.indexOf("from public.flight_orders as flight_order");
    const attemptLock = body.indexOf("from public.flight_payment_operation_attempts as attempt", orderLock + 1);
    const paymentLock = body.indexOf("from public.flight_payments as payment");
    expect(discover).toBeGreaterThan(0);
    expect(orderLock).toBeGreaterThan(discover);
    expect(attemptLock).toBeGreaterThan(orderLock);
    expect(paymentLock).toBeGreaterThan(attemptLock);
    expect(body).toContain("v_attempt.operation <> 'capture'");
    expect(body).toContain("v_attempt.state <> 'succeeded'");
    expect(body).toContain("v_attempt.revision <> p_expected_capture_revision");
    expect(body).toContain("v_attempt.terminal_http_status not between 200 and 299");
    expect(body).toContain("v_attempt.terminal_receipt_sha256 is null");
  });

  it("moves only authorized/captured local projections to non-dispatchable review", () => {
    const body = functionBody();
    expect(body).toContain("v_order.status not in ('payment_authorized', 'order_creating', 'requires_review')");
    expect(body).toContain("v_payment.status = 'authorized' and v_payment.captured_cents = 0");
    expect(body).toContain("v_payment.status = 'captured'");
    expect(body).toContain("set status = 'requires_review'");
    expect(body).toContain("set status = 'ambiguous'");
    expect(body).toContain("'payment_order_mismatch', 'flight_payment'");
    expect(body).toContain("v_target_status, v_target_authorized_cents, v_target_captured_cents");
    expect(body).toContain("and reconciliation.status <> 'resolved'");
  });

  it("replays exact digest evidence without treating mutable timestamps as identity", () => {
    const body = functionBody();
    expect(body).toContain("v_case.expected_state_sha256 is distinct from v_expected_sha256");
    expect(body).toContain("v_case.observed_state_sha256 is distinct from v_observed_sha256");
    expect(body).toContain("v_case.target_state_sha256 is distinct from v_target_sha256");
    expect(body).not.toContain("v_case.source_revision_at is distinct from v_payment.updated_at");
    expect(body).toContain("'mismatch_reason', p_mismatch_reason");
    expect(body).toContain("'observation_sha256', p_observation_sha256");
  });

  it("leaves immutable succeeded Duffel response evidence on its replay path", () => {
    const body = functionBody();
    expect(body).toContain("flight_order_response_evidence_vault");
    expect(body).toContain("provider_attempt.state = 'succeeded'");
    expect(body).toContain("provider_attempt.revision = 2");
    expect(body).toContain("evidence.provider_response_sha256");
    expect(body).toContain("Immutable Flight provider success controls terminal replay");
  });

  it("accepts only categorical digest observations and exposes only service execute", () => {
    const body = functionBody();
    for (const reason of [
      "payment_intent_mismatch",
      "latest_charge_mismatch",
      "refund_observed",
      "dispute_observed",
      "capture_state_mismatch",
      "historical_binding_mismatch",
    ]) expect(body).toContain(`'${reason}'`);
    expect(body).not.toMatch(/card_number|last4|billing_details|payment_method_details|client_secret/i);
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      ") to service_role;",
    );
    expect(migration).toContain("has_function_privilege(\n      'authenticated'");
    expect(migration).toContain("has_function_privilege(\n      'anon'");
    expect(rollback).toContain("ROLLBACK BLOCKED");
    expect(rollback).toContain("forward-only capture-attestation safety evidence");
    expect(rollback).not.toMatch(/drop\s+function|delete\s+from|truncate/i);
  });
});
