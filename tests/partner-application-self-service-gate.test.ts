import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), from: vi.fn(), insert: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/validation", () => import("../lib/validation"));
vi.mock("@/config/partner-acquisition", () => import("../config/partner-acquisition"));

import { POST } from "../app/api/partners/apply/route";

const validIntake = {
  propertyName: "  Harbor House Hotel  ", propertyType: "hotel", starRating: "4",
  contactName: "Alex Rivera", contactRole: "general_manager", email: "MANAGER@HARBOR.EXAMPLE",
  phone: "+1 312 555 0142", websiteUrl: "https://harbor.example", addressLine1: "100 Lake Street",
  city: "Chicago", region: "Illinois", postalCode: "60601", country: "United States",
  description: "Harbor House Hotel is a waterfront property offering premium guest rooms, attentive service, meeting space, dining, and convenient access to the city center.",
  amenities: "Pool, Fitness center", photoSourceUrl: "https://harbor.example/media",
  hotelAuthorized: true, contentRightsConfirmed: true, informationAccurate: true,
};

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://www.iratepilot.com/api/partners/apply", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body,
  });
}

describe("legacy partner intake during self-service rollout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "true");
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([JSON.stringify(validIntake), "{malformed"])("retires anonymous submission before reading input or creating an admin client", async (body) => {
    const input = request(body, { "content-length": "50000" });
    const response = await POST(input);

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Sign in to save and submit your hotel application.",
      registrationPath: "/partners/register",
    });
    expect(input.bodyUsed).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, "false"])("preserves valid legacy intake when the new gate is %s", async (flag) => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", flag);
    const response = await POST(request(JSON.stringify(validIntake)));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "received" });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("partner_applications");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      property_name: "Harbor House Hotel", email: "manager@harbor.example",
      star_rating: 4, status: "pending", hotel_authorized: true,
    }));
  });

  it.each([
    ["hotel_owner", "owner"],
    ["general_manager", "general_manager"],
    ["revenue_manager", "revenue_manager"],
    ["sales_manager", "sales_manager"],
    ["authorized_representative", "authorized_representative"],
  ])("stores legacy role %s using the canonical intake role %s", async (contactRole, storedRole) => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "false");
    const response = await POST(request(JSON.stringify({ ...validIntake, contactRole })));
    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ contact_role: storedRole }));
  });

  it("preserves the flag-off duplicate response without exposing existing records", async () => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "false");
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505", message: "private duplicate details" } });
    const response = await POST(request(JSON.stringify(validIntake)));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "received" });
  });

  it("preserves flag-off validation before privileged writes", async () => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "false");
    expect((await POST(request(JSON.stringify({ ...validIntake, hotelAuthorized: false })))).status).toBe(400);
    expect((await POST(request(JSON.stringify(validIntake), { "content-length": "25001" }))).status).toBe(413);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("preserves a generic flag-off failure if legacy storage is unavailable", async () => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "false");
    mocks.insert.mockResolvedValueOnce({ error: { code: "XX000", message: "private database diagnostic" } });
    const response = await POST(request(JSON.stringify(validIntake)));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Partner applications are not configured yet." });
  });
});
