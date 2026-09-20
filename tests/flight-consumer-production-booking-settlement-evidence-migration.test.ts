import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260113_flight_consumer_live_booking_settlement_evidence.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260113_flight_consumer_live_booking_settlement_evidence.rollback.sql";
const forward = readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = readFileSync(rollbackPath, "utf8").toLowerCase();

describe("Flight Consumer Production booking settlement evidence migration", () => {
  it("declares an exact dark 108/110/111 settlement boundary", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(forward).toContain(
      "flight_consumer_live_checkout_authorization_bridges",
    );
    expect(forward).toContain(
      "flight_consumer_live_duffel_order_execution_receipts",
    );
    expect(forward).toContain(
      "flight_consumer_live_stripe_capture_receipts",
    );
    expect(forward).toContain("attempt_state = 'succeeded'");
    expect(forward).toContain("attempt_state = 'reconciled'");
    expect(forward).toContain("reconciliation_outcome = 'succeeded'");
    expect(forward).toContain("stripe_capture_request_count = 1");
    expect(forward).toContain("stripe_mutation_count = 1");
    expect(forward).not.toContain("202608260112");
  });

  it("binds checkout, offer, payment, order, booking, charge, and money", () => {
    for (const binding of [
      "checkout_binding_sha256",
      "offer_binding_sha256",
      "normalized_offer_sha256",
      "payment_binding_sha256",
      "duffel_order_execution_binding_sha256",
      "stripe_capture_binding_sha256",
      "order_reference_sha256",
      "customer_reference_sha256",
      "payment_intent_reference_sha256",
      "provider_order_reference_sha256",
      "provider_booking_reference_sha256",
      "charge_reference_sha256",
      "captured_amount_cents",
      "currency",
      "duffel_livemode",
      "stripe_livemode",
    ]) {
      expect(forward).toContain(binding);
    }
    expect(forward).toContain("observed_payment_intent_status = 'succeeded'");
    expect(forward).toContain(
      "observed_amount_received_cents = p_captured_amount_cents",
    );
    expect(forward).toContain("observed_currency = lower(p_currency)");
    expect(forward).toContain("observed_livemode");
    expect(forward).not.toMatch(
      /provider_booking_reference_sha256\s+text\s+not\s+null\s+unique/,
    );
    expect(forward).not.toMatch(
      /or settlement\.provider_booking_reference_sha256\s*=\s*p_provider_booking_reference_sha256/,
    );
  });

  it("uses CAS/replay and post-lock trusted chronology", () => {
    expect(forward).toContain("decision text");
    expect(forward).toContain("'replay'::text");
    expect(forward).toContain(
      "receipt.receipt_sha256 = p_prepared_receipt_sha256",
    );
    expect(forward).toContain("booking_revision = p_expected_revision");
    expect(forward).toContain("for update;");
    expect(forward.match(/for key share;/g)).toHaveLength(4);
    expect(forward).toContain("v_now := clock_timestamp()");
    expect(forward).toContain("order_terminal_at <= prepared_at");
    expect(forward).toContain("capture_terminal_at <= prepared_at");
    expect(forward).toContain("v_now < v_settlement.prepared_at");
    expect(forward).toContain("booking_state = 'prepared'");
    expect(forward).toContain("booking_state = 'booked'");
  });

  it("keeps ticketing explicitly pending without issuance evidence", () => {
    expect(forward).toContain(
      "ticketing_state text not null default 'pending'",
    );
    expect(forward).toContain("check (ticketing_state = 'pending')");
    expect(forward).toContain("ticket_evidence_sha256 is null");
    expect(forward).toContain("ticket_issued_at is null");
    expect(forward).toContain("ticket_count = 0");
    expect(forward).toContain("ticket_request_count = 0");
  });

  it("forces RLS, append-only receipts, and service-role-only RPCs", () => {
    expect(forward.match(/enable row level security;/g)).toHaveLength(2);
    expect(forward.match(/force row level security;/g)).toHaveLength(2);
    expect(forward.match(/grant execute on function/g)).toHaveLength(2);
    expect(forward.match(/security definer/g)).toHaveLength(4);
    expect(forward).toContain("set search_path = pg_catalog, public");
    expect(forward).toContain(
      "coalesce(auth.role(), '') <> 'service_role'",
    );
    expect(forward).toContain("receipts are append-only");
    expect(forward).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i,
    );
  });

  it("hard-locks every provider, money, ticket, and release authority", () => {
    for (const authority of [
      "provider_dispatch_authorized",
      "stripe_dispatch_authorized",
      "booking_authorized",
      "order_authorized",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
      "blind_retry_authorized",
    ]) {
      expect(forward).toContain(`check (not ${authority})`);
    }
    for (const counter of [
      "provider_request_count",
      "stripe_request_count",
      "order_request_count",
      "payment_request_count",
      "capture_request_count",
      "refund_request_count",
      "settlement_request_count",
      "ticket_request_count",
      "servicing_request_count",
    ]) {
      expect(forward).toContain(`check (${counter} = 0)`);
    }
    expect(forward).not.toMatch(/\b(?:fetch|axios|stripe\.com|duffel\.com)\b/i);
  });

  it("has a guarded dependency-ordered rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("in access exclusive mode");
    expect(rollback).toContain(
      "refusing rollback: flight consumer live booking settlement evidence exists",
    );
    expect(rollback.indexOf("drop trigger")).toBeLessThan(
      rollback.indexOf("drop function"),
    );
    expect(rollback.indexOf("drop function")).toBeLessThan(
      rollback.indexOf("drop table"),
    );
    expect(rollback).not.toMatch(/cascade|truncate|delete from/i);
  });
});
