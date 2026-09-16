import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-readiness", () => import("../lib/property-readiness"));
vi.mock("@/lib/partner/onboarding", () => import("../lib/partner/onboarding"));
vi.mock("@/lib/partner/hotel-access", async () => ({
  ...await import("../lib/partner/hotel-access"),
  resolvePartnerHotelAccess: mocks.resolve,
}));
import { GET } from "../app/api/partner/onboarding/route";

const partner = { id: "partner-a", business_name: "Test", status: "approved", stripe_connect_status: "pending", software_plan: "starter", subscription_status: "inactive" };
function client() {
  const filters: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((...args: unknown[]) => { filters.push([table, ...args]); return query; }),
      maybeSingle: vi.fn(async () => ({ data: partner, error: null })),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    return query;
  });
  return { from, filters };
}
const request = () => new Request("https://example.test/api/partner/onboarding");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockImplementation(() => { throw new Error("No privileged credential"); });
  mocks.resolve.mockResolvedValue({ access: { partnerId: partner.id, partnerName: "Test", role: "owner" }, options: [], selectionRequired: false, migrationRequired: false });
});
describe("onboarding read access", () => {
  it("loads owner checklist without a privileged credential and scopes property reads", async () => {
    const db = client();
    mocks.auth.mockResolvedValue({ user: { id: "owner-a" }, profile: { role: "partner" }, supabase: db });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).businessName).toBe("Test");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(db.filters).toContainEqual(["partners", "owner_id", "owner-a"]);
    expect(db.filters).toContainEqual(["properties", "partner_id", partner.id]);
  });
  it("keeps delegated reads on the existing resolved-access path", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "manager-a" }, profile: { role: "partner" }, supabase: client() });
    mocks.resolve.mockResolvedValue({ access: { partnerId: partner.id, partnerName: "Test", role: "general_manager" }, options: [], selectionRequired: false, migrationRequired: false });
    const privileged = client();
    mocks.admin.mockReturnValue(privileged);
    expect((await GET(request())).status).toBe(200);
    expect(privileged.filters).toContainEqual(["partners", "id", partner.id]);
    expect(privileged.filters).toContainEqual(["properties", "partner_id", partner.id]);
  });
  it("denies unresolved access before reading checklist data", async () => {
    const db = client();
    mocks.auth.mockResolvedValue({ user: { id: "other" }, profile: { role: "partner" }, supabase: db });
    mocks.resolve.mockResolvedValue({ access: null, options: [], selectionRequired: false, migrationRequired: false });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalledWith("properties");
  });
  it("rejects unauthenticated requests before any database reads", async () => {
    mocks.auth.mockResolvedValue({ error: "Sign in", status: 401 });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
