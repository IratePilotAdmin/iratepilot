import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  evaluateInventoryRateAccess,
  InventoryRateAccessError,
  requireInventoryRateAccess,
} from "../services/hotel-suppliers/inventory-rate-access.server";

describe("inventory supplier rate access", () => {
  it("blocks Stuba prices when no authenticated customer is present", () => {
    expect(evaluateInventoryRateAccess({ supplierId: "stuba" })).toEqual({
      allowed: false,
      supplierId: "stuba",
      reason: "authentication_required",
    });
  });

  it("rejects client-like or malformed identity values", () => {
    for (const authenticatedCustomerId of ["authenticated", "customer-123", " "]) {
      expect(evaluateInventoryRateAccess({
        supplierId: "stuba",
        authenticatedCustomerId,
      })).toMatchObject({ allowed: false, reason: "authentication_required" });
    }
  });

  it("permits Stuba price presentation only for a server-verified customer id", () => {
    expect(evaluateInventoryRateAccess({
      supplierId: "stuba",
      authenticatedCustomerId: "6148efda-d120-4428-8437-5b65a7f9d9e6",
    })).toEqual({
      allowed: true,
      supplierId: "stuba",
      audience: "authenticated_customer",
    });
  });

  it("fails closed for suppliers whose distribution terms are not recorded", () => {
    for (const supplierId of ["hotelbeds", "ratehawk", "expedia-rapid"] as const) {
      expect(evaluateInventoryRateAccess({
        supplierId,
        authenticatedCustomerId: "6148efda-d120-4428-8437-5b65a7f9d9e6",
      })).toEqual({
        allowed: false,
        supplierId,
        reason: "supplier_terms_unverified",
      });
    }
  });

  it("throws a typed error before a blocked price can be presented", () => {
    expect(() => requireInventoryRateAccess({ supplierId: "stuba" }))
      .toThrowError(InventoryRateAccessError);

    try {
      requireInventoryRateAccess({ supplierId: "hotelbeds" });
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryRateAccessError);
      expect((error as InventoryRateAccessError).code).toBe("supplier_terms_unverified");
    }
  });
});
