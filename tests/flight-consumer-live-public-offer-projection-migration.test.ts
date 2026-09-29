import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forward = readFileSync(
  "supabase/production-migrations/202608260116_flight_consumer_live_public_offer_projection.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260116_flight_consumer_live_public_offer_projection.rollback.sql",
  "utf8",
);

describe("Production-local public-offer projection migration 116", () => {
  it("is transactional, prerequisite-bound, forced-RLS, and append-only", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    for (const prerequisite of [
      "flight_consumer_live_public_shopping_admissions",
      "flight_consumer_live_duffel_shopping_attempts",
      "flight_consumer_live_duffel_offer_sources",
    ]) expect(forward).toContain(prerequisite);
    expect(forward).toContain("enable row level security");
    expect(forward).toContain("force row level security");
    expect(forward).toContain("before update or delete");
    expect(forward).toContain("coalesce(auth.role(), '') <> 'service_role'");
  });

  it("stores provider references only in a bounded encrypted vault", () => {
    expect(forward).toContain("provider_offer_reference_ciphertext");
    expect(forward).toContain("key_version text not null");
    expect(forward).toContain("aad_sha256 text not null");
    expect(forward).toContain("record_hmac_sha256 text not null");
    expect(forward).toContain("retention_expires_at = created_at + interval '7 days'");
    expect(forward).not.toMatch(/provider_offer_reference_plaintext|decrypt_/i);
  });

  it("revalidates every Gate 115 binding and explicit false authority", () => {
    for (const binding of [
      "admission_receipt_sha256", "execution_scope_sha256", "policy_sha256",
      "admission_policy_sha256", "cohort_sha256", "subject_sha256",
      "idempotency_sha256", "request_sha256",
    ]) expect(forward).toContain(`v_admission.${binding}`);
    for (const authority of [
      "provider_dispatch_authorized", "consumer_exposure_authorized",
      "order_authorized", "stripe_dispatch_authorized", "booking_authorized",
      "payment_authorized", "capture_authorized", "refund_authorized",
      "settlement_authorized", "ticketing_authorized", "servicing_authorized",
      "consumer_release_enabled", "blind_retry_authorized",
    ]) expect(forward).toContain(`v_admission.${authority}`);
  });

  it("binds distinct public request, Duffel body, raw response, and exact source accounting", () => {
    expect(forward).toContain("flight-consumer-production-public-shopping-admission-request-v1");
    expect(forward).toContain("v_expected_source_body_sha256");
    expect(forward).toContain("source.source_response_sha256 = p_source_response_sha256");
    expect(forward).toContain("source accounting is incomplete");
    expect(forward).toContain("projection replay collision");
  });

  it("has a populated-evidence-refusing rollback without destructive broad operations", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("Refusing rollback:");
    expect(rollback).not.toMatch(/drop schema|cascade|truncate|delete from/i);
  });
});
