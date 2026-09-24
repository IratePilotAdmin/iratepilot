import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runbook = readFileSync(
  new URL("../docs/FLIGHT_CONSUMER_PRODUCTION_OPERATIONS_RUNBOOK.md", import.meta.url),
  "utf8",
);

describe("Flight Consumer Production operations runbook", () => {
  it("keeps every unimplemented operational prerequisite explicit", () => {
    for (const requirement of [
      "a durable aggregate snapshot query",
      "an authoritative receipt issuer",
      "an authenticated Stripe endpoint-verification and webhook-lag collector",
      "a Duffel Balance collector",
      "an alert sink, paging policy, dashboard",
      "primary and backup on-call owners",
      "runbook drills using test data",
      "separately approved feature-flag, kill-switch, rollback, and release",
    ]) {
      expect(runbook).toContain(requirement);
    }
  });

  it("keeps the evaluator fail-closed and non-transactional", () => {
    expect(runbook).toContain("does not collect its own evidence or deliver its own alerts");
    expect(runbook).toContain("It never authorizes");
    expect(runbook).toContain("consumer release.");
    expect(runbook).toContain("No live order, charge, capture, ticket, cancellation, refund");
    expect(runbook).toContain("The monitoring report itself cannot provide it.");
  });
});
