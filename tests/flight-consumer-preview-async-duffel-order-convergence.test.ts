import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  createInjectedFlightConsumerPreviewAsyncDuffelConvergence,
  FlightConsumerPreviewAsyncDuffelConvergenceError,
  type FlightConsumerPreviewAsyncDuffelConvergencePort,
} from "../lib/flights/consumer-preview/async-duffel-order-convergence.server";
import { sha256FlightConsumerPreviewReference } from "../lib/flights/consumer-preview/reference-crypto.server";

const customerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";
const ledgerId = "00000000-0000-4000-8000-000000000004";
const caseId = "00000000-0000-4000-8000-000000000005";
const evidenceId = "00000000-0000-4000-8000-000000000006";
const executionScopeSha256 = "a".repeat(64);
const providerOrderId = "ord_0000ABd6wggSct7BoraU1o";
const providerOrderRefSha256 = sha256FlightConsumerPreviewReference({
  kind: "duffel_order",
  value: providerOrderId,
});
const providerOfferRefSha256 = "b".repeat(64);
const recoveryRequestSha256 = "c".repeat(64);
const responseSha256 = "d".repeat(64);
const evidenceReceiptSha256 = "e".repeat(64);
const leaseTokenSha256 = "f".repeat(64);
const rawBody = Buffer.from(JSON.stringify({ data: { id: providerOrderId, live_mode: false } }));
const now = new Date("2026-08-25T20:00:00.000Z");
const recoveryObservedAt = "2026-08-25T19:59:30.123456+00:00";
const normalizedRecoveryObservedAt = "2026-08-25T19:59:30.123Z";

function context(overrides: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    customer_id: customerId,
    order_status: "requires_review",
    execution_scope_sha256: executionScopeSha256,
    provider_attempt_id: attemptId,
    provider_attempt_state: "succeeded",
    provider_attempt_revision: 2,
    ledger_id: ledgerId,
    ledger_state: "processing",
    ledger_revision: 1,
    provider_offer_ref_sha256: providerOfferRefSha256,
    provider_order_ref_sha256: providerOrderRefSha256,
    recovery_evidence_receipt_sha256: null,
    recovery_retention_expires_at: null,
    reconciliation_case_id: caseId,
    reconciliation_case_status: "open",
    reconciliation_resolution_code: null,
    reconciliation_resolution_actor_type: "administrator",
    reconciliation_system_receipt_sha256: null,
    reconciliation_updated_at: "2026-08-25T19:59:00.000Z",
    issued_ticket_count: 0,
    ...overrides,
  };
}

function recoveryEvidence(recoveryAuthorityReceiptSha256: string) {
  return {
    evidence_id: evidenceId,
    ledger_id: ledgerId,
    attempt_id: attemptId,
    order_id: orderId,
    customer_id: customerId,
    execution_scope_sha256: executionScopeSha256,
    provider_offer_ref_sha256: providerOfferRefSha256,
    provider_order_ref_sha256: providerOrderRefSha256,
    recovery_request_sha256: recoveryRequestSha256,
    provider_response_sha256: responseSha256,
    webhook_verification_receipt_sha256: "1".repeat(64),
    recovery_authority_receipt_sha256: recoveryAuthorityReceiptSha256,
    recovery_evidence_receipt_sha256: evidenceReceiptSha256,
    key_version: "preview-evidence-v1",
    iv_base64url: "A".repeat(16),
    auth_tag_base64url: "B".repeat(22),
    ciphertext_base64url: "C".repeat(32),
    aad_sha256: "2".repeat(64),
    ciphertext_sha256: "3".repeat(64),
    retention_expires_at: "2026-08-26T20:00:00.000Z",
    created_at: recoveryObservedAt,
  };
}

function authorityReceipt(operation: string, evidence: unknown) {
  return createHash("sha256").update(`${operation}\0${JSON.stringify(evidence)}`).digest("hex");
}

