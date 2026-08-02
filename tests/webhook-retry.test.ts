import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isRetryableStripeWebhookClaim,
  stripeWebhookClaimTimeoutMs,
} from "../lib/stripe/webhook-retry";

const webhook = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);

describe("Stripe webhook retry claims", () => {
  const now = Date.parse("2026-08-02T17:00:00.000Z");

  it("retries failed and stale processing claims but not active or completed claims", () => {
    expect(isRetryableStripeWebhookClaim("failed", "2026-08-02T16:59:59.000Z", now)).toBe(true);
    expect(isRetryableStripeWebhookClaim(
      "processing",
      new Date(now - stripeWebhookClaimTimeoutMs).toISOString(),
      now,
    )).toBe(true);
    expect(isRetryableStripeWebhookClaim("processing", "2026-08-02T16:59:00.000Z", now)).toBe(false);
    expect(isRetryableStripeWebhookClaim("processed", "2026-08-02T16:00:00.000Z", now)).toBe(false);
    expect(isRetryableStripeWebhookClaim("ignored", "2026-08-02T16:00:00.000Z", now)).toBe(false);
  });

  it("uses the prior status and timestamp as compare-and-set claim guards", () => {
    expect(webhook).toContain('.eq("processing_status", existing.processing_status)');
    expect(webhook).toContain('.eq("updated_at", existing.updated_at)');
    expect(webhook).toContain("if (!retryClaim)");
    expect(webhook).toContain('status: 409');
  });
});
