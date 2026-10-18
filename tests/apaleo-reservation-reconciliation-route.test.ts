import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ReadError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly detailCode: string,
    ) {
      super(message);
    }
  }
  return {
    ReadError,
    requireRole: vi.fn(),
    createAdminClient: vi.fn(),
    decryptPmsCredentials: vi.fn(),
    encryptPmsCredentials: vi.fn(),
    getAccessToken: vi.fn(),
    fetchReservation: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
    receiptUpdate: vi.fn(),
    credentialUpdate: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
  encryptPmsCredentials: mocks.encryptPmsCredentials,
}));
vi.mock("@/services/hotel-suppliers", () => ({
  ApaleoReservationReadError: mocks.ReadError,
  getApaleoAccessToken: mocks.getAccessToken,
  fetchApaleoReservation: mocks.fetchReservation,
}));

import { POST } from "../app/api/cron/apaleo-reservations/route";

const connectionId = "8f7dd408-fc1c-4ea7-b13e-f118688ac865";
const receipt = {
  id: "7781a8fc-bca4-4bf2-8374-f4c13f29a9c6",
  connection_id: connectionId,
  provider_entity_id: "MUC-RES-1",
  property_code: "MUC",
  event_type: "changed",
  processing_attempts: 1,
};

function selected(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

function updateBuilder(update: ReturnType<typeof vi.fn>) {
  return {
    update,
  };
}

describe("Apaleo reservation reconciliation worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.CRON_SECRET;
    process.env.APALEO_RECONCILIATION_BATCH_SIZE = "2";
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc
      .mockResolvedValueOnce({ data: [receipt], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    mocks.decryptPmsCredentials.mockReturnValue({
      PMS_APALEO_BASE_URL: "https://api.apaleo.com",
      PMS_APALEO_CLIENT_ID: "client-id",
      PMS_APALEO_CLIENT_SECRET: "client-secret",
      PMS_APALEO_REFRESH_TOKEN: "refresh-token",
      PMS_APALEO_WEBHOOK_PROPERTY_CODE: "MUC",
    });
    mocks.getAccessToken.mockResolvedValue({ accessToken: "access-token" });
    mocks.fetchReservation.mockResolvedValue({
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
      status: "Confirmed",
      snapshotSha256: "a".repeat(64),
    });
    const receiptEq2 = vi.fn().mockResolvedValue({ error: null });
    const receiptEq1 = vi.fn(() => ({ eq: receiptEq2 }));
    mocks.receiptUpdate.mockImplementation(() => ({ eq: receiptEq1 }));
    mocks.credentialUpdate.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.from.mockImplementation((table: string) => {
      if (table === "property_pms_connections") {
        return selected({ id: connectionId, provider_id: "apaleo", external_property_code: "MUC" });
      }
      if (table === "property_pms_credentials") {
        return {
          ...selected({
            ciphertext: "ciphertext",
            initialization_vector: "iv",
            authentication_tag: "tag",
            key_version: 1,
          }),
          ...updateBuilder(mocks.credentialUpdate),
        };
      }
      if (table === "pms_webhook_event_receipts") {
        return updateBuilder(mocks.receiptUpdate);
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("requires cron or administrator authorization before claiming a receipt", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });

    const response = await POST(new Request("https://www.iratepilot.com/api/cron/apaleo-reservations", {
      method: "POST",
    }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("claims, retrieves, and marks a PII-free reservation snapshot as reconciled", async () => {
    const response = await POST(new Request(
      `https://www.iratepilot.com/api/cron/apaleo-reservations?connectionId=${connectionId}`,
      { method: "POST" },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      summary: { claimed: 1, reconciled: 1, deleted: 0, failed: 0 },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "claim_apaleo_reservation_reconciliation_receipt",
      { p_connection_id: connectionId },
    );
    expect(mocks.fetchReservation).toHaveBeenCalledWith({
      baseUrl: "https://api.apaleo.com",
      accessToken: "access-token",
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
    });
    expect(mocks.receiptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      processing_status: "reconciled",
      reservation_snapshot_sha256: "a".repeat(64),
      provider_status: "Confirmed",
      last_error: null,
    }));
  });

  it("treats a deleted reservation returning 404 as a reconciled tombstone", async () => {
    mocks.rpc.mockReset()
      .mockResolvedValueOnce({ data: [{ ...receipt, event_type: "deleted" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    mocks.fetchReservation.mockRejectedValueOnce(new mocks.ReadError("not found", 404, "http_404"));

    const response = await POST(new Request("https://www.iratepilot.com/api/cron/apaleo-reservations", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { claimed: 1, reconciled: 1, deleted: 1, failed: 0 },
    });
    expect(mocks.receiptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      processing_status: "reconciled",
      provider_status: "deleted",
      reservation_snapshot_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("records a bounded retry state without storing provider response details", async () => {
    mocks.fetchReservation.mockRejectedValueOnce(new mocks.ReadError(
      "private provider response",
      502,
      "transport_error",
    ));

    const response = await POST(new Request("https://www.iratepilot.com/api/cron/apaleo-reservations", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: { claimed: 1, failed: 1 } });
    expect(mocks.receiptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      processing_status: "failed",
      last_error: "transport_error",
      reservation_snapshot_sha256: null,
      provider_status: null,
    }));
    expect(JSON.stringify(mocks.receiptUpdate.mock.calls)).not.toContain("private provider response");
  });
});
