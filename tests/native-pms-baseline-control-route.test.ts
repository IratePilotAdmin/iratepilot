import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), rpc: vi.fn(), createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
import { POST } from "../app/api/admin/integrations/native-ari/baseline-control/route";

const actor = "11111111-1111-4111-8111-111111111111";
const property = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const fromDate = "2026-10-01";
const preview = { fromDate, reservationCount: 2, outboxEventCount: 0, versionedReservationCount: 0, baselineExists: false, propertyReady: true, captureEnabled: false, deliveryEnabled: false, eligibleForCapture: true, reasonCodes: [] };
const captureBody = { requestId, propertyId: property, fromDate, expectedCount: 2, operation: "capture", evidenceReference: "maintenance-window-2026", confirmation: `CAPTURE BASELINE ${property}` };
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.iratepilot.com/api/admin/integrations/native-ari/baseline-control", { method: "POST", headers: { Origin: "https://www.iratepilot.com", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("native PMS baseline control route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: actor } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockImplementation(async (name: string) => name === "irp_pms_preview_reservation_baseline" ? { data: preview, error: null } : { data: { ok: true }, error: null });
  });

  it("requires same-origin admin confirmation, rechecks counts, then calls only sandbox review RPC", async () => {
    const response = await POST(req(captureBody));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "irp_pms_preview_reservation_baseline", { p_property: property, p_from: fromDate });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "irp_pms_capture_reviewed_baseline", {
      p_request: requestId, p_actor: actor, p_property: property, p_from: fromDate,
      p_expected_count: 2, p_evidence_reference: captureBody.evidenceReference,
    });
  });

  it("fails before mutation when preview eligibility or count changed", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...preview, reservationCount: 3 }, error: null });
    const response = await POST(req(captureBody));
    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin, unauthenticated, malformed, and unconfirmed requests", async () => {
    expect((await POST(req(captureBody, { Origin: "https://attacker.example" }))).status).toBe(403);
    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    expect((await POST(req(captureBody))).status).toBe(401);
    expect((await POST(req({ ...captureBody, expectedCount: 1001 }))).status).toBe(400);
    expect((await POST(req({ ...captureBody, confirmation: "yes" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates round-trip releases with a separate request and reference", async () => {
    const body = { ...captureBody, operation: "release", requestId: "55555555-5555-4555-8555-555555555555", evidenceReference: "sandbox-roundtrip-42", confirmation: `RELEASE SANDBOX DELIVERY ${property}` };
    const response = await POST(req(body));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("irp_pms_release_reviewed_baseline", expect.objectContaining({ p_actor: actor, p_evidence_reference: body.evidenceReference }));
  });
});
