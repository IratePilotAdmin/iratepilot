import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260114_flight_consumer_live_stripe_capture_support_identity.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260114_flight_consumer_live_stripe_capture_support_identity.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Flight Consumer Production Stripe capture support identity migration 114", () => {
  it("is transactional and requires the exact 111/112/113 object lineage", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(sha256File(
      "supabase/production-migrations/202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
    )).toBe(
      "26a4c123c0a9e4858f085ee7b86adb02f4ebae1699459cb6575e056775e82524",
    );
    expect(sha256File(
      "supabase/production-migrations/202608260112_flight_consumer_live_duffel_support_identity.sql",
    )).toBe(
      "60a12f1024d91232b2c2e4c86b5b044e29039f4a6c2f0c6697b6c2b18918c2e7",
    );
    expect(sha256File(
      "supabase/production-rollbacks/202608260112_flight_consumer_live_duffel_support_identity.rollback.sql",
    )).toBe(
      "58df3b73396692e6c8dfab486fbe0d6f03406273428bb757770515c45c9ac862",
    );
    expect(sha256File(
      "supabase/production-migrations/202608260113_flight_consumer_live_booking_settlement_evidence.sql",
    )).toBe(
      "2a9ebcea56c561be61ed50b895a46d7507ca06f6a20e7ff469bec7fc87da81f2",
    );
    expect(sha256File(
      "supabase/production-rollbacks/202608260113_flight_consumer_live_booking_settlement_evidence.rollback.sql",
    )).toBe(
      "43af76f346984b2182ef56fe40167305cc83e316a18da5f115fb0213d42731c4",
    );
    for (const prerequisite of [
      "flight_consumer_live_stripe_capture_attempts",
      "flight_consumer_live_stripe_capture_receipts",
      "flight_consumer_live_booking_settlements",
      "finalize_flight_consumer_live_booking_settlement_v1",
      "complete_flight_consumer_live_duffel_order_execution_v2",
      "complete_flight_consumer_live_stripe_capture_v1",
      "extensions.digest(bytea,text)",
    ]) expect(forward).toContain(prerequisite);
    expect(forward).toContain(
      "requires exact 111, 112, and 113 predecessors",
    );
  });

  it("retains validated plaintext support IDs and their exact SHA-256", () => {
    for (const field of [
      "client_correlation_id text",
      "client_correlation_id_sha256 text",
      "stripe_request_id text",
      "stripe_request_id_sha256 text",
      "stripe_transport_outcome text",
    ]) expect(forward).toContain(field);
    expect(forward).toContain("^flt_capture_[0-9a-f]{48}$");
    expect(forward).toContain(
      "'flt_capture_' || left(capture_request_sha256, 48)",
    );
    expect(forward).toContain("^req_[A-Za-z0-9]{8,128}$");
    expect(forward).toContain(
      "convert_to(p_client_correlation_id, 'UTF8'), 'sha256'",
    );
    expect(forward).toContain(
      "convert_to(p_stripe_request_id, 'UTF8'), 'sha256'",
    );
  });

  it("requires local correlation for every call and Stripe Request-Id for every HTTP response", () => {
    expect(forward).toContain("stripe_capture_request_count = 1");
    expect(forward).toContain("client_correlation_id is not null");
    expect(forward).toContain("terminal_http_status is null");
    expect(forward).toContain("stripe_request_id is null");
    expect(forward).toContain("terminal_http_status is not null");
    expect(forward).toContain("stripe_request_id is not null");
    expect(forward).toContain("stripe_transport_outcome = 'no_response'");
    expect(forward).toContain("stripe_transport_outcome = 'http_response'");
    expect(forward).toContain("stripe_transport_outcome is not null");
    expect(forward).toContain("terminal_response_sha256 is null");
  });

  it("prevents v1 completion bypass and refuses support identity replay drift", () => {
    expect(forward).toContain(
      "Flight Consumer Live Stripe capture v1 completion bypass refused",
    );
    expect(forward).toContain(
      "iratepilot.stripe_capture_support_identity_v2",
    );
    expect(forward).toContain(
      "Flight Consumer Live Stripe capture support identity replay collision",
    );
    expect(forward).toContain("for update;");
    expect(forward.indexOf("for update;")).toBeLessThan(
      forward.indexOf(
        "perform set_config(\n    'iratepilot.stripe_capture_support_identity_v2'",
      ),
    );
    expect(forward).toMatch(
      /revoke execute on function[\s\S]*complete_flight_consumer_live_stripe_capture_v1[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(forward).toMatch(
      /grant execute on function[\s\S]*complete_flight_consumer_live_stripe_capture_v2[\s\S]*to service_role;/,
    );
    expect(forward).toContain(
      "read_flight_consumer_live_stripe_capture_support_identity_v1",
    );
    expect(forward).toContain("for key share;");
    expect(forward).toMatch(
      /from public\.flight_consumer_live_stripe_capture_receipts as receipt[\s\S]*receipt\.attempt_id = attempt\.id[\s\S]*receipt\.attempt_revision = attempt\.attempt_revision[\s\S]*receipt\.attempt_state = attempt\.attempt_state[\s\S]*receipt\.receipt_sha256 = attempt\.latest_state_receipt_sha256/,
    );
  });

  it("keeps forced RLS, fixed search paths, service-only RPC, and zero authority", () => {
    expect(forward).toContain("force row level security");
    expect(forward).toMatch(
      /revoke all on table[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(forward).toContain(
      "set search_path = pg_catalog, public, extensions",
    );
    expect(forward).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(forward).not.toMatch(
      /grant execute[\s\S]{0,800}\bto (?:public|anon|authenticated)\b/i,
    );
    expect(forward).toMatch(
      /grant execute on function[\s\S]*read_flight_consumer_live_stripe_capture_support_identity_v1[\s\S]*to service_role;/,
    );
    for (const authority of [
      "provider", "payment", "capture", "refund", "settlement", "ticketing",
      "retry", "servicing", "consumer-release",
    ]) expect(forward).toContain(authority);
  });

  it("refuses forward backfill and rollback over every capture attempt", () => {
    expect(forward).toContain(
      "cannot backfill in-flight or provider-call evidence",
    );
    expect(forward.indexOf("lock table")).toBeLessThan(
      forward.indexOf("cannot backfill in-flight or provider-call evidence"),
    );
    expect(forward).toContain("attempt_state = 'dispatching'");
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Stripe capture attempt or in-flight evidence exists",
    );
    expect(rollback.indexOf("lock table")).toBeLessThan(
      rollback.indexOf(
        "Refusing rollback: Flight Consumer Live Stripe capture attempt or",
      ),
    );
    expect(rollback.indexOf("drop trigger")).toBeLessThan(
      rollback.indexOf("drop column"),
    );
    expect(rollback).toMatch(
      /if exists \(\s*select 1\s*from public\.flight_consumer_live_stripe_capture_attempts\s*\) then/,
    );
  });
});
