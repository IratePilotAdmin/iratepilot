import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  exchangeCloudbedsAuthorizationCode: vi.fn(),
  getCloudbedsAuthorizedPropertyIds: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
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
    mocks.createAdminClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
    mocks.exchangeCloudbedsAuthorizationCode.mockResolvedValue("cbat_delivered");
    mocks.getCloudbedsAuthorizedPropertyIds.mockResolvedValue(["hotel-1"]);
    mocks.decryptPmsCredentials.mockReturnValue({ PMS_CLOUDBEDS_SOURCE_ID: "source-1" });
    mocks.encryptPmsCredentials.mockReturnValue({
      ciphertext: "ciphertext-value",
      initializationVector: "initialization-vector",
      authenticationTag: "authentication-tag",
      keyVersion: 1,
    });
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "property_pms_connections") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({
                    data: [{
                      id: "connection-1",
                      property_id: "property-1",
                      external_property_code: "hotel-1",
                    }],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
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
        };
      }
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
    expect(mocks.rpc).toHaveBeenCalledWith("complete_cloudbeds_api_key_delivery", {
      p_authorized_property_ids: ["hotel-1"],
      p_deliveries: [expect.objectContaining({ connection_id: "connection-1" })],
      p_validated_at: expect.any(String),
    });
  });

  it("does not store a key when no pre-onboarded property matches", async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
        })),
      })),
    }));
    const response = await GET(new Request(
      "https://www.iratepilot.com/api/integrations/cloudbeds/callback?code=one-time-code",
    ));
    expect(response.headers.get("location"))
      .toBe("https://www.iratepilot.com/support/cloudbeds?cloudbeds=unmatched");
    expect(mocks.encryptPmsCredentials).not.toHaveBeenCalled();
  });

  it("rejects ambiguous approved property ownership before storing credentials", async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "connection-1", property_id: "property-1", external_property_code: "hotel-1" },
                  { id: "connection-2", property_id: "property-2", external_property_code: "hotel-1" },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })),
    }));
    const response = await GET(new Request(
      "https://www.iratepilot.com/api/integrations/cloudbeds/callback?code=one-time-code",
    ));
    expect(response.headers.get("location"))
      .toBe("https://www.iratepilot.com/support/cloudbeds?cloudbeds=failed");
    expect(mocks.encryptPmsCredentials).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
