import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  buildExpediaRapidAuthorization,
  buildHotelbedsAuthHeaders,
  buildRatehawkAuthorization,
} from "../services/hotel-suppliers/inventory-auth.server";

describe("inventory supplier authentication", () => {
  it("builds the documented Hotelbeds SHA-256 signature deterministically", () => {
    expect(buildHotelbedsAuthHeaders({
      apiKey: "123",
      secret: "123",
      timestampSeconds: 1_700_000_000,
    })).toEqual({
      "Api-key": "123",
      "X-Signature": "bea8336c6fa617e5084b51f415ea61131afcf782a245a17f7f2e2d6f58f7d7fe",
    });
  });

  it("builds the documented RateHawk Basic authorization value", () => {
    expect(buildRatehawkAuthorization({
      keyId: "key-id",
      apiKey: "api-key-secret",
    })).toBe("Basic a2V5LWlkOmFwaS1rZXktc2VjcmV0");
  });

  it("builds the documented Expedia Rapid SHA-512 authorization value", () => {
    expect(buildExpediaRapidAuthorization({
      apiKey: "123",
      sharedSecret: "123",
      timestampSeconds: 1_700_000_000,
    })).toBe("EAN APIKey=123,Signature=15fab65e201f6f4ee693f0b4d5de909d0e88fc96cdc3a222493b9edcfee0a0f1507c1e9ba129472d21b1e467e7ee05b02b6cb99dbde85cf60a88207de309ce53,timestamp=1700000000");
  });

  it.each([
    () => buildHotelbedsAuthHeaders({ apiKey: "key\r\nInjected: yes", secret: "secret", timestampSeconds: 1 }),
    () => buildRatehawkAuthorization({ keyId: "bad:id", apiKey: "secret" }),
    () => buildExpediaRapidAuthorization({ apiKey: "key", sharedSecret: "", timestampSeconds: 1 }),
    () => buildExpediaRapidAuthorization({ apiKey: "key", sharedSecret: "secret", timestampSeconds: 0 }),
  ])("rejects invalid authentication input without echoing credentials", (build) => {
    expect(build).toThrow("Supplier authentication");
    try {
      build();
    } catch (error) {
      expect(String(error)).not.toContain("Injected");
      expect(String(error)).not.toContain("bad:id");
    }
  });
});
