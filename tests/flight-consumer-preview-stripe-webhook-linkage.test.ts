import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
  decrypt: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/reference-crypto.server", () => ({
  decryptFlightConsumerPreviewReference: state.decrypt,
  readFlightConsumerPreviewReferenceKeyring: vi.fn(() => ({ activeKeyId: "test" })),
}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      let selected = "";
      const filters: Array<{ column: string; value: unknown }> = [];
      const query = {
        select(columns: string) {
          selected = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          state.filters.push({ table, column, value });
          return query;
        },
        async maybeSingle() {
          const matching = (state.tables.get(table) ?? []).filter((row) =>
            filters.every(({ column, value }) => row[column] === value));
          if (matching.length > 1) return { data: null, error: { message: "multiple rows" } };
          if (matching.length === 0) return { data: null, error: null };
          const projected = Object.fromEntries(
            selected.split(",").map((column) => [column, matching[0]![column]]),
          );
          return { data: projected, error: null };
        },
      };
      return query;
    },
    rpc: vi.fn(),
  }),
}));

import {
  createFlightConsumerPreviewStripeWebhookLedgerPort,
} from "../lib/flights/consumer-preview/stripe-webhook.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const failedPaymentId = "33333333-3333-4333-8333-333333333333";
const retryPaymentId = "44444444-4444-4444-8444-444444444444";
const executionScopeSha256 = "a".repeat(64);
const failedPaymentIntentId = "pi_failedattempt0001";
const retryPaymentIntentId = "pi_retryattempt00002";

function referenceDigest(value: string) {
  return createHash("sha256")
    .update("flight-consumer-reference-digest-v1")
    .update("\0")
    .update("stripe_payment_intent")
    .update("\0")
    .update(value, "utf8")
    .digest("hex");
}

function paymentRow(input: Readonly<{
  id: string;
  paymentIntentId: string;
  ciphertext: string;
  status: "failed" | "authorized";
}>) {
  return {
    id: input.id,
    order_id: orderId,
    execution_mode: "test",
    execution_scope_sha256: executionScopeSha256,
    processor_code: "stripe",
    processor_reference_ciphertext: input.ciphertext,
    processor_reference_sha256: referenceDigest(input.paymentIntentId),
    status: input.status,
  };
}

describe("Flight Consumer Preview Stripe webhook payment linkage", () => {
  beforeEach(() => {
    state.tables.clear();
    state.filters.length = 0;
    state.decrypt.mockReset();
    state.tables.set("flight_orders", [{
      id: orderId,
      customer_id: customerId,
      currency: "USD",
      total_cents: 123_456,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      provider_code: "duffel",
    }]);
  });

  it("links the exact failed PaymentIntent when failure was recorded before its webhook", async () => {
    const ciphertext = "enc:v1:AAAAAAAAAAAAAAAA";
    state.tables.set("flight_payments", [paymentRow({
      id: failedPaymentId,
      paymentIntentId: failedPaymentIntentId,
      ciphertext,
      status: "failed",
    })]);
    state.decrypt.mockReturnValue(failedPaymentIntentId);

    const result = await createFlightConsumerPreviewStripeWebhookLedgerPort().resolvePaymentLink({
      paymentIntentId: failedPaymentIntentId,
      orderId,
      customerId,
      executionScopeSha256,
    });

    expect(result).toMatchObject({
      paymentId: failedPaymentId,
      paymentIntentId: failedPaymentIntentId,
      executionMode: "test",
      processorCode: "stripe",
    });
    expect(state.filters).toContainEqual({
      table: "flight_payments",
      column: "processor_reference_sha256",
      value: referenceDigest(failedPaymentIntentId),
    });
    expect(state.filters.some(({ column }) => column === "status")).toBe(false);
  });

  it("selects the webhook's exact failed attempt instead of a later nonfailed retry", async () => {
    const failedCiphertext = "enc:v1:BBBBBBBBBBBBBBBB";
    const retryCiphertext = "enc:v1:CCCCCCCCCCCCCCCC";
    state.tables.set("flight_payments", [
      paymentRow({
        id: failedPaymentId,
        paymentIntentId: failedPaymentIntentId,
        ciphertext: failedCiphertext,
        status: "failed",
      }),
      paymentRow({
        id: retryPaymentId,
        paymentIntentId: retryPaymentIntentId,
        ciphertext: retryCiphertext,
        status: "authorized",
      }),
    ]);
    state.decrypt.mockImplementation(({ ciphertext }: { ciphertext: string }) => {
      if (ciphertext === failedCiphertext) return failedPaymentIntentId;
      if (ciphertext === retryCiphertext) return retryPaymentIntentId;
      throw new Error("unexpected ciphertext");
    });

    const result = await createFlightConsumerPreviewStripeWebhookLedgerPort().resolvePaymentLink({
      paymentIntentId: failedPaymentIntentId,
      orderId,
      customerId,
      executionScopeSha256,
    });

    expect(result).toMatchObject({
      paymentId: failedPaymentId,
      paymentIntentId: failedPaymentIntentId,
    });
    expect(state.decrypt).toHaveBeenCalledTimes(1);
    expect(state.decrypt).toHaveBeenCalledWith(expect.objectContaining({
      ciphertext: failedCiphertext,
      expectedReferenceSha256: referenceDigest(failedPaymentIntentId),
      context: {
        kind: "stripe_payment_intent",
        customerId,
        resourceId: orderId,
        executionScopeSha256,
      },
    }));
    expect(state.filters).toEqual(expect.arrayContaining([
      { table: "flight_payments", column: "execution_mode", value: "test" },
      { table: "flight_payments", column: "execution_scope_sha256", value: executionScopeSha256 },
      { table: "flight_payments", column: "processor_code", value: "stripe" },
    ]));
  });
});
