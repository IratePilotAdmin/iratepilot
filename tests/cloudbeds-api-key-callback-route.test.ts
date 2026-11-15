import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  exchangeCloudbedsAuthorizationCode: vi.fn(),
  getCloudbedsAuthorizedPropertyIds: vi.fn(),
  from: vi.fn(),
  credentialUpsert: vi.fn(),
  connectionUpdate: vi.fn(),
  eventInsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
  encryptPmsCredentials: mocks.encryptPmsCredentials,
}));
vi.mock("@/services/hotel-suppliers", () => ({
  exchangeCloudbedsAuthorizationCode: mocks.exchangeCloudbedsAuthorizationCode,
  getCloudbedsAuthorizedPropertyIds: mocks.getCloudbedsAuthorizedPropertyIds,
}));

import { GET } from "../app/api/integrations/cloudbeds/callback/route";

describe("Cloudbeds API-key callback route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://www.iratepilot.com";
    process.env.CLOUDBEDS_CLIENT_ID = "client-id";
    process.env.CLOUDBEDS_CLIENT_SECRET = "client-secret";
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.exchangeCloudbedsAuthorizationCode.mockResolvedValue("cbat_delivered");
    mocks.getCloudbedsAuthorizedPropertyIds.mockResolvedValue(["hotel-1"]);
    mocks.decryptPmsCredentials.mockReturnValue({ PMS_CLOUDBEDS_SOURCE_ID: "source-1" });
    mocks.encryptPmsCredentials.mockReturnValue({
      ciphertext: "ciphertext-value",
      initializationVector: "initialization-vector",
      authenticationTag: "authentication-tag",
      keyVersion: 1,
    });
    mocks.credentialUpsert.mockResolvedValue({ error: null });
    mocks.connectionUpdate.mockReturnValue({
      eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    });
    mocks.eventInsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "property_pms_connections") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "connection-1", external_property_code: "hotel-1" }],
                error: null,
              }),
            })),
          })),
          update: mocks.connectionUpdate,
        };
      }
      if (table === "property_pms_credentials") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  ciphertext: "old-ciphertext",
                  initialization_vector: "old-iv",
                  authentication_tag: "old-tag",
                  key_version: 1,
                },
                error: null,
              }),
            })),
          })),
          upsert: mocks.credentialUpsert,
        };
      }
      if (table === "pms_connection_test_events") return { insert: mocks.eventInsert };
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("fails closed when Cloudbeds does not provide a code", async () => {
    const response = await GET(new Request("https://www.iratepilot.com/api/integrations/cloudbeds/callback"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location"))
      .toBe("https://www.iratepilot.com/support/cloudbeds?cloudbeds=failed");
    expect(mocks.exchangeCloudbedsAuthorizationCode).not.toHaveBeenCalled();
  });

  it("stores the delivered key only for an existing authorized property mapping", async () => {
    const response = await GET(new Request(
      "https://www.iratepilot.com/api/integrations/cloudbeds/callback?code=one-time-code",
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location"))
      .toBe("https://www.iratepilot.com/support/cloudbeds?cloudbeds=connected");
    expect(mocks.exchangeCloudbedsAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://www.iratepilot.com/api/integrations/cloudbeds/callback",
      }),
      "one-time-code",
    );
    expect(mocks.encryptPmsCredentials).toHaveBeenCalledWith({
      PMS_CLOUDBEDS_SOURCE_ID: "source-1",
      PMS_CLOUDBEDS_BASE_URL: "https://api.cloudbeds.com",
      PMS_CLOUDBEDS_API_KEY: "cbat_delivered",
    });
    expect(mocks.credentialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ connection_id: "connection-1", configured_by: null }),
      { onConflict: "connection_id" },
    );
    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      detail_code: "cloudbeds_api_key_delivery_succeeded",
      result: "passed",
    }));
  });

  it("does not store a key when no pre-onboarded property matches", async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
      })),
    }));
    const response = await GET(new Request(
      "https://www.iratepilot.com/api/integrations/cloudbeds/callback?code=one-time-code",
    ));
    expect(response.headers.get("location"))
      .toBe("https://www.iratepilot.com/support/cloudbeds?cloudbeds=unmatched");
    expect(mocks.encryptPmsCredentials).not.toHaveBeenCalled();
  });
});
