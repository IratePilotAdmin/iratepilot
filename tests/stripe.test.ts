import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { getStripe, isStripeTestMode } from "../lib/stripe";

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

  it("uses an explicit restricted key instead of a broad process key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_broad_process_key");
    const stripe = getStripe("rk_test_explicit_preview_key");
    const authenticator = (stripe as unknown as {
      _authenticator: { _apiKey: string };
    })._authenticator;
    expect(authenticator._apiKey).toBe("rk_test_explicit_preview_key");
    expect(authenticator._apiKey).not.toBe(process.env.STRIPE_SECRET_KEY);
  });
});
