import { describe, expect, it, vi } from "vitest";
import { testRmsCloudSandboxConnection } from "../services/hotel-suppliers/rms-cloud";
import type { RmsCloudFetch } from "../services/hotel-suppliers/rms-cloud";

const config = {
  baseUrl: "https://testrestapi2.rmscloud.com/",
  agentId: "912",
  agentPassword: "agent-password",
  clientId: "22027",
  clientPassword: "client-password",
  propertyId: "43838175",
};

describe("RMS Cloud sandbox connection test", () => {
  it("creates a training token and performs a read-only property check", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "short-lived-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 43838175, name: "Test Hotel" }))) as RmsCloudFetch;

    await expect(testRmsCloudSandboxConnection(config, fetcher))
      .resolves.toEqual({ propertyCount: 1 });
    const [authUrl, authInit] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(authUrl)).toBe("https://testrestapi2.rmscloud.com/authToken");
    expect(JSON.parse(String(authInit?.body))).toEqual({
      agentId: 912,
      agentPassword: config.agentPassword,
      clientId: 22027,
      clientPassword: config.clientPassword,
      moduleType: ["DataWarehouse"],
      useTrainingDatabase: true,
    });
    const [propertyUrl, propertyInit] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(String(propertyUrl)).toBe("https://testrestapi2.rmscloud.com/properties/43838175");
    expect(propertyInit?.method).toBe("GET");
    expect(new Headers(propertyInit?.headers).get("authtoken")).toBe("short-lived-token");
  });

  it("returns a stable authentication failure without exposing passwords", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as RmsCloudFetch;
    const error = await testRmsCloudSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toMatchObject({ status: 401, detailCode: "rms_cloud_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain(config.agentPassword);
    expect(JSON.stringify(error)).not.toContain(config.clientPassword);
  });

  it("rejects malformed authentication responses", async () => {
    const fetcher = vi.fn(async () => new Response("{}")) as unknown as RmsCloudFetch;
    await expect(testRmsCloudSandboxConnection(config, fetcher)).rejects.toMatchObject({
      detailCode: "rms_cloud_invalid_authentication_response",
    });
  });

  it("rejects insecure base URLs", async () => {
    await expect(testRmsCloudSandboxConnection({ ...config, baseUrl: "http://rms.test/" }))
      .rejects.toThrow("RMS Cloud base URL must use HTTPS");
  });
});
