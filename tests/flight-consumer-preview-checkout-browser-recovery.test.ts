import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import {
  durableFlightConsumerPreviewCheckoutKey,
  flightConsumerPreviewStripeErrorNeedsDurableRecovery,
} from "../components/flights/consumer-preview/checkout-idempotency";

const orderId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("Flight Consumer Preview checkout browser-loss recovery", () => {
  it("persists one exact checkout identity and reuses it after a lost response or reload", () => {
    const storage = memoryStorage();
    const createUuid = vi.fn(() => idempotencyKey);
    expect(durableFlightConsumerPreviewCheckoutKey(orderId, null, storage, createUuid))
      .toBe(idempotencyKey);
    expect(durableFlightConsumerPreviewCheckoutKey(orderId, null, storage, createUuid))
      .toBe(idempotencyKey);
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect([...storage.values.values()]).toEqual([idempotencyKey]);
  });

  it("reuses an already-held valid identity without touching browser storage", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    expect(durableFlightConsumerPreviewCheckoutKey(
      orderId,
      idempotencyKey.toUpperCase(),
      storage,
      vi.fn(),
    )).toBe(idempotencyKey);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["write failure", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error("storage disabled"); }),
    }],
    ["silent write loss", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    }],
    ["changed readback", (() => {
      let reads = 0;
      return {
        getItem: vi.fn(() => (++reads === 1 ? null : "44444444-4444-4444-8444-444444444444")),
        setItem: vi.fn(),
      };
    })()],
  ])("fails closed on %s instead of returning an ephemeral key", (_label, storage) => {
    expect(() => durableFlightConsumerPreviewCheckoutKey(
      orderId,
      null,
      storage,
      () => idempotencyKey,
    )).toThrow();
  });

  it.each([
    ["invalid order", "bad", null, idempotencyKey, {}],
    ["invalid current", orderId, "bad", idempotencyKey, {}],
    ["invalid stored", orderId, null, idempotencyKey, {
      [`iratepilot:flight-preview:checkout:${orderId}`]: "bad",
    }],
    ["invalid generated", orderId, null, "bad", {}],
  ])("rejects %s before any provider request", (_label, candidateOrderId, current, generated, initial) => {
    expect(() => durableFlightConsumerPreviewCheckoutKey(
      candidateOrderId,
      current,
      memoryStorage(initial),
      () => generated,
    )).toThrow();
  });

  it("uses durable keys for prepare and completion and exposes owner-bound recovery", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/flights/consumer-preview/checkout.tsx"),
      "utf8",
    );
    expect(source).toContain("durableFlightConsumerPreviewCheckoutKey(");
    expect(source).toContain("durableFlightConsumerPreviewCompletionKey(");
    expect(source).toContain("requestFlightConsumerPreviewAuthoritativeCompletion({");
    expect(source).toContain("Check and resume durable test order");
    expect(source).toContain("checkoutAllowed && payment && stripePromise");
    expect(source.indexOf("try {")).toBeLessThan(source.indexOf("await stripe.confirmPayment({"));
    expect(source).not.toMatch(/catch\s*\{\s*return\s+(?:window\.)?crypto\.randomUUID\(\)/);
  });

  it("forces a fresh client boundary when navigation changes the durable order", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/flights/preview/checkout/[orderId]/page.tsx"),
      "utf8",
    );
    expect(page).toContain("<ConsumerFlightPreviewCheckout key={order.id}");
  });

  it.each([
    "api_connection_error",
    "api_error",
    "authentication_error",
    "idempotency_error",
    "invalid_request_error",
    "rate_limit_error",
    undefined,
    "unknown",
  ])("treats %s Stripe results as indeterminate durable-recovery cases", (type) => {
    expect(flightConsumerPreviewStripeErrorNeedsDurableRecovery(type)).toBe(true);
  });

  it.each(["card_error", "validation_error"])(
    "keeps %s as a definite payment-method correction",
    (type) => {
      expect(flightConsumerPreviewStripeErrorNeedsDurableRecovery(type)).toBe(false);
    },
  );
});
