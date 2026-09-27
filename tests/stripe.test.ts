import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { getStripe, isStripeTestMode } from "../lib/stripe";
import { readBoundedText } from "../lib/http/read-bounded-json";

describe("Stripe SDK configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects initialization when the secret key is missing", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY is missing.");
  });

  it("only enables test mode for Stripe test secret keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    expect(isStripeTestMode()).toBe(true);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    expect(isStripeTestMode()).toBe(false);
  });

  it("initializes the current Stripe client and verifies signed webhooks", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    const stripe = getStripe();
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test" } }
    });
    const webhookSecret = "whsec_test";
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    expect(stripe).toBeInstanceOf(Stripe);
    expect(event.id).toBe("evt_test");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("preserves the raw UTF-8 webhook text while enforcing a streamed body limit", async () => {
    const raw = '{"id":"evt_raw","data":{"note":"café"}}';
    const request = new Request("https://example.test/webhook", {
      method: "POST", headers: { "content-type": "application/json" }, body: raw,
    });
    expect(await readBoundedText(request, 1024)).toEqual({ ok: true, value: raw });

    const oversized = new Request("https://example.test/webhook", {
      method: "POST", headers: { "content-type": "application/json", "content-length": "1025" }, body: "x",
    });
    expect(await readBoundedText(oversized, 1024)).toEqual({ ok: false, reason: "too_large" });

    const chunked = new Request("https://example.test/webhook", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65)); controller.close(); } }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedText(chunked, 64)).toEqual({ ok: false, reason: "too_large" });
  });

  it("bounds webhook bytes before Stripe signature verification", () => {
    const route = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
    expect(route).toContain("const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024");
    expect(route).toContain("readBoundedText(request, MAX_STRIPE_WEBHOOK_BYTES)");
    expect(route.indexOf("readBoundedText(request, MAX_STRIPE_WEBHOOK_BYTES)")).toBeLessThan(route.indexOf("constructEvent(rawBody.value"));
    expect(route).not.toContain("constructEvent(await request.text()");
  });
});
