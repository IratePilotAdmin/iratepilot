import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  listApaleoProperties: vi.fn(),
  from: vi.fn(),
  credentialUpdate: vi.fn(),
  connectionUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
  encryptPmsCredentials: mocks.encryptPmsCredentials,
}));
vi.mock("@/services/hotel-suppliers", () => ({
  ApaleoConnectionTestError: class ApaleoConnectionTestError extends Error {},
  listApaleoProperties: mocks.listApaleoProperties,
}));

import { GET, PATCH } from "../app/api/admin/integrations/pms/apaleo/properties/route";

const connection = {
  id: "connection-1",
  provider_id: "apaleo",
  external_property_code: "OLD",
};

const stored = {
  ciphertext: "ciphertext",
  initialization_vector: "iv",
  authentication_tag: "tag",
  key_version: "v1",
};

function selectionResult(data: unknown) {
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
      return {
        ...selectionResult(connection),
        update: mocks.connectionUpdate,
      };
    }
    if (table === "property_pms_credentials") {
      return {
        ...selectionResult(stored),
        update: mocks.credentialUpdate,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("Apaleo property selection route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.decryptPmsCredentials.mockReturnValue({
      PMS_APALEO_BASE_URL: "https://api.apaleo.com",
      PMS_APALEO_CLIENT_ID: "client-id",
      PMS_APALEO_CLIENT_SECRET: "client-secret",
      PMS_APALEO_REFRESH_TOKEN: "saved-refresh-token",
    });
    mocks.encryptPmsCredentials.mockReturnValue({
      ciphertext: "rotated-ciphertext",
      initializationVector: "rotated-iv",
      authenticationTag: "rotated-tag",
      keyVersion: "v1",
    });
    mocks.listApaleoProperties.mockResolvedValue({
      properties: [
        { id: "MUC", name: "Munich Test Hotel" },
        { id: "BER", name: "Berlin Test Hotel" },
      ],
    });
    mocks.credentialUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.connectionUpdate.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: "connection-1", external_property_code: "MUC" },
              error: null,
            }),
          })),
        })),
      })),
    });
    configureDatabase();
  });

  it("rejects unauthenticated access before creating a privileged client", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 401 });

    const response = await GET(new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/properties?connectionId=connection-1"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Access denied." });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns the authorized properties and current selection", async () => {
    const response = await GET(new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/properties?connectionId=connection-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      properties: [
        { id: "MUC", name: "Munich Test Hotel" },
        { id: "BER", name: "Berlin Test Hotel" },
      ],
      selectedPropertyCode: "OLD",
    });
    expect(mocks.listApaleoProperties).toHaveBeenCalledWith({
      baseUrl: "https://api.apaleo.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "saved-refresh-token",
    });
  });

  it("stores a rotated refresh token without returning it", async () => {
    mocks.listApaleoProperties.mockResolvedValueOnce({
      properties: [{ id: "MUC", name: "Munich Test Hotel" }],
      refreshToken: "rotated-refresh-token",
    });

    const response = await GET(new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/properties?connectionId=connection-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("refreshToken");
    expect(mocks.encryptPmsCredentials).toHaveBeenCalledWith(expect.objectContaining({
      PMS_APALEO_REFRESH_TOKEN: "rotated-refresh-token",
    }));
    expect(mocks.credentialUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ciphertext: "rotated-ciphertext",
      configured_by: "admin-1",
    }));
  });

  it("refuses a property that is not authorized for the Apaleo account", async () => {
    const response = await PATCH(new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-1", propertyCode: "UNAUTHORIZED" }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Choose a property authorized for this Apaleo account.",
    });
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("saves an authorized property while keeping live traffic disabled", async () => {
    const response = await PATCH(new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-1", propertyCode: "MUC" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      property: { id: "MUC", name: "Munich Test Hotel" },
      selectedPropertyCode: "MUC",
      message: "Apaleo property selection saved. Live traffic remains disabled.",
    });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      external_property_code: "MUC",
      last_validated_at: null,
    }));
  });
});
