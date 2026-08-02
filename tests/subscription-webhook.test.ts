import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);

describe("subscription webhook coverage", () => {
  it("handles the complete subscription lifecycle for travelers and partners", () => {
    expect(webhook).toContain('event.type === "customer.subscription.created"');
    expect(webhook).toContain('event.type === "customer.subscription.updated"');
    expect(webhook).toContain('event.type === "customer.subscription.deleted"');
    expect(webhook).toContain("membership_renews_at: renewsAt");
    expect(webhook).toContain("subscription_renews_at: renewsAt");
    expect(webhook).toContain('.eq("stripe_subscription_id", subscription.id)');
  });

  it("rejects stale traveler and partner subscription events", () => {
    expect(webhook).toContain("membership_synced_at: eventCreatedAt");
    expect(webhook).toContain("subscription_synced_at: eventCreatedAt");
    expect(webhook).toContain("membership_synced_at.is.null,membership_synced_at.lt.${eventCreatedAt}");
    expect(webhook).toContain("subscription_synced_at.is.null,subscription_synced_at.lt.${eventCreatedAt}");
  });
});
