import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAdminReconciliationError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("safe admin reconciliation error");
      this.kind = kind;
    }
  }
  return {
    MockAdminReconciliationError,
    compensate: vi.fn(),
    detail: vi.fn(),
    list: vi.fn(),
    notify: vi.fn(),
    readJson: vi.fn(),
    requireRole: vi.fn(),
    resolve: vi.fn(),
    sameOrigin: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/email/flight-notification-delivery.server", () => ({
  queueFlightConsumerPreviewNotification: mocks.notify,
}));
vi.mock("@/lib/flights/consumer-preview/admin-reconciliation.server", () => ({
  FlightConsumerPreviewAdminReconciliationError: mocks.MockAdminReconciliationError,
  compensateFlightConsumerPreviewAdminReconciliationCase: mocks.compensate,
  getFlightConsumerPreviewAdminReconciliationCase: mocks.detail,
  listFlightConsumerPreviewAdminReconciliationCases: mocks.list,
  resolveFlightConsumerPreviewAdminReconciliationCase: mocks.resolve,
  flightConsumerPreviewReconciliationStatusSchema: {
    safeParse(value: unknown) {
      return ["open", "investigating", "blocked", "resolved"].includes(String(value))
        ? { success: true, data: value }
        : { success: false };
    },
  },
}));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  readPreviewJson: mocks.readJson,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  },
}));

import { GET as listCases } from "../app/api/admin/flights/consumer-preview/reconciliation/route";
import { GET as getCase } from "../app/api/admin/flights/consumer-preview/reconciliation/[caseId]/route";
import { POST as resolveCase } from "../app/api/admin/flights/consumer-preview/reconciliation/[caseId]/resolve/route";
import { POST as compensateCase } from "../app/api/admin/flights/consumer-preview/reconciliation/[caseId]/compensate/route";

const caseId = "11111111-1111-4111-8111-111111111111";
const expectedUpdatedAt = "2026-08-25T18:01:00.000Z";
const evidence = "a".repeat(64);
const supabase = { rpc: vi.fn() };

function request(path: string, method = "GET") {
  return new Request(`https://preview.example.test${path}`, { method });
}

describe("Flight Consumer Preview admin reconciliation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ supabase, user: { id: "admin" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.readJson.mockResolvedValue({
      ok: true,
      value: {
        expectedUpdatedAt,
        resolutionCode: "duplicate_suppressed",
        resolutionEvidenceSha256: evidence,
      },
    });
    mocks.list.mockResolvedValue([]);
    mocks.detail.mockResolvedValue({ caseId });
    mocks.resolve.mockResolvedValue({ decision: "resolved", caseId });
    mocks.compensate.mockResolvedValue({ decision: "refunded", orderId: caseId });
  });

  it("authenticates list/detail reads and rejects unbounded or unknown filters", async () => {
    const listed = await listCases(request(
      "/api/admin/flights/consumer-preview/reconciliation?status=open&limit=25",
    ));
    expect(listed.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.list).toHaveBeenCalledWith(supabase, { limit: 25, status: "open" });

    const detailed = await getCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}`,
    ), { params: Promise.resolve({ caseId }) });
    expect(detailed.status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(supabase, caseId);

    for (const query of [
      "status=unknown",
      "limit=0",
      "limit=101",
      "limit=1.5",
      "status=open&status=blocked",
      "unexpected=1",
    ]) {
      const invalid = await listCases(request(
        `/api/admin/flights/consumer-preview/reconciliation?${query}`,
      ));
      expect(invalid.status).toBe(400);
    }
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("requires same-origin authenticated admin resolution with exact CAS evidence", async () => {
    const response = await resolveCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/resolve`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(supabase, {
      caseId,
      expectedUpdatedAt,
      resolutionCode: "duplicate_suppressed",
      resolutionEvidenceSha256: evidence,
    });

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: {
        expectedUpdatedAt,
        resolutionCode: "duplicate_suppressed",
        resolutionEvidenceSha256: evidence,
        travelerEmail: "must-not-be-accepted@example.test",
      },
    });
    const extraField = await resolveCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/resolve`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(extraField.status).toBe(400);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);

    mocks.sameOrigin.mockReturnValueOnce(false);
    const crossSite = await resolveCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/resolve`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(crossSite.status).toBe(403);

    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const unauthenticated = await resolveCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/resolve`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(unauthenticated.status).toBe(401);
  });

  it("keeps compensation admin-only, same-origin, generic, and delegated to the bounded workflow", async () => {
    const response = await compensateCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/compensate`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(response.status).toBe(200);
    expect(mocks.compensate).toHaveBeenCalledWith(
      supabase,
      caseId,
      undefined,
      expect.any(Function),
    );

    mocks.compensate.mockRejectedValueOnce(
      new mocks.MockAdminReconciliationError("conflict"),
    );
    const ineligible = await compensateCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/compensate`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(ineligible.status).toBe(409);
    expect(JSON.stringify(await ineligible.json())).not.toMatch(/secret|provider_reference|traveler/i);

    mocks.sameOrigin.mockReturnValueOnce(false);
    const crossSite = await compensateCase(request(
      `/api/admin/flights/consumer-preview/reconciliation/${caseId}/compensate`,
      "POST",
    ), { params: Promise.resolve({ caseId }) });
    expect(crossSite.status).toBe(403);
  });
});
