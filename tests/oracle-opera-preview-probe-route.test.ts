import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadConfig: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/services/hotel-suppliers/oracle-opera/config", () => ({
  loadOracleOperaConfig: mocks.loadConfig,
}));
vi.mock("@/services/hotel-suppliers/oracle-opera/connection-test", () => {
  class OracleOperaConnectionTestError extends Error {
    constructor(
      message: string,
      readonly detailCode: string,
      readonly status?: number,
    ) {
      super(message);
    }
  }
  return {
    OracleOperaConnectionTestError,
    testOracleOperaSandboxConnection: mocks.testConnection,
  };
});

import { POST } from "../app/api/admin/integrations/pms/oracle-opera/preview-probe/route";
import { OracleOperaConnectionTestError } from "@/services/hotel-suppliers/oracle-opera/connection-test";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalHotelId = process.env.PMS_ORACLE_OPERA_HOTEL_ID;

function request(confirmation = "RUN_ORACLE_OHIP_PREVIEW_READ_ONLY_PROBE") {
  const body = JSON.stringify({ confirmation });
  return new Request("https://preview.example.test/api/admin/integrations/pms/oracle-opera/preview-probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });
}

afterAll(() => {
  if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnvironment;
  if (originalHotelId === undefined) delete process.env.PMS_ORACLE_OPERA_HOTEL_ID;
  else process.env.PMS_ORACLE_OPERA_HOTEL_ID = originalHotelId;
});

describe("Oracle OPERA Preview credential probe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "preview";
    process.env.PMS_ORACLE_OPERA_HOTEL_ID = "OHIPSB02";
    mocks.requireRole.mockResolvedValue({
      user: { id: "admin-a" },
      profile: { role: "admin" },
      supabase: {},
    });
    mocks.loadConfig.mockReturnValue({
      baseUrl: "https://sandbox.example.test",
      tokenUrl: "https://sandbox.example.test/oauth/v1/tokens",
      clientId: "redacted",
      clientSecret: "redacted",
      appKey: "redacted",
      enterpriseId: "ENTERPRISE-1",
      scope: "urn:opc:hgbu:ws:__myscopes__",
      timeoutMs: 15_000,
    });
    mocks.testConnection.mockResolvedValue({ hotelCount: 1 });
  });

  it("runs the bounded read-only sandbox probe with the exact execution phrase", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.testConnection).toHaveBeenCalledWith(expect.objectContaining({
      hotelId: "OHIPSB02",
      clientSecret: "redacted",
    }));
    await expect(response.json()).resolves.toEqual({
      passed: true,
      detailCode: "oracle_opera_titles_read_succeeded",
      hotelCount: 1,
    });
  });

  it("is unavailable outside Preview before vendor traffic", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("requires an authenticated admin before parsing the probe request or contacting Oracle", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("rejects a request without the exact execution phrase", async () => {
    expect((await POST(request("wrong"))).status).toBe(400);
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("returns only a redacted diagnostic when Oracle rejects the credentials", async () => {
    mocks.testConnection.mockRejectedValueOnce(new OracleOperaConnectionTestError(
      "Oracle OPERA authentication failed",
      "oracle_opera_authentication_failed",
      401,
    ));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      passed: false,
      detailCode: "oracle_opera_authentication_failed",
    });
  });
});
