import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({
  claims: 0,
  completions: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "stripe_financial_events") throw new Error(`Unexpected table: ${table}`);
      return {
        upsert: () => {
          ledger.claims++;
          return { select: () => ({ maybeSingle: async () => ({ data: { id: "synthetic-claim" }, error: null }) }) };
        },
        update: () => {
          ledger.completions++;
          const chain = {
            eq: () => chain,
            select: () => ({ maybeSingle: async () => ({ data: { id: "synthetic-claim" }, error: null }) }),
          };
          return chain;
        },
      };
    },
  }),
}));

import { POST } from "../app/api/stripe/webhook/route";

const signingSecret = "whsec_synthetic_rehearsal_only";
const payload = JSON.stringify({
  id: "evt_synthetic_rehearsal",
  object: "event",
  type: "charge.succeeded",
  created: 1_790_000_000,
  livemode: false,
  data: { object: { id: "ch_synthetic_rehearsal" } },
});

function signedRequest(signature: string) {
  return new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

describe("signed Stripe test webhook rehearsal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    ledger.claims = 0;
    ledger.completions = 0;
  });

  it("rejects a bad signature before touching the financial ledger", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_rehearsal");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signingSecret);
    vi.stubEnv("PILOT_MODE", "true");
    vi.stubEnv("ENABLE_TEST_STRIPE_WEBHOOKS", "true");

    const response = await POST(signedRequest("t=1,v1=invalid"));
    expect(response.status).toBe(400);
    expect(ledger.claims).toBe(0);
  });

  it("keeps a validly signed event out of the isolated Preview while its switch is off", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_rehearsal");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signingSecret);
    vi.stubEnv("PILOT_MODE", "true");
    vi.stubEnv("ENABLE_TEST_STRIPE_WEBHOOKS", "false");
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });

    const response = await POST(signedRequest(signature));
    expect(response.status).toBe(503);
    expect(ledger.claims).toBe(0);
  });

  it("accepts a validly signed synthetic event into the ledger only when enabled", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_rehearsal");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signingSecret);
    vi.stubEnv("PILOT_MODE", "true");
    vi.stubEnv("ENABLE_TEST_STRIPE_WEBHOOKS", "true");
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });

    const response = await POST(signedRequest(signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, mode: "test" });
    expect(ledger.claims).toBe(1);
    expect(ledger.completions).toBe(1);
  });
});
