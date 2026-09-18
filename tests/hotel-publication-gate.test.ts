import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isHotelPublicationEnabled } from "../lib/hotels/publication-gate";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/hotels/publication-gate", () => import("../lib/hotels/publication-gate"));
vi.mock("@/lib/property-readiness", () => import("../lib/property-readiness"));
import { PATCH } from "../app/api/admin/properties/[id]/route";
import { GET } from "../app/api/admin/properties/route";

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
      .toBeLessThan(decisionRoute.indexOf('rpc("set_property_publication_state"'));
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
    const rpc = vi.fn(async () => ({ data: { id: propertyId, name: "Pilot Hotel", active: false }, error: null }));
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" }, supabase: { rpc } });
    const response = await PATCH(new Request("https://example.test/api/admin/properties/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    }), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_property_publication_state", {
      p_property_id: propertyId,
      p_active: false,
    });
  });

  it("uses the database commercial-release procedure when publication is enabled", async () => {
    process.env.HOTEL_PUBLICATION_ENABLED = "true";
    const maybeSingle = vi.fn(async () => ({
      data: {
        image_url: "https://images.example.test/hotel.jpg",
        amenities: ["Pool"],
        partners: { status: "approved" },
        rooms: [{ active: true, inventory: [{ stay_date: "2099-01-01", available_units: 2 }] }],
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const rpc = vi.fn(async () => ({
      data: { id: propertyId, name: "Pilot Hotel", active: true },
      error: null,
    }));
    mocks.auth.mockResolvedValue({
      user: { id: "admin-a" },
      profile: { role: "admin" },
      supabase: { from: vi.fn(() => ({ select })), rpc },
    });

    const response = await PATCH(new Request("https://example.test/api/admin/properties/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_property_publication_state", {
      p_property_id: propertyId,
      p_active: true,
    });
  });

  it("returns a conflict when the database rejects missing agreement evidence", async () => {
    process.env.HOTEL_PUBLICATION_ENABLED = "true";
    const maybeSingle = vi.fn(async () => ({
      data: {
        image_url: "https://images.example.test/hotel.jpg",
        amenities: ["Pool"],
        partners: { status: "approved" },
        rooms: [{ active: true, inventory: [{ stay_date: "2099-01-01", available_units: 2 }] }],
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An effective executed hotel commercial agreement and matching commercial review are required before publication" },
    }));
    mocks.auth.mockResolvedValue({
      user: { id: "admin-a" },
      profile: { role: "admin" },
      supabase: { from: vi.fn(() => ({ select })), rpc },
    });

    const response = await PATCH(new Request("https://example.test/api/admin/properties/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "An effective executed hotel commercial agreement and matching commercial review are required before publication",
    });
  });

  it("keeps the property queue available when commercial schema checks are unavailable", async () => {
    const property = {
      id: propertyId,
      name: "Pilot Hotel",
      slug: "pilot-hotel",
      type: "hotel",
      star_rating: 4,
      city: "Navarre",
      country: "US",
      active: false,
      image_url: null,
      amenities: [],
      created_at: "2026-09-18T00:00:00.000Z",
      partners: { business_name: "Pilot Partner", status: "approved" },
      rooms: [],
    };
    const from = vi.fn()
      .mockImplementationOnce(() => ({
        select: vi.fn(() => ({ order: vi.fn(async () => ({ data: [property], error: null })) })),
      }))
      .mockImplementationOnce(() => ({
        select: vi.fn(() => ({ in: vi.fn(async () => ({ data: null, error: { message: "missing columns" } })) })),
      }));
    const rpc = vi.fn(async () => ({ data: null, error: { message: "missing function" } }));
    mocks.auth.mockResolvedValue({
      user: { id: "admin-a" },
      profile: { role: "admin" },
      supabase: { from, rpc },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].commercialRelease).toEqual({
      stateAvailable: false,
      agreementEffective: false,
      reviewComplete: false,
    });
  });

  it("reports both global and property-specific release locks", () => {
    expect(listRoute).toContain("publicationEnabled: isHotelPublicationEnabled()");
    expect(listRoute).toContain('rpc(\n        "get_hotel_commercial_agreement_admin_state"');
    expect(reviewUi).toContain("Production publication is locked.");
    expect(reviewUi).toContain("Release locked");
    expect(reviewUi).toContain("commercialReady && publicationEnabled");
    expect(reviewUi).toContain("a currently effective, executed hotel agreement is required");
    expect(reviewUi).toContain("complete the accountable commercial review");
  });
});
