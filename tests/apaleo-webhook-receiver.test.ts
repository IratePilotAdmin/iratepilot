import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
}));

import { POST } from "../app/api/webhooks/apaleo/[connectionId]/route";

const connectionId = "8f7dd408-fc1c-4ea7-b13e-f118688ac865";
const secret = "webhook-secret-with-more-than-thirty-two-characters";
const context = { params: Promise.resolve({ connectionId }) };

function selected(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

function request(payload: Record<string, unknown>, token = secret, headers?: Record<string, string>) {
  return new Request(`https://www.iratepilot.com/api/webhooks/apaleo/${connectionId}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

describe("Apaleo webhook receiver", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.decryptPmsCredentials.mockReturnValue({
      PMS_APALEO_WEBHOOK_SECRET: secret,
      PMS_APALEO_WEBHOOK_PROPERTY_CODE: "MUC",
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "property_pms_connections") {
        return selected({ id: connectionId, provider_id: "apaleo", external_property_code: "MUC" });
      }
      if (table === "property_pms_credentials") {
        return selected({
          ciphertext: "ciphertext",
          initialization_vector: "iv",
          authentication_tag: "tag",
          key_version: 1,
        });
      }
      if (table === "pms_webhook_event_receipts") return { insert: mocks.insert };
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("accepts Apaleo's property-scoped health check without creating an event receipt", async () => {
    const response = await POST(request({
      id: "healthcheck-1",
      topic: "system",
      type: "healthcheck",
      propertyIds: ["MUC"],
      timestamp: Date.now(),
    }), context);

    expect(response.status).toBe(204);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("accepts a health check when Apaleo includes other authorized properties", async () => {
    const response = await POST(request({
      id: "healthcheck-1",
      topic: "system",
      type: "healthcheck",
      propertyIds: ["LND", "MUC", "BER"],
      timestamp: Date.now(),
    }), context);

    expect(response.status).toBe(204);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a health check that omits the selected property", async () => {
    const response = await POST(request({
      id: "healthcheck-1",
      topic: "system",
      type: "healthcheck",
      propertyIds: ["LND", "BER"],
      timestamp: Date.now(),
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid endpoint token before reading the body", async () => {
    const response = await POST(request({
      id: "event-1",
      topic: "reservation",
      type: "created",
      propertyId: "MUC",
      timestamp: Date.now(),
    }, "wrong-token-with-more-than-thirty-two-characters"), context);

    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores a minimal reconciliation receipt for a selected-property reservation event", async () => {
    const payload = {
      id: "event-1",
      topic: "Reservation",
      type: "amended",
      propertyId: "MUC",
      timestamp: Date.now(),
      data: { entityId: "reservation-contains-sensitive-provider-reference" },
    };
    const raw = JSON.stringify(payload);
    const response = await POST(request(payload, secret, { "apaleo-tracking-id": "tracking-1" }), context);

    expect(response.status).toBe(204);
    expect(mocks.insert).toHaveBeenCalledWith({
      connection_id: connectionId,
      provider_id: "apaleo",
      provider_event_id: "event-1",
      topic: "Reservation",
      event_type: "amended",
      property_code: "MUC",
      provider_entity_id: "reservation-contains-sensitive-provider-reference",
      provider_occurred_at: new Date(payload.timestamp).toISOString(),
      payload_sha256: createHash("sha256").update(raw).digest("hex"),
      tracking_id_sha256: createHash("sha256").update("tracking-1").digest("hex"),
    });
    expect(JSON.stringify(mocks.insert.mock.calls[0][0])).not.toMatch(/guest|email|phone|primaryGuest/i);
  });

  it("acknowledges duplicate event IDs without creating a retry loop", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505" } });

    const response = await POST(request({
      id: "event-1",
      topic: "reservation",
      type: "created",
      propertyId: "MUC",
      timestamp: Date.now(),
      data: { entityId: "reservation-1" },
    }), context);

    expect(response.status).toBe(204);
  });

  it("rejects a reservation event that cannot be tied to a provider entity", async () => {
    const response = await POST(request({
      id: "event-1",
      topic: "reservation",
      type: "created",
      propertyId: "MUC",
      timestamp: Date.now(),
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects events for a property outside the saved selection", async () => {
    const response = await POST(request({
      id: "event-1",
      topic: "reservation",
      type: "created",
      propertyId: "BER",
      timestamp: Date.now(),
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
