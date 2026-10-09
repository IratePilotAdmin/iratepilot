import { beforeEach, describe, expect, it, vi } from "vitest";
import { readNativePmsBaselinePreview } from "../lib/native-pms-baseline-preview";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from "../app/api/admin/integrations/native-ari/baseline-preview/route";

const propertyId = "11111111-1111-4111-8111-111111111111";
const fromDate = "2026-09-23";
const preview = {
  fromDate,
  reservationCount: 2,
  outboxEventCount: 0,
  versionedReservationCount: 0,
  baselineExists: false,
  propertyReady: true,
  captureEnabled: false,
  deliveryEnabled: false,
  eligibleForCapture: true,
  reasonCodes: [],
};

function request(body: unknown, options: { origin?: string; url?: string; contentType?: string } = {}) {
  const url = options.url ?? "https://www.iratepilot.com/api/admin/integrations/native-ari/baseline-preview";
  return new Request(url, {
    method: "POST",
    headers: {
      Origin: options.origin ?? "https://www.iratepilot.com",
      "Content-Type": options.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("native PMS baseline preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "22222222-2222-4222-8222-222222222222" } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: preview, error: null });
  });

  it("returns only validated aggregate readiness and never runs the capture RPC", async () => {
    const response = await POST(request({ propertyId, fromDate }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ...preview,
      captureAvailable: false,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.rpc).toHaveBeenCalledWith("irp_pms_preview_reservation_baseline", {
      p_property: propertyId,
      p_from: fromDate,
    });
  });

  it("rejects cross-origin, extra, and malformed requests before reading hotel data", async () => {
    expect((await POST(request({ propertyId, fromDate }, { origin: "https://attacker.example" }))).status).toBe(403);
    expect((await POST(request({ propertyId, fromDate, guestId: "private" }))).status).toBe(400);
    expect((await POST(request({ propertyId, fromDate: "2026-02-30" }))).status).toBe(400);
    expect((await POST(request({ propertyId, fromDate, extra: "x".repeat(3000) }))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when database results do not match the requested cutover date", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...preview, fromDate: "2026-09-24" }, error: null });
    const response = await POST(request({ propertyId, fromDate }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Baseline readiness could not be verified. No reservations were changed." });
  });
});

describe("native PMS baseline preview contract", () => {
  it("rejects contradictory reason and eligibility fields", () => {
    expect(() => readNativePmsBaselinePreview({ ...preview, eligibleForCapture: false }, fromDate)).toThrow("inconsistent");
    expect(() => readNativePmsBaselinePreview({ ...preview, reasonCodes: ["private_table_name"] }, fromDate)).toThrow("did not match");
  });
});