function artifact() {
  return {
    providerOrderRefCiphertext: `enc:v1:${"A".repeat(32)}`,
    providerOrderRefSha256,
    providerCreatedAt: "2026-08-25T19:58:00.000Z",
    ticketingDeadlineAt: "2026-11-05T23:59:59.000Z",
    passengerBindings: [{
      passenger_ref_id: "00000000-0000-4000-8000-000000000007",
      provider_passenger_ref_ciphertext: `enc:v1:${"B".repeat(32)}`,
      provider_passenger_ref_sha256: "4".repeat(64),
    }],
    ticketDocuments: [{
      passenger_ref_id: "00000000-0000-4000-8000-000000000007",
      document_ref_ciphertext: `enc:v1:${"C".repeat(32)}`,
      document_ref_sha256: "5".repeat(64),
      issuing_carrier: "ZZ",
    }],
    issuedTicketCount: 1,
  };
}

function port(overrides: Partial<FlightConsumerPreviewAsyncDuffelConvergencePort> = {}) {
  return {
    readContext: vi.fn(async () => [context()]),
    loadEvidence: vi.fn(async () => []),
    markAmbiguous: vi.fn(async () => undefined),
    completeEvidence: vi.fn(async () => [{
      ledger_id: ledgerId,
      ledger_revision: 2,
      ledger_state: "processed",
      evidence_id: evidenceId,
      recovery_evidence_receipt_sha256: evidenceReceiptSha256,
      retention_expires_at: "2026-09-01T20:00:00.000Z",
    }]),
    finalize: vi.fn(async () => [{
      order_id: orderId,
      order_status: "ticketed",
      issued_ticket_count: 1,
      reconciliation_case_id: caseId,
    }]),
    ...overrides,
  } satisfies FlightConsumerPreviewAsyncDuffelConvergencePort;
}

function identity(lease: string | null = leaseTokenSha256) {
  return {
    customerId,
    orderId,
    attemptId,
    ledgerId,
    leaseTokenSha256: lease,
    providerOrderId,
    providerOrderRefSha256,
    providerOfferRefSha256,
  };
}

function workflow(input: Readonly<{
  port: FlightConsumerPreviewAsyncDuffelConvergencePort;
  transport?: { retrieve(input: Readonly<{
    providerOrderId: string;
    providerOrderRefSha256: string;
  }>): Promise<Readonly<{
    rawBody: Uint8Array;
    responseSha256: string;
    responseBytes: number;
    recoveryRequestSha256: string;
    providerOrderRefSha256: string;
  }>> };
  buildArtifact?: (input: Readonly<Record<string, unknown>>) => Promise<ReturnType<typeof artifact>>;
  open?: (input: Readonly<Record<string, unknown>>) => Uint8Array;
  seal?: (input: Readonly<Record<string, unknown>>) => Readonly<{
    keyVersion: string;
    ivBase64Url: string;
    authTagBase64Url: string;
    ciphertextBase64Url: string;
    aadSha256: string;
    ciphertextSha256: string;
    receiptSha256: string;
  }>;
}>) {
  const transport = input.transport ?? { retrieve: vi.fn(async () => ({
    rawBody: Uint8Array.from(rawBody),
    responseSha256,
    responseBytes: rawBody.byteLength,
    recoveryRequestSha256,
    providerOrderRefSha256,
  })) };
  const buildArtifact = input.buildArtifact ?? vi.fn(async () => artifact());
  const open = input.open ?? vi.fn(() => Uint8Array.from(rawBody));
  const seal = input.seal ?? vi.fn(() => ({
    keyVersion: "preview-evidence-v1",
    ivBase64Url: "A".repeat(16),
    authTagBase64Url: "B".repeat(22),
    ciphertextBase64Url: "C".repeat(32),
    aadSha256: "2".repeat(64),
    ciphertextSha256: "3".repeat(64),
    receiptSha256: evidenceReceiptSha256,
  }));
  return {
    workflow: createInjectedFlightConsumerPreviewAsyncDuffelConvergence({
      executionScopeSha256,
      port: input.port,
      transport,
      crypto: { seal, open },
      authorityReceipt,
      buildArtifact,
      now: () => now,
    }),
    transport,
    buildArtifact,
    open,
    seal,
  };
}

