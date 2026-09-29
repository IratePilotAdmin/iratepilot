import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forward = readFileSync("supabase/production-migrations/202608260119_flight_consumer_live_public_shopping_dispatch.sql", "utf8");
const rollback = readFileSync("supabase/production-rollbacks/202608260119_flight_consumer_live_public_shopping_dispatch.rollback.sql", "utf8");
const runtime = readFileSync(
  "lib/flights/consumer-production/public-shopping-dispatch.server.ts", "utf8",
);

describe("Gate 119 migration", () => {
  it("atomically claims one per-admission create-offer dispatch and preserves all other false authorities", () => {
    expect(forward).toContain("unique references\n    public.flight_consumer_live_public_shopping_admissions");
    expect(forward).toContain("capability_operation = 'create_offer_request'");
    expect(forward).toContain("create_offer_request_dispatch_authorized");
    expect(forward).toContain("prepare_flight_consumer_live_duffel_shopping_attempt_v1");
    expect(forward).toContain("claim_flight_consumer_live_duffel_shopping_attempt_v1");
    expect(forward).toContain("claim_expires_at <= v_now");
    expect(forward).toContain("'replay'::text");
    expect(forward).toContain("blind_retry_authorized");
  });
  it("forces RLS, revokes direct grants, and refuses populated rollback", () => {
    expect(forward).toContain("force row level security");
    expect(forward).toContain("from public, anon, authenticated, service_role");
    expect(rollback).toContain("rollback refused: dispatch evidence exists");
  });
  it("wipes request bytes before refusing replay authority", () => {
    const replay = runtime.slice(runtime.indexOf('if (claim.decision === "replay")'),
      runtime.indexOf("let raw:"));
    expect(replay.indexOf("requestBytes.fill(0)")).toBeGreaterThanOrEqual(0);
    expect(replay.indexOf("requestBytes.fill(0)")).toBeLessThan(
      replay.indexOf("replay_authority_refused"),
    );
    expect(runtime.match(/dispatch_authority_refused/g)).toHaveLength(1);
  });
});
