import { describe, expect, it, vi } from "vitest";
import {
  ApaleoConnectionTestError,
  testApaleoSandboxConnection,
} from "../services/hotel-suppliers/apaleo";
import type { ApaleoFetch } from "../services/hotel-suppliers/apaleo";

const config = {
  baseUrl: "https://api.apaleo.com",
  clientId: "IRP-SIMPLEAPP",
  clientSecret: "client-secret-value",
};

describe("Apaleo sandbox connection test", () => {
  it("obtains a short-lived token and reads properties", async () => {
    const fetcher = vi.fn<ApaleoFetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-lived-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: [{ id: "MUC" }] })));

    await expect(testApaleoSandboxConnection(config, fetcher))
      .resolves.toEqual({ propertyCount: 1 });

    const [tokenUrl, tokenInit] = fetcher.mock.calls[0] ?? [];
    expect(String(tokenUrl)).toBe("https://identity.apaleo.com/connect/token");
    expect(tokenInit?.method).toBe("POST");
    expect(String(tokenInit?.body)).toBe("grant_type=client_credentials");
    expect(new Headers(tokenInit?.headers).get("authorization"))
      .toBe(`Basic ${btoa("IRP-SIMPLEAPP:client-secret-value")}`);

    const [propertiesUrl, propertiesInit] = fetcher.mock.calls[1] ?? [];
    expect(String(propertiesUrl)).toBe("https://api.apaleo.com/inventory/v1/properties");
    expect(propertiesInit?.method).toBe("GET");
    expect(new Headers(propertiesInit?.headers).get("authorization"))
      .toBe("Bearer short-lived-token");
  });

  it("requires HTTPS and complete client credentials", async () => {
    await expect(testApaleoSandboxConnection({ ...config, baseUrl: "http://api.test" }))
      .rejects.toThrow("must use HTTPS");
    await expect(testApaleoSandboxConnection({ ...config, clientSecret: "" }))
      .rejects.toThrow("client secret");
  });

  it("returns structured redacted identity errors", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async () =>
      new Response(JSON.stringify({ error: "invalid_client", error_description: "Access denied" }), { status: 401 }));
    const error = await testApaleoSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(ApaleoConnectionTestError);
    expect(error).toMatchObject({
      status: 401,
      detailCode: "invalid_client",
      message: "Access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.clientSecret);
  });

  it("rejects malformed token and property responses", async () => {
    const missingToken = vi.fn<ApaleoFetch>(async () => new Response("{}"));
    await expect(testApaleoSandboxConnection(config, missingToken))
      .rejects.toMatchObject({ detailCode: "apaleo_invalid_token_response" });

    const malformedProperties = vi.fn<ApaleoFetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-lived-token" })))
      .mockResolvedValueOnce(new Response("{}"));
    await expect(testApaleoSandboxConnection(config, malformedProperties))
      .rejects.toMatchObject({ detailCode: "apaleo_invalid_properties_response" });
  });
});
