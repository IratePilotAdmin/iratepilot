import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  getApaleoAccessToken: vi.fn(),
  listApaleoProperties: vi.fn(),
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  from: vi.fn(),
  credentialUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
  encryptPmsCredentials: mocks.encryptPmsCredentials,
}));
vi.mock("@/services/hotel-suppliers", () => ({
  ApaleoConnectionTestError: class ApaleoConnectionTestError extends Error {},
  ApaleoWebhookError: class ApaleoWebhookError extends Error {},
  getApaleoAccessToken: mocks.getApaleoAccessToken,
  listApaleoProperties: mocks.listApaleoProperties,
  createApaleoWebhookSubscription: mocks.createSubscription,
  deleteApaleoWebhookSubscription: mocks.deleteSubscription,
}));

import { DELETE, POST } from "../app/api/admin/integrations/pms/apaleo/webhook/route";

const connectionId = "8f7dd408-fc1c-4ea7-b13e-f118688ac865";
const baseCredentials = {
  PMS_APALEO_BASE_URL: "https://api.apaleo.com",
  PMS_APALEO_CLIENT_ID: "client-id",
  PMS_APALEO_CLIENT_SECRET: "client-secret",
  PMS_APALEO_REFRESH_TOKEN: "refresh-token",
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

function configureDatabase() {
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
        update: mocks.credentialUpdate,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("Apaleo webhook lifecycle route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://www.iratepilot.com";
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.decryptPmsCredentials.mockReturnValue({ ...baseCredentials });
    mocks.encryptPmsCredentials.mockReturnValue({
      ciphertext: "encrypted",
      initializationVector: "encrypted-iv",
      authenticationTag: "encrypted-tag",
      keyVersion: 1,
    });
    mocks.credentialUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.listApaleoProperties.mockResolvedValue({
      accessToken: "access-token",
      properties: [{ id: "MUC", name: "Munich Test Hotel" }],
      refreshToken: "rotated-refresh-token",
    });
    mocks.getApaleoAccessToken.mockResolvedValue({ accessToken: "access-token" });
    mocks.createSubscription.mockResolvedValue({ id: "subscription-1" });
    mocks.deleteSubscription.mockResolvedValue(undefined);
    configureDatabase();
  });

  it("checks admin access before opening the credential vault", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });

    const response = await POST(new Request("https://www.iratepilot.com/api/admin/integrations/pms/apaleo/webhook", {
      method: "POST",
      body: JSON.stringify({ connectionId }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("revalidates the property, persists the endpoint secret, and stores the subscription ID", async () => {
    const response = await POST(new Request("https://www.iratepilot.com/api/admin/integrations/pms/apaleo/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ active: true, propertyCode: "MUC" });
    expect(mocks.listApaleoProperties).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: "refresh-token",
    }));
    expect(mocks.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      propertyCode: "MUC",
      events: ["reservation/*"],
      endpointUrl: expect.stringMatching(/^https:\/\/www\.iratepilot\.com\/api\/webhooks\/apaleo\/.+\?token=.+$/),
    }));
    expect(mocks.encryptPmsCredentials).toHaveBeenCalledTimes(2);
    expect(mocks.encryptPmsCredentials.mock.calls[0][0]).toMatchObject({
      PMS_APALEO_REFRESH_TOKEN: "rotated-refresh-token",
      PMS_APALEO_WEBHOOK_PROPERTY_CODE: "MUC",
      PMS_APALEO_WEBHOOK_SECRET: expect.any(String),
    });
    expect(mocks.encryptPmsCredentials.mock.calls[1][0]).toMatchObject({
      PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID: "subscription-1",
    });
  });

  it("does not create a subscription for a property no longer authorized by Apaleo", async () => {
    mocks.listApaleoProperties.mockResolvedValueOnce({
      accessToken: "access-token",
      properties: [{ id: "BER", name: "Berlin Test Hotel" }],
    });

    const response = await POST(new Request("https://www.iratepilot.com/api/admin/integrations/pms/apaleo/webhook", {
      method: "POST",
      body: JSON.stringify({ connectionId }),
    }));

    expect(response.status).toBe(409);
    expect(mocks.createSubscription).not.toHaveBeenCalled();
    expect(mocks.credentialUpdate).not.toHaveBeenCalled();
  });

  it("deletes the vendor subscription before removing the local secret", async () => {
    mocks.decryptPmsCredentials.mockReturnValueOnce({
      ...baseCredentials,
      PMS_APALEO_WEBHOOK_SECRET: "secret",
      PMS_APALEO_WEBHOOK_PROPERTY_CODE: "MUC",
      PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID: "subscription-1",
    });

    const response = await DELETE(new Request(
      `https://www.iratepilot.com/api/admin/integrations/pms/apaleo/webhook?connectionId=${connectionId}`,
      { method: "DELETE" },
    ));

    expect(response.status).toBe(200);
    expect(mocks.deleteSubscription).toHaveBeenCalledWith({
      accessToken: "access-token",
      subscriptionId: "subscription-1",
    });
    const saved = mocks.encryptPmsCredentials.mock.calls[0][0];
    expect(saved).not.toHaveProperty("PMS_APALEO_WEBHOOK_SECRET");
    expect(saved).not.toHaveProperty("PMS_APALEO_WEBHOOK_PROPERTY_CODE");
    expect(saved).not.toHaveProperty("PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID");
  });
});
