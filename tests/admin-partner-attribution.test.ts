import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), from: vi.fn(), applicationSelect: vi.fn(), order: vi.fn(),
  draftSelect: vi.fn(), inFilter: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/partner/acquisition", () => import("../lib/partner/acquisition"));

import { GET } from "../app/api/admin/partner-applications/route";

const application = {
  id: "10000000-0000-4000-8000-000000000001",
  property_name: "Harbor House", status: "pending", created_at: "2026-09-16T00:00:00Z",
};

describe("admin partner acquisition attribution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ supabase: { from: mocks.from } });
    mocks.from.mockImplementation((table: string) => table === "partner_applications"
      ? { select: mocks.applicationSelect }
      : { select: mocks.draftSelect });
    mocks.applicationSelect.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [application], error: null });
    mocks.draftSelect.mockReturnValue({ in: mocks.inFilter });
    mocks.inFilter.mockResolvedValue({
      data: [{
        application_id: application.id,
        registration: {
          propertyName: "Harbor House",
          attribution: { source: "facebook", medium: "paid-social", campaign: "hotel-partners" },
          phone: "+15555550100",
        },
      }],
      error: null,
    });
  });

  it("returns only validated campaign labels from the linked private draft", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.from).toHaveBeenNthCalledWith(1, "partner_applications");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "partner_onboarding_drafts");
    expect(mocks.inFilter).toHaveBeenCalledWith("application_id", [application.id]);
    const body = await response.json();
    expect(body.data[0].acquisition_attribution).toEqual({
      source: "facebook", medium: "paid-social", campaign: "hotel-partners",
    });
    expect(JSON.stringify(body)).not.toContain("+15555550100");
  });

  it("drops malformed attribution rather than returning arbitrary registration data", async () => {
    mocks.inFilter.mockResolvedValueOnce({
      data: [{ application_id: application.id, registration: { attribution: { source: "facebook", clickId: "private-id" } } }],
      error: null,
    });
    const response = await GET();
    expect((await response.json()).data[0].acquisition_attribution).toBeNull();
  });

  it("does not query drafts when the queue is empty", async () => {
    mocks.order.mockResolvedValueOnce({ data: [], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.draftSelect).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ data: [] });
  });
});
