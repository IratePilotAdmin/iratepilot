import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDuffelPreviewTransportDependencies } from "../lib/flights/duffel/preview-ports.server";

describe("Duffel Preview response adapter", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://eiqmdldjnedqgbtoozqa.supabase.co";
    process.env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET = "a".repeat(64);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET;
  });

  it("snapshots native response headers into the exact owned header port", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": "2",
        "x-provider-private": "must-not-cross-the-port",
      },
    })));
    const dependencies = createDuffelPreviewTransportDependencies();
    const response = await dependencies.dispatcher.dispatch(Object.freeze({
      url: "https://api.duffel.com/air/offer_requests",
      method: "POST" as const,
      headers: Object.freeze({ Accept: "application/json" }),
      body: "{}",
      redirect: "error" as const,
      credentials: "omit" as const,
      cache: "no-store" as const,
      signal: new AbortController().signal,
    }));

    expect(Reflect.ownKeys(response.headers)).toEqual(["get"]);
    expect(Object.getPrototypeOf(response.headers)).toBe(Object.prototype);
    expect(Object.isFrozen(response.headers)).toBe(true);
    const getDescriptor = Object.getOwnPropertyDescriptor(response.headers, "get");
    expect(getDescriptor).toMatchObject({ enumerable: true });
    expect(getDescriptor).toHaveProperty("value");
    expect(getDescriptor).not.toHaveProperty("get");
    expect(getDescriptor).not.toHaveProperty("set");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("CONTENT-LENGTH")).toBe("2");
    expect(response.headers.get("x-provider-private")).toBeNull();
  });

  it("drops a compressed wire length after the runtime decompresses the response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "999",
      },
    })));
    const response = await createDuffelPreviewTransportDependencies().dispatcher.dispatch(Object.freeze({
      url: "https://api.duffel.com/air/offers/off_0000000000000001",
      method: "GET" as const,
      headers: Object.freeze({ Accept: "application/json" }),
      body: null,
      redirect: "error" as const,
      credentials: "omit" as const,
      cache: "no-store" as const,
      signal: new AbortController().signal,
    }));

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-length")).toBeNull();
  });
});
