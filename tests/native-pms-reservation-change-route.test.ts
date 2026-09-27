import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const client = { from: vi.fn(() => builder), rpc: vi.fn() };
  return {
    builder, client,
    createAdminClient: vi.fn(() => client),
    decryptPmsCredentials: vi.fn(() => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "native-ari-sandbox-secret-with-at-least-32-bytes" })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({ decryptPmsCredentials: mocks.decryptPmsCredentials }));

import { GET, POST } from "../app/api/pms/reservation-changes/route";

const connectionId = "redroof-native-01";
const secret = "native-ari-sandbox-secret-with-at-least-32-bytes";
const connection = {
  pms_property_id: "pms-property-redroof", enabled: true,
  secret_ciphertext: "x".repeat(32), secret_initialization_vector: "i".repeat(16),
  secret_authentication_tag: "t".repeat(16), secret_key_version: 1,
};
const change = {
  contractVersion: 1,
  requestId: "50000000-0000-4000-8000-000000000001",
  connectionId,
  propertyId: "pms-property-redroof",
  bookingId: "40000000-0000-4000-8000-000000000001",
  expectedSourceVersion: 4,
  generatedAt: new Date(Date.now() - 1000).toISOString(),
  approvedBy: "30000000-0000-4000-8000-000000000001",
  stay: { checkIn: "2026-10-01", checkOut: "2026-10-03", guests: 2 },
};

function request(body: string | Uint8Array = JSON.stringify(change), options: { timestamp?: string; signature?: string; contentType?: string } = {}) {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const raw = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const signature = options.signature ?? createHmac("sha256", secret).update(`${timestamp}.${connectionId}.${new TextDecoder().decode(raw)}`).digest("hex");
  const requestBody = new ArrayBuffer(raw.byteLength);
  new Uint8Array(requestBody).set(raw);
  return new Request("https://www.iratepilot.com/api/pms/reservation-changes", {
    method: "POST",
    headers: { "content-type": options.contentType ?? "application/json", "x-irp-connection": connectionId, "x-irp-timestamp": timestamp, "x-irp-signature": signature },
    body: requestBody,
  });
}

describe("native PMS reservation-change receiver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IRATEPILOT_PMS_RESERVATION_CHANGES_ENABLED = "true";
    mocks.builder.maybeSingle.mockResolvedValue({ data: connection, error: null });
    mocks.client.rpc.mockResolvedValue({ data: { outcome: "applied", sourceVersion: 5, duplicate: false }, error: null });
    mocks.decryptPmsCredentials.mockReturnValue({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: secret });
  });

  it("fails closed until the reservation-change receiver is explicitly enabled", async () => {
    process.env.IRATEPILOT_PMS_RESERVATION_CHANGES_ENABLED = "false";
    expect((await POST(request())).status).toBe(503);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("verifies the raw body and delegates to the atomic, idempotent source transaction", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "applied", requestId: change.requestId, sourceVersion: 5 });
    expect(mocks.client.rpc).toHaveBeenCalledWith("irp_pms_apply_reservation_change", expect.objectContaining({
      p_connection: connectionId, p_request: change.requestId, p_property: change.propertyId,
      p_booking: change.bookingId, p_expected_source_version: 4,
      p_payload_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("rejects tampering, stale signatures, mismatched property scope, and wrong media types", async () => {
    expect((await POST(request(JSON.stringify(change), { signature: "0".repeat(64) }))).status).toBe(401);
    expect((await POST(request(JSON.stringify(change), { timestamp: "1000000000" }))).status).toBe(401);
    expect((await POST(request(JSON.stringify({ ...change, propertyId: "another-property" })))).status).toBe(422);
    expect((await POST(request("{}", { contentType: "text/plain" }))).status).toBe(415);
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects an oversized signed body before reading credentials or invoking the database", async () => {
    const response = await POST(request(`{"padding":"${"x".repeat(16 * 1024)}"}`));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("distinguishes malformed UTF-8, invalid JSON, and invalid change contracts", async () => {
    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    expect((await POST(request(invalidUtf8))).status).toBe(400);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ ...change, stay: { ...change.stay, checkIn: "2026-02-30" } })))).status).toBe(422);
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });

  it("does not reveal whether an unknown or disabled connection exists", async () => {
    mocks.builder.maybeSingle.mockResolvedValue({ data: { ...connection, enabled: false }, error: null });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.decryptPmsCredentials).not.toHaveBeenCalled();
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });

  it("reports a durable source review result without converting it to an applied booking", async () => {
    mocks.client.rpc.mockResolvedValue({ data: { outcome: "review", reasonCode: "price_change_requires_review", duplicate: false }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "review", reasonCode: "price_change_requires_review" });
  });

  it("keeps storage errors generic and exposes no read route", async () => {
    mocks.builder.maybeSingle.mockResolvedValue({ data: null, error: { message: "private detail" } });
    expect((await POST(request())).status).toBe(503);
    expect((await GET()).status).toBe(405);
  });
});
