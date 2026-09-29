import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260115_flight_consumer_live_public_shopping_admission.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260115_flight_consumer_live_public_shopping_admission.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const reserveRpc =
  "reserve_flight_consumer_live_public_shopping_admission_v1";

describe("Production-local public-shopping admission migration 115", () => {
  it("is transactional and requires exact 101, 105, and digest prerequisites", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(forward).toContain(
      "to_regclass('public.flight_consumer_live_duffel_shopping_attempts')",
    );
    expect(forward).toContain(
      "to_regclass('public.flight_consumer_live_duffel_offer_sources')",
    );
    expect(forward).toContain(
      "to_regprocedure('extensions.digest(bytea,text)')",
    );
  });

  it("stores only bounded digests, decisions, and observed budget counts", () => {
    for (const column of [
      "execution_scope_sha256",
      "policy_sha256",
      "admission_policy_sha256",
      "cohort_sha256",
      "subject_sha256",
      "idempotency_sha256",
      "request_sha256",
      "admission_receipt_sha256",
    ]) {
      expect(forward).toMatch(new RegExp(`${column} text not null`));
    }
    expect(forward).not.toMatch(
      /customer_id|email|passenger|traveler|airport|origin\s+text|destination\s+text|raw_/i,
    );
    expect(forward).not.toMatch(/access[_-]?token|client_secret|payment_method/i);
  });

  it("uses fixed serialized subject, cohort, and global minute/day budgets", () => {
    expect(forward).toContain(
      "lock table public.flight_consumer_live_public_shopping_admissions",
    );
    expect(forward).toContain("in share row exclusive mode");
    for (const condition of [
      "v_subject_minute >= 2",
      "v_subject_day >= 10",
      "v_cohort_minute >= 10",
      "v_cohort_day >= 100",
      "v_global_minute >= 20",
      "v_global_day >= 250",
    ]) {
      expect(forward).toContain(condition);
    }
    expect(forward).toContain("v_now + interval '60 seconds'");
    const lockIndex = forward.indexOf(
      "lock table public.flight_consumer_live_public_shopping_admissions",
    );
    const trustedClockIndex = forward.indexOf(
      "v_now := clock_timestamp();",
    );
    expect(lockIndex).toBeGreaterThan(-1);
    expect(trustedClockIndex).toBeGreaterThan(lockIndex);
    expect(forward.indexOf(
      "v_claim_expires_at := v_now + interval '60 seconds';",
    )).toBeGreaterThan(trustedClockIndex);
    expect(forward).not.toMatch(
      /v_now\s+timestamptz\s*:=\s*clock_timestamp\(\)/,
    );
    expect(forward).toContain(
      "iratepilot:flight-consumer-production:public-shopping-admission-policy:v1",
    );
    expect(forward).toContain("cardinality(array(");
    expect(forward).toContain(")) <> 6");
    expect(forward.indexOf("if found then")).toBeLessThan(
      forward.indexOf("count(*) filter ("),
    );
    expect(forward).not.toMatch(
      /reset_|requeue|release_budget|retry_(?!authorized)/i,
    );
  });

  it("coalesces refusal evidence by bounded subject/cohort/global time bucket", () => {
    expect(forward).toMatch(
      /refusal_bucket_sha256 text check \([\s\S]*?\^\[0-9a-f\]\{64\}\$/,
    );
    expect(forward).toContain(
      "flight_consumer_live_public_shopping_refusal_bucket_uniq",
    );
    expect(forward).toMatch(
      /constraint flight_consumer_live_public_shopping_refusal_bucket_uniq\s+unique \(execution_scope_sha256, refusal_bucket_sha256\)/,
    );
    expect(forward).toContain(
      "iratepilot:flight-consumer-production:public-shopping-refusal-bucket:v1",
    );
    expect(forward).toMatch(
      /on conflict on constraint\s+flight_consumer_live_public_shopping_refusal_bucket_uniq\s+do nothing/,
    );
    expect(forward).toContain(
      "admission.refusal_bucket_sha256 = v_refusal_bucket_sha256",
    );
  });

  it("is forced-RLS, service-role RPC only, append-only, and no-authority", () => {
    expect(forward).toContain("enable row level security;");
    expect(forward).toContain("force row level security;");
    expect(forward).toContain("from public, anon, authenticated, service_role;");
    expect(forward).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(forward).toContain(`create function public.${reserveRpc}(`);
    expect(forward).toMatch(new RegExp(
      `grant execute on function\\s+public\\.${reserveRpc}[\\s\\S]*?to service_role;`,
    ));
    expect(forward).toContain("before update or delete");
    for (const column of [
      "provider_dispatch_authorized",
      "consumer_exposure_authorized",
      "order_authorized",
      "stripe_dispatch_authorized",
      "booking_authorized",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
      "blind_retry_authorized",
    ]) {
      expect(forward).toMatch(new RegExp(
        `${column} boolean not null default false\\s+check \\(not ${column}\\)`,
      ));
    }
    expect(forward).not.toMatch(
      /create_offer_request\s*\(|retrieve_offer\s*\(|create_order\s*\(|payment_intent\s*\(/i,
    );
  });

  it("provides only a populated-evidence-refusing scoped rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("Refusing rollback:");
    expect(rollback).toContain(`public.${reserveRpc}(`);
    expect(rollback).toContain(
      "drop table if exists\n  public.flight_consumer_live_public_shopping_admissions",
    );
    expect(rollback).not.toMatch(/drop schema|cascade|truncate|delete from/i);
  });
});
