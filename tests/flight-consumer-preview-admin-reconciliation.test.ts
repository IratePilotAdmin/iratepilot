import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/reconciliation-workflow.server", () => ({
  reconcileFlightConsumerPreviewOrder: vi.fn(),
}));

import {
  FlightConsumerPreviewAdminReconciliationError,
  compensateFlightConsumerPreviewAdminReconciliationCase,
  getFlightConsumerPreviewAdminReconciliationCase,
  listFlightConsumerPreviewAdminReconciliationCases,
  resolveFlightConsumerPreviewAdminReconciliationCase,
  type FlightConsumerPreviewAdminRpcClient,
} from "../lib/flights/consumer-preview/admin-reconciliation.server";

const caseId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const paymentId = "44444444-4444-4444-8444-444444444444";
const providerAttemptId = "55555555-5555-4555-8555-555555555555";
const refundAttemptId = "66666666-6666-4666-8666-666666666666";
const adminId = "77777777-7777-4777-8777-777777777777";
const createdAt = "2026-08-25T18:00:00.000Z";
const updatedAt = "2026-08-25T18:01:00.000Z";

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    case_id: caseId,
    order_id: orderId,
    customer_id: customerId,
    confirmation_code: "FLT-TEST-0001",
    case_type: "ambiguous_order",
    subject_type: "flight_order",
    source_status: "requires_review",
    target_status: "failed",
    case_status: "open",
    resolution_code: null,
    created_at: createdAt,
    updated_at: updatedAt,
    resolved_at: null,
    order_status: "requires_review",
    payment_status: "captured",
    provider_attempt_state: "failed",
    refund_attempt_state: null,
    total_cents: "42100",
    currency: "USD",
    ticket_count: 0,
    execution_scope_sha256: "a".repeat(64),
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    source_revision_at: createdAt,
    expected_state_sha256: "b".repeat(64),
    observed_state_sha256: "c".repeat(64),
    target_state_sha256: "d".repeat(64),
    resolution_evidence_sha256: null,
    resolved_by: null,
    payment_id: paymentId,
    provider_attempt_id: providerAttemptId,
    refund_attempt_id: null,
    provider_attempt_revision: 2,
    refund_attempt_revision: null,
    authorized_cents: "42100",
    captured_cents: "42100",
    refunded_cents: "0",
    ...overrides,
  };
}

function client(data: unknown): FlightConsumerPreviewAdminRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn(async () => ({ data, error: null })) };
}

describe("Flight Consumer Preview admin reconciliation", () => {
  it("lists and details only strict sanitized Preview evidence", async () => {
    const listClient = client([listRow()]);
    await expect(listFlightConsumerPreviewAdminReconciliationCases(listClient, {
      limit: 25,
      status: "open",
    })).resolves.toEqual([expect.objectContaining({
      caseId,
      orderId,
      status: "open",
      totalCents: 42_100,
    })]);
    expect(listClient.rpc).toHaveBeenCalledWith(
      "list_flight_consumer_admin_reconciliation_v1",
      { p_limit: 25, p_status: "open" },
    );

    const detailClient = client([detailRow()]);
    await expect(getFlightConsumerPreviewAdminReconciliationCase(detailClient, caseId)).resolves.toEqual(
      expect.objectContaining({
        caseId,
        paymentId,
        providerAttemptId,
        capturedCents: 42_100,
      }),
    );
    expect(detailClient.rpc).toHaveBeenCalledWith(
      "get_flight_consumer_admin_reconciliation_v1",
      { p_case_id: caseId },
    );

    const noPayment = client([detailRow({
      payment_id: null,
      payment_status: null,
      authorized_cents: null,
      captured_cents: null,
      refunded_cents: null,
    })]);
    await expect(getFlightConsumerPreviewAdminReconciliationCase(noPayment, caseId)).resolves.toMatchObject({
      paymentId: null,
      authorizedCents: null,
      capturedCents: null,
      refundedCents: null,
    });

    const unsafe = client([{ ...listRow(), traveler_email: "secret@example.test" }]);
    const error = await listFlightConsumerPreviewAdminReconciliationCases(unsafe).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FlightConsumerPreviewAdminReconciliationError);
    expect(String(error)).not.toContain("secret@example.test");
  });

  it("resolves through exact authenticated-admin CAS evidence and validates replay output", async () => {
    const evidence = "e".repeat(64);
    const rpc = client([{
      decision: "resolved",
      case_id: caseId,
      case_status: "resolved",
      resolution_code: "duplicate_suppressed",
      resolution_evidence_sha256: evidence,
      resolved_by: adminId,
      resolved_at: "2026-08-25T18:02:00.000Z",
      updated_at: "2026-08-25T18:02:00.000Z",
    }]);
    await expect(resolveFlightConsumerPreviewAdminReconciliationCase(rpc, {
      caseId,
      expectedUpdatedAt: updatedAt,
      resolutionCode: "duplicate_suppressed",
      resolutionEvidenceSha256: evidence,
    })).resolves.toMatchObject({
      decision: "resolved",
      caseId,
      resolvedBy: adminId,
    });
    expect(rpc.rpc).toHaveBeenCalledWith(
      "resolve_flight_consumer_admin_reconciliation_v1",
      {
        p_case_id: caseId,
        p_expected_updated_at: updatedAt,
        p_resolution_code: "duplicate_suppressed",
        p_resolution_evidence_sha256: evidence,
      },
    );
  });

  it("compensates only a resolved duplicate-suppressed order with stable server idempotency", async () => {
    const reconciled = {
      decision: "refunded" as const,
      orderId,
      paymentId,
      refundAttemptId,
    };
    const reconcile = vi.fn(async () => reconciled);
    const eligible = client([detailRow({
      case_status: "resolved",
      resolution_code: "duplicate_suppressed",
      resolution_evidence_sha256: "e".repeat(64),
      resolved_by: adminId,
      resolved_at: "2026-08-25T18:02:00.000Z",
    })]);
    await expect(compensateFlightConsumerPreviewAdminReconciliationCase(
      eligible,
      caseId,
      reconcile,
    )).resolves.toEqual(reconciled);
    expect(reconcile).toHaveBeenCalledWith({
      customerId,
      orderId,
      idempotencyKey: `flight-consumer-preview-admin-compensate:${caseId}`,
    });

    const schedulingFailure = vi.fn(() => {
      throw new Error("post-commit worker unavailable");
    });
    await expect(compensateFlightConsumerPreviewAdminReconciliationCase(
      client([detailRow({
        case_status: "resolved",
        resolution_code: "duplicate_suppressed",
        resolution_evidence_sha256: "e".repeat(64),
        resolved_by: adminId,
        resolved_at: "2026-08-25T18:02:00.000Z",
      })]),
      caseId,
      reconcile,
      schedulingFailure,
    )).resolves.toEqual(reconciled);
    expect(schedulingFailure).toHaveBeenCalledWith({ customerId, orderId, result: reconciled });

    const ineligible = client([detailRow({ case_status: "blocked" })]);
    const blocked = vi.fn();
    await expect(compensateFlightConsumerPreviewAdminReconciliationCase(
      ineligible,
      caseId,
      blocked,
    )).rejects.toMatchObject({ kind: "conflict" });
    expect(blocked).not.toHaveBeenCalled();
  });
});