describe("Consumer Preview async Duffel order convergence", () => {
  it("validates ticketed GET evidence before atomically completing and finalizing", async () => {
    const events: string[] = [];
    const p = port({
      completeEvidence: vi.fn(async () => {
        events.push("complete-evidence");
        return [{
          ledger_id: ledgerId,
          ledger_revision: 2,
          ledger_state: "processed",
          evidence_id: evidenceId,
          recovery_evidence_receipt_sha256: evidenceReceiptSha256,
          retention_expires_at: "2026-09-01T20:00:00.000Z",
        }];
      }),
      finalize: vi.fn(async () => {
        events.push("finalize");
        return [{
          order_id: orderId,
          order_status: "ticketed",
          issued_ticket_count: 1,
          reconciliation_case_id: caseId,
        }];
      }),
    });
    const built = vi.fn(async () => {
      events.push("validate-provider-body");
      return artifact();
    });
    const created = workflow({ port: p, buildArtifact: built });
    await expect(created.workflow.converge(identity())).resolves.toEqual({
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
      reconciliationCaseId: caseId,
      webhookLeaseCompletionRequired: false,
    });
    expect(events).toEqual(["validate-provider-body", "complete-evidence", "finalize"]);
    expect(built).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      providerResponseSha256: responseSha256,
      responseObservedAt: now.toISOString(),
    }));
    expect(p.completeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      p_expected_revision: 1,
      p_lease_token_sha256: leaseTokenSha256,
      p_provider_response_sha256: responseSha256,
      p_recovery_evidence_receipt_sha256: evidenceReceiptSha256,
    }));
    expect(p.finalize).toHaveBeenCalledWith(expect.objectContaining({
      p_recovery_evidence_receipt_sha256: evidenceReceiptSha256,
      p_provider_order_ref_sha256: providerOrderRefSha256,
    }));
  });

  it("durably marks a crashed order-creating attempt ambiguous before recovery", async () => {
    const readContext = vi.fn()
      .mockResolvedValueOnce([context({
        order_status: "order_creating",
        reconciliation_case_id: null,
        reconciliation_case_status: null,
        reconciliation_resolution_actor_type: null,
        reconciliation_updated_at: null,
      })])
      .mockResolvedValueOnce([context()]);
    const p = port({ readContext });
    const created = workflow({ port: p });
    await expect(created.workflow.converge(identity())).resolves.toMatchObject({
      status: "ticketed",
    });
    expect(p.markAmbiguous).toHaveBeenCalledWith({
      p_attempt_id: attemptId,
      p_expected_terminal_revision: 2,
      p_expected_state_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_observed_state_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(readContext).toHaveBeenCalledTimes(2);
  });

  it("resumes from stored evidence without refetching mutable Duffel bytes", async () => {
    const row = context({
      ledger_state: "processed",
      ledger_revision: 2,
      recovery_evidence_receipt_sha256: evidenceReceiptSha256,
      recovery_retention_expires_at: "2026-08-26T20:00:00.000Z",
    });
    const requestReceipt = authorityReceipt(
      "duffel-order-recovery-request",
      {
        version: "flight-consumer-preview-duffel-order-recovery-request-authority-v1",
        customerId,
        orderId,
        attemptId,
        ledgerId,
        executionScopeSha256,
        providerOfferRefSha256,
        providerOrderRefSha256,
        recoveryRequestSha256,
      },
    );
    const responseReceipt = authorityReceipt(
      "duffel-order-recovery-response",
      {
        version: "flight-consumer-preview-duffel-order-recovery-response-authority-v1",
        customerId,
        orderId,
        attemptId,
        ledgerId,
        executionScopeSha256,
        providerOfferRefSha256,
        providerOrderRefSha256,
        recoveryRequestSha256,
        requestAuthorityReceiptSha256: requestReceipt,
        providerResponseSha256: responseSha256,
      },
    );
    const p = port({
      readContext: vi.fn(async () => [row]),
      loadEvidence: vi.fn(async () => [recoveryEvidence(responseReceipt)]),
    });
    const transport = { retrieve: vi.fn() };
    const created = workflow({ port: p, transport });
    await expect(created.workflow.converge(identity(null))).resolves.toMatchObject({
      status: "ticketed",
    });
    expect(transport.retrieve).not.toHaveBeenCalled();
    expect(created.open).toHaveBeenCalledTimes(1);
    expect(created.buildArtifact).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      providerResponseSha256: responseSha256,
      responseObservedAt: normalizedRecoveryObservedAt,
    }));
    expect(p.completeEvidence).not.toHaveBeenCalled();
    expect(p.finalize).toHaveBeenCalledTimes(1);
  });

  it("acknowledges an already-ticketed terminal replay without rebuilding artifacts", async () => {
    const p = port({
      readContext: vi.fn(async () => [context({
        order_status: "ticketed",
        ledger_state: "processed",
        ledger_revision: 2,
        recovery_evidence_receipt_sha256: evidenceReceiptSha256,
        recovery_retention_expires_at: "2026-08-26T20:00:00.000Z",
        reconciliation_case_status: "resolved",
        reconciliation_resolution_code: "provider_state_confirmed",
        reconciliation_resolution_actor_type: "system",
        reconciliation_system_receipt_sha256: "6".repeat(64),
        issued_ticket_count: 1,
      })]),
    });
    const created = workflow({ port: p });
    await expect(created.workflow.converge(identity(null))).resolves.toMatchObject({
      status: "ticketed",
      issuedTicketCount: 1,
      webhookLeaseCompletionRequired: false,
    });
    expect(p.readContext).toHaveBeenCalledWith({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_ledger_id: ledgerId,
      p_expected_lease_token_sha256: null,
    });
    expect(created.transport.retrieve).not.toHaveBeenCalled();
    expect(created.buildArtifact).not.toHaveBeenCalled();
    expect(p.finalize).not.toHaveBeenCalled();
  });

  it("authorizes local lease completion for delayed order.created on an already-ticketed order", async () => {
    const p = port({
      readContext: vi.fn(async () => [context({
        order_status: "ticketed",
        ledger_state: "processing",
        ledger_revision: 1,
        issued_ticket_count: 1,
      })]),
    });
    const created = workflow({ port: p });

    await expect(created.workflow.converge(identity())).resolves.toEqual({
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
      reconciliationCaseId: caseId,
      webhookLeaseCompletionRequired: true,
    });

    expect(p.readContext).toHaveBeenCalledWith({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_ledger_id: ledgerId,
      p_expected_lease_token_sha256: leaseTokenSha256,
    });
    expect(created.transport.retrieve).not.toHaveBeenCalled();
    expect(created.buildArtifact).not.toHaveBeenCalled();
    expect(p.completeEvidence).not.toHaveBeenCalled();
    expect(p.finalize).not.toHaveBeenCalled();
  });

  it("does not complete the webhook when provider ticket validation fails", async () => {
    const p = port();
    const created = workflow({
      port: p,
      buildArtifact: vi.fn(async () => {
        throw new Error("not issued");
      }),
    });
    await expect(created.workflow.converge(identity()))
      .rejects.toBeInstanceOf(FlightConsumerPreviewAsyncDuffelConvergenceError);
    expect(p.completeEvidence).not.toHaveBeenCalled();
    expect(p.finalize).not.toHaveBeenCalled();
  });

  it("fails closed on a processed ledger without durable recovery evidence", async () => {
    const p = port({
      readContext: vi.fn(async () => [context({
        ledger_state: "processed",
        ledger_revision: 2,
      })]),
    });
    const created = workflow({ port: p });
    await expect(created.workflow.converge(identity(null)))
      .rejects.toBeInstanceOf(FlightConsumerPreviewAsyncDuffelConvergenceError);
    expect(created.transport.retrieve).not.toHaveBeenCalled();
  });
});
