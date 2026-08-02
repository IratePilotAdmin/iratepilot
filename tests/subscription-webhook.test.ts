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
});
