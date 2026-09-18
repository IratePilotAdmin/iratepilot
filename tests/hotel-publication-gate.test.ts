import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isHotelPublicationEnabled } from "../lib/hotels/publication-gate";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/hotels/publication-gate", () => import("../lib/hotels/publication-gate"));
vi.mock("@/lib/property-readiness", () => import("../lib/property-readiness"));
import { PATCH } from "../app/api/admin/properties/[id]/route";

const listRoute = readFileSync(new URL("../app/api/admin/properties/route.ts", import.meta.url), "utf8");
const decisionRoute = readFileSync(new URL("../app/api/admin/properties/[id]/route.ts", import.meta.url), "utf8");
const reviewUi = readFileSync(new URL("../components/dashboard/admin-properties.tsx", import.meta.url), "utf8");
const propertyId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.HOTEL_PUBLICATION_ENABLED;
});

describe("hotel publication release gate", () => {
  it("defaults closed and accepts only an exact true value", () => {
    expect(isHotelPublicationEnabled({})).toBe(false);
    expect(isHotelPublicationEnabled({ HOTEL_PUBLICATION_ENABLED: "false" })).toBe(false);
    expect(isHotelPublicationEnabled({ HOTEL_PUBLICATION_ENABLED: "TRUE" })).toBe(false);
    expect(isHotelPublicationEnabled({ HOTEL_PUBLICATION_ENABLED: "true" })).toBe(true);
  });

  it("enforces the release gate in the server publication path", () => {
    expect(decisionRoute).toContain("if (!isHotelPublicationEnabled())");
    expect(decisionRoute).toContain("Hotel publication is locked until the production release gate is approved.");
    expect(decisionRoute.indexOf('requireRole(["admin"])'))
      .toBeLessThan(decisionRoute.indexOf("if (!isHotelPublicationEnabled())"));
    expect(decisionRoute.indexOf("if (!isHotelPublicationEnabled())"))
      .toBeLessThan(decisionRoute.indexOf('.update({ active: parsed.data.active })'));
  });

  it("rejects publication before property data is read when the gate is locked", async () => {
    const from = vi.fn();
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" }, supabase: { from } });
    const response = await PATCH(new Request("https://example.test/api/admin/properties/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Hotel publication is locked until the production release gate is approved.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps emergency pause available while publication is locked", async () => {
    const single = vi.fn(async () => ({ data: { id: propertyId, name: "Pilot Hotel", active: false }, error: null }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" }, supabase: { from: vi.fn(() => ({ update })) } });
    const response = await PATCH(new Request("https://example.test/api/admin/properties/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    }), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ active: false });
  });

  it("reports the lock to the admin queue and disables publication", () => {
    expect(listRoute).toContain("publicationEnabled: isHotelPublicationEnabled()");
    expect(reviewUi).toContain("Production publication is locked.");
    expect(reviewUi).toContain("Release locked");
    expect(reviewUi).toContain("property.readiness.ready && partnerApproved && publicationEnabled");
  });
});
