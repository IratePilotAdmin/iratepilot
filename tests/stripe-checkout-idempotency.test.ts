import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getStripeIdempotencyContext } from "../lib/stripe-idempotency";

const attemptId = "8cf73bc8-08f1-49ec-bc23-86a3684108c9";
const request = (value?: string) => new Request("https://www.iratepilot.com/api/checkout", {
  headers: value ? { "Idempotency-Key": value } : {},
});
const routes = [
  "../app/api/stripe/checkout/route.ts",
  "../app/api/memberships/checkout/route.ts",
  "../app/api/partner/subscription/checkout/route.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const clients = [
  "../components/checkout/checkout-form.tsx",
  "../components/account/membership-center.tsx",
  "../components/partner/partner-subscription-center.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Stripe checkout idempotency", () => {
  it("builds a stable key scoped to the actor and checkout type", () => {
    expect(getStripeIdempotencyContext(request(attemptId), "booking", "user-1"))
      .toEqual({ attemptId, idempotencyKey: `iratepilot:booking:user-1:${attemptId}` });
    expect(getStripeIdempotencyContext(request(attemptId), "membership", "user-1")?.idempotencyKey)
      .not.toBe(getStripeIdempotencyContext(request(attemptId), "booking", "user-1")?.idempotencyKey);
    expect(getStripeIdempotencyContext(request(attemptId), "booking", "user-2")?.idempotencyKey)
      .not.toBe(getStripeIdempotencyContext(request(attemptId), "booking", "user-1")?.idempotencyKey);
  });

  it("rejects missing or malformed attempt IDs", () => {
    expect(getStripeIdempotencyContext(request(), "booking", "user-1")).toBeNull();
    expect(getStripeIdempotencyContext(request("not-a-uuid"), "booking", "user-1")).toBeNull();
  });

  it("passes validated keys to every Stripe checkout creation call", () => {
    for (const route of routes) {
      expect(route).toContain("getStripeIdempotencyContext");
      expect(route).toContain("idempotency.idempotencyKey");
      expect(route).toContain("A valid checkout attempt ID is required.");
    }
  });

  it("derives booking confirmation metadata from the stable attempt ID", () => {
    expect(routes[0]).toContain('idempotency.attemptId.replaceAll("-", "")');
    expect(routes[0]).not.toContain("Date.now()");
  });

  it("sends a fresh attempt ID from each checkout client", () => {
    for (const client of clients) {
      expect(client).toContain('"Idempotency-Key"');
      expect(client).toContain("crypto.randomUUID()");
    }
  });
});
