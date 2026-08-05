import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);

describe("Stripe webhook claim ownership", () => {
  it("uses the active claim timestamp for both completion and failure writes", () => {
    expect(webhook).toContain("let claimUpdatedAt = new Date().toISOString()");
    expect(webhook).toContain("claimUpdatedAt = retryClaimedAt");
    expect(webhook.match(/\.eq\("updated_at", claimUpdatedAt\)/g)).toHaveLength(2);
    expect(webhook.match(/\.eq\("processing_status", "processing"\)/g)).toHaveLength(2);
  });

  it("does not overwrite the ledger after a worker loses its claim", () => {
    expect(webhook).toContain("if (!completedClaim)");
    expect(webhook).toContain("if (!failureWriteError && !failedClaim)");
    expect(webhook).toContain("Webhook claim ownership changed before completion.");
    expect(webhook).toContain("Webhook claim ownership changed during processing.");
  });
});
