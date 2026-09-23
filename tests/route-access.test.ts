import { describe, expect, it } from "vitest";
import { isProtectedRoute, isPublicPartnerRoute } from "../lib/auth/route-access";

describe("route access", () => {
  it("keeps partner applications public", () => {
    expect(isPublicPartnerRoute("/partner/onboarding")).toBe(true);
    expect(isPublicPartnerRoute("/partner/onboarding/")).toBe(true);
    expect(isProtectedRoute("/partner/onboarding")).toBe(false);
  });

  it("protects partner operations and account administration", () => {
    expect(isProtectedRoute("/partner/dashboard")).toBe(true);
    expect(isProtectedRoute("/partner/properties")).toBe(true);
    expect(isProtectedRoute("/account")).toBe(true);
    expect(isProtectedRoute("/admin/properties")).toBe(true);
  });

  it("leaves public marketing routes open", () => {
    expect(isProtectedRoute("/partner")).toBe(false);
    expect(isProtectedRoute("/search")).toBe(false);
  });
});
