import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const client = {
    from: vi.fn(() => builder),
    rpc: vi.fn(),
  };
  return {
    builder,
    client,
    createAdminClient: vi.fn(() => client),
    decryptPmsCredentials: vi.fn(() => ({
      IRATEPILOT_PMS_ARI_SIGNING_SECRET: "native-ari-sandbox-secret-with-at-least-32-bytes",
    })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({ decryptPmsCredentials: mocks.decryptPmsCredentials }));

import { GET, POST } from "../app/api/pms/ari/route";

const connectionId = "redroof-native-01";
const secret = "native-ari-sandbox-secret-with-at-least-32-bytes";
const connection = {
  pms_property_id: "pms-property-redroof",
  enabled: true,
  secret_ciphertext: "x".repeat(32),
  secret_initialization_vector: "i".repeat(16),
  secret_authentication_tag: "t".repeat(16),
  secret_key_version: 1,
};

function batch(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    eventId: "ari-event-1",
    propertyId: "pms-property-redroof",
    connector: "iratepilot",
    connectionId,
    sourceVersion: 1,
    generatedAt: new Date(Date.now() - 1000).toISOString(),
    updates: [{
      date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      roomTypeId: "ndq2",
      ratePlanId: "bar",
      available: 14,
      rateMinor: 10750,
      currency: "USD",
      minimumStay: 1,
      maximumStay: null,
      restrictions: [],
    }],
    ...overrides,
  };
}

function signedRequest(body = JSON.stringify(batch()), options: {
  timestamp?: string;
  signature?: string;
  contentType?: string;
} = {}) {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = options.signature ?? createHmac("sha256", secret)
    .update(`${timestamp}.${connectionId}.${body}`)
    .digest("hex");
  return new Request("https://www.iratepilot.com/api/pms/ari", {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      "x-irp-connection": connectionId,
      "x-irp-timestamp": timestamp,
      "x-irp-signature": signature,
    },
    body,
  });
}

describe("native PMS ARI receiver HTTP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "true";
    mocks.builder.maybeSingle.mockResolvedValue({ data: connection, error: null });
    mocks.client.rpc.mockResolvedValue({ data: { outcome: "applied" }, error: null });
    mocks.decryptPmsCredentials.mockReturnValue({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: secret });
  });

  it("stays unavailable when the receiver feature flag is off", async () => {
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "false";
    const response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("authenticates the exact raw body and invokes the atomic scoped database function", async () => {
    const body = JSON.stringify(batch());
    const response = await POST(signedRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "applied", eventId: "ari-event-1", updates: 1 });
    expect(mocks.client.rpc).toHaveBeenCalledWith("irp_pms_apply_native_ari", expect.objectContaining({
      p_connection: connectionId,
      p_event: "ari-event-1",
      p_source_version: 1,
      p_payload_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("rejects tampered signatures, stale timestamps, and mismatched PMS properties", async () => {
    const body = JSON.stringify(batch());
    expect((await POST(signedRequest(body, { signature: "0".repeat(64) }))).status).toBe(401);
    expect((await POST(signedRequest(body, { timestamp: "1000000000" }))).status).toBe(401);
    expect((await POST(signedRequest(JSON.stringify(batch({ propertyId: "another-property" }))))).status).toBe(422);
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types and oversized bodies before storage access", async () => {
    expect((await POST(signedRequest("{}", { contentType: "text/plain" }))).status).toBe(415);
    expect((await POST(signedRequest("x".repeat(256 * 1024 + 1)))).status).toBe(413);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("does not reveal database details when the atomic apply reports a conflict", async () => {
    mocks.client.rpc.mockResolvedValue({ data: null, error: { message: "ARI source version conflict: private record id" } });
    const response = await POST(signedRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "ari_conflict" });
  });

  it("returns only a generic unavailable response for storage failures", async () => {
    mocks.builder.maybeSingle.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "receiver_unavailable" });
  });

  it("exposes no read route", async () => {
    expect((await GET()).status).toBe(405);
  });
});
