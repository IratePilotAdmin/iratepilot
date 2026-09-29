import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const preflightPath =
  "scripts/flight-consumer-live-stripe-payment-plan-managed-uat-preflight.sql";
const verificationPath =
  "scripts/flight-consumer-live-stripe-payment-plan-managed-uat-verification.sql";
const migrationPath =
  "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql";

const preflight = readFileSync(preflightPath, "utf8");
const verification = readFileSync(verificationPath, "utf8");

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Flight Consumer Stripe payment-plan managed-UAT SQL", () => {
  it("pins the exact reviewed operator artifacts and migration bytes", () => {
    expect(sha256(preflightPath)).toBe(
      "e5f6852d1a1a170b69b17d7002800801a9e96a0afa8546797511cbcbcb685bfa",
    );
    expect(sha256(verificationPath)).toBe(
      "f0bcd64d8f1c92466ff717c7ec8f3d35f38b12b6cac3b3f7475bc506726b2d0d",
    );
    expect(sha256(migrationPath)).toBe(
      "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
    );
  });

  it("declares the dashboard-attested UAT target without claiming a DB invariant", () => {
    for (const sql of [preflight, verification]) {
      expect(sql).toContain("iratepilot-flight-payment-uat-20260827");
      expect(sql).toContain("exipwtvyjaihsvdhsbbt");
      expect(sql).toContain("current_database() <> 'postgres'");
      expect(sql).toContain("current_user <> 'postgres'");
      expect(sql).toContain("server_version_num");
      expect(sql).toContain("202608260103");
    }
    expect(preflight).toContain("'project_ref', 'exipwtvyjaihsvdhsbbt'");
    expect(verification).toContain("'project_ref', 'exipwtvyjaihsvdhsbbt'");
  });

  it("keeps the preflight read-only and collision-failing", () => {
    expect(preflight).toContain("PostgreSQL major version must be 17");
    expect(preflight).toContain("service_role lacks BYPASSRLS");
    expect(preflight).toContain("postgres cannot SET ROLE service_role");
    expect(preflight).toContain("auth.role() text contract is missing");
    expect(preflight).toContain("target relation or index collides");
    expect(preflight).toContain("target type collides");
    expect(preflight).toContain("target recorder collides");
    expect(preflight).toContain("migration ledger already contains 103");
    expect(preflight).toContain("'writes_performed', false");
    expect(preflight).not.toMatch(
      /^\s*(?:create|alter|drop|truncate|insert|update|delete|merge|copy|grant|revoke)\b/im,
    );
  });

  it("verifies exact catalog, ACL, forced-RLS, and zero-dispatch behavior", () => {
    expect(verification).toContain("count(*) = 36");
    expect(verification).toContain("count(*) = 5");
    expect(verification).toContain("relation.relforcerowsecurity");
    expect(verification).toContain("direct table privilege is present");
    expect(verification).toContain("recorder ACL is invalid");
    expect(verification).toContain("modern request.jwt.claims role is not honored");
    expect(verification).toContain("v_created.decision <> 'created'");
    expect(verification).toContain("v_replay.decision <> 'replay'");
    expect(verification).toContain("one-field drift was accepted");
    expect(verification).toContain("malformed evidence was accepted");
    expect(verification).toContain("ambiguous identity was accepted");
    expect(verification).toContain("synthetic rows survived rollback");
    expect(verification).toContain("migration 103 was unexpectedly ledgered");
  });

  it("rolls back every synthetic row and contains no external transport", () => {
    expect(verification.match(/^begin;$/gm)).toHaveLength(1);
    expect(verification.match(/^rollback;$/gm)).toHaveLength(1);
    expect(verification).not.toMatch(/^commit;$/m);
    expect(verification).not.toMatch(
      /\b(?:http|net)\.|dblink|pg_notify|lo_import|lo_export|create extension/i,
    );
    expect(verification).not.toMatch(
      /(?:sk|rk)_(?:live|test)_[a-z0-9]+|duffel_(?:live|test)_[a-z0-9]+|postgres(?:ql)?:\/\//i,
    );
  });
});
