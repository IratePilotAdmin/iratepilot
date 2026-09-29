import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import {
  durableFlightConsumerPreviewCompletionKey,
  readFlightConsumerPreviewStripeReturnPaymentIntent,
  requestFlightConsumerPreviewStripeReturnCompletion,
} from "../components/flights/consumer-preview/stripe-return-recovery";

const orderId = "22222222-2222-4222-8222-222222222222";
const paymentIntentId = "pi_preview12345678";
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

describe("Flight Consumer Preview Stripe return recovery", () => {
  it("accepts one exact PaymentIntent query value and rejects missing, ambiguous, or malformed values", () => {
    expect(readFlightConsumerPreviewStripeReturnPaymentIntent(`?payment_intent=${paymentIntentId}`)).toBe(paymentIntentId);
    expect(readFlightConsumerPreviewStripeReturnPaymentIntent("?redirect_status=succeeded")).toBeNull();
    expect(readFlightConsumerPreviewStripeReturnPaymentIntent("?payment_intent=bad")).toBeNull();
    expect(readFlightConsumerPreviewStripeReturnPaymentIntent(`?payment_intent=${paymentIntentId}&payment_intent=${paymentIntentId}`)).toBeNull();
    expect(readFlightConsumerPreviewStripeReturnPaymentIntent("?payment_intent_client_secret=pi_secret_value")).toBeNull();
  });

  it("persists and reuses one durable UUID per Preview order", () => {
    const storage = memoryStorage();
    const createUuid = vi.fn(() => idempotencyKey);
    expect(durableFlightConsumerPreviewCompletionKey(orderId, storage, createUuid)).toBe(idempotencyKey);
    expect(durableFlightConsumerPreviewCompletionKey(orderId, storage, createUuid)).toBe(idempotencyKey);
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect([...storage.values.values()]).toEqual([idempotencyKey]);
  });

  it("posts exactly once with only the PaymentIntent identity, then cleans and refreshes the receipt", async () => {
    const storage = memoryStorage();
    const post = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean }>>(
      async () => ({ ok: true }),
    );
    const replace = vi.fn();
    const refresh = vi.fn();
    const onReview = vi.fn();

    await expect(requestFlightConsumerPreviewStripeReturnCompletion({
      orderId,
      paymentIntentId,
      storage,
      createUuid: () => idempotencyKey,
      post,
      replace,
      refresh,
      onReview,
    })).resolves.toBe("requested");

    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0];
    expect(url).toBe(`/api/flights/preview/orders/${orderId}/complete`);
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(JSON.parse(String(init.body))).toEqual({ paymentIntentId });
    expect(JSON.stringify(init)).not.toMatch(/client_secret|redirect_status|succeeded/i);
    expect(onReview).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(`/flights/preview/confirmation/${orderId}`);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
  });

  it("does nothing for invalid identities", async () => {
    const storage = memoryStorage();
    const post = vi.fn();
    const replace = vi.fn();
    const refresh = vi.fn();

    await expect(requestFlightConsumerPreviewStripeReturnCompletion({
      orderId,
      paymentIntentId: "pi_bad",
      storage,
      createUuid: () => idempotencyKey,
      post,
      replace,
      refresh,
    })).resolves.toBe("ignored");
    expect(post).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["server rejection", vi.fn(async () => ({ ok: false }))],
    ["indeterminate network result", vi.fn(async () => { throw new Error("provider secret"); })],
  ])("shows only generic review state for %s and still cleans the Stripe return URL", async (_label, post) => {
    const replace = vi.fn();
    const refresh = vi.fn();
    const onReview = vi.fn();
    await expect(requestFlightConsumerPreviewStripeReturnCompletion({
      orderId,
      paymentIntentId,
      storage: memoryStorage(),
      createUuid: () => idempotencyKey,
      post,
      replace,
      refresh,
      onReview,
    })).resolves.toBe("review");
    expect(post).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/flights/preview/confirmation/${orderId}`);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fails closed without posting when localStorage cannot durably retain the UUID", async () => {
    const post = vi.fn();
    const replace = vi.fn();
    const refresh = vi.fn();
    const onReview = vi.fn();
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error("storage disabled"); }),
    };
    await expect(requestFlightConsumerPreviewStripeReturnCompletion({
      orderId,
      paymentIntentId,
      storage,
      createUuid: () => idempotencyKey,
      post,
      replace,
      refresh,
      onReview,
    })).resolves.toBe("review");
    expect(post).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/flights/preview/confirmation/${orderId}`);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fails closed without overwriting a malformed stored completion identity", async () => {
    const key = `iratepilot:flight-preview:redirect-completion:${orderId}`;
    const storage = memoryStorage({ [key]: "malformed-prior-state" });
    const post = vi.fn();
    const replace = vi.fn();
    const refresh = vi.fn();
    const onReview = vi.fn();
    await expect(requestFlightConsumerPreviewStripeReturnCompletion({
      orderId,
      paymentIntentId,
      storage,
      createUuid: () => idempotencyKey,
      post,
      replace,
      refresh,
      onReview,
    })).resolves.toBe("review");
    expect(post).not.toHaveBeenCalled();
    expect(storage.values.get(key)).toBe("malformed-prior-state");
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("mounts recovery only after the existing Preview runtime, authentication, and owner-scoped order gates", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/flights/preview/confirmation/[orderId]/page.tsx"),
      "utf8",
    );
    expect(page).toContain("getFlightConsumerPreviewPageRuntime");
    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain("if (!user) redirect");
    expect(page).toContain("await getConsumerFlightOrder(orderId)");
    expect(page).toContain("<ConsumerFlightPreviewAuthoritativeCompletionRecovery");
    expect(page).toContain("shouldResume={[");
  });
});
