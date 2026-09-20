import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/complete-order-workflow.server", () => ({
  recoverFlightConsumerPreviewOrder: vi.fn(),
}));

import {
  FlightConsumerPreviewCompletionRecoveryError,
  createInjectedFlightConsumerPreviewCompletionRecovery,
} from "../lib/flights/consumer-preview/completion-recovery.server";
import {
  createFlightConsumerPreviewReferenceKeyring,
  encryptFlightConsumerPreviewReference,
} from "../lib/flights/consumer-preview/reference-crypto.server";
import { FlightConsumerPreviewCompletionProcessingError } from "../lib/flights/consumer-preview/completion-lease-contract";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";
const paymentIntentId = "pi_previewrecovery0001";
const executionScopeSha256 = "a".repeat(64);
const keyring = createFlightConsumerPreviewReferenceKeyring({
  keyVersion: "preview-reference-v1",
  encryptionKeyBase64Url: Buffer.alloc(32, 31).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 47).toString("base64url"),
});
const protectedReference = encryptFlightConsumerPreviewReference({
  value: paymentIntentId,
  context: {
    kind: "stripe_payment_intent",
    customerId,
    resourceId: orderId,
    executionScopeSha256,
  },
  keyring,
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    customer_id: customerId,
    order_status: "pending_payment",
    payment_id: paymentId,
    payment_status: "requires_payment_method",
    processor_reference_ciphertext: protectedReference.ciphertext,
    processor_reference_sha256: protectedReference.referenceSha256,
    amount_cents: 42_100,
    currency: "USD",
    execution_scope_sha256: executionScopeSha256,
    ...overrides,
  };
}

describe("Flight Consumer Preview authoritative completion recovery", () => {
  it("resumes with the immutable lease identity using only the encrypted owner-scoped server reference", async () => {
    const complete = vi.fn(async (input: Readonly<{
      customerId: string;
      orderId: string;
      paymentIntentId: string;
    }>) => {
      void input;
      return {
        orderId,
        status: "ticketed" as const,
        issuedTicketCount: 1,
      };
    });
    const load = vi.fn(async () => [row()]);
    const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
      store: { load },
      executionScopeSha256,
      referenceKeyring: keyring,
      complete,
    });

    await expect(recover({ customerId, orderId })).resolves.toEqual({
      decision: "completed",
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
    });
    expect(load).toHaveBeenCalledWith({ customerId, orderId });
    expect(complete).toHaveBeenCalledTimes(1);
    const completionInput = complete.mock.calls[0]![0];
    expect(completionInput).toMatchObject({ customerId, orderId, paymentIntentId });
    expect(completionInput).not.toHaveProperty("idempotencyKey");
    expect(JSON.stringify(completionInput)).not.toContain(protectedReference.ciphertext);
  });

  it("converges terminal, pending, and no-payment states without a provider/payment mutation", async () => {
    const complete = vi.fn();
    for (const [expectedDecision, state] of [
      ["terminal", row({ order_status: "requires_review" })],
      ["pending", row({ order_status: "ticketing_pending" })],
      ["waiting_for_payment", row({
        payment_id: null,
        payment_status: null,
        processor_reference_ciphertext: null,
        processor_reference_sha256: null,
      })],
    ] as const) {
      const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
        store: { load: async () => [state] },
        executionScopeSha256,
        referenceKeyring: keyring,
        complete,
      });
      await expect(recover({ customerId, orderId })).resolves.toMatchObject({
        decision: expectedDecision,
        orderId,
      });
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it("replays a ticketed order through the exact durable lease evidence", async () => {
    const complete = vi.fn(async () => ({
      orderId,
      status: "ticketed" as const,
      issuedTicketCount: 2,
    }));
    const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
      store: { load: async () => [row({
        order_status: "ticketed",
        payment_status: "captured",
      })] },
      executionScopeSha256,
      referenceKeyring: keyring,
      complete,
    });

    await expect(recover({ customerId, orderId })).resolves.toEqual({
      decision: "completed",
      orderId,
      status: "ticketed",
      issuedTicketCount: 2,
    });
    expect(complete).toHaveBeenCalledWith({ customerId, orderId, paymentIntentId });
  });

  it("preserves safe concurrent processing for the HTTP accepted response", async () => {
    const processing = new FlightConsumerPreviewCompletionProcessingError();
    const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
      store: { load: async () => [row({ payment_status: "captured" })] },
      executionScopeSha256,
      referenceKeyring: keyring,
      complete: vi.fn(async () => { throw processing; }),
    });
    await expect(recover({ customerId, orderId })).rejects.toBe(processing);
  });

  it.each([
    ["wrong owner", row({ customer_id: "99999999-9999-4999-8999-999999999999" })],
    ["wrong scope", row({ execution_scope_sha256: "b".repeat(64) })],
    ["tampered reference", row({ processor_reference_sha256: "c".repeat(64) })],
    ["partial payment identity", row({ processor_reference_ciphertext: null })],
    ["unexpected PII", { ...row(), traveler_email: "secret@example.test" }],
  ])("fails closed for %s with a generic error", async (_label, unsafeRow) => {
    const complete = vi.fn();
    const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
      store: { load: async () => [unsafeRow] },
      executionScopeSha256,
      referenceKeyring: keyring,
      complete,
    });
    const error = await recover({ customerId, orderId }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FlightConsumerPreviewCompletionRecoveryError);
    expect(String(error)).not.toMatch(/secret@example|enc:|pi_preview/i);
    expect(complete).not.toHaveBeenCalled();
  });
});
