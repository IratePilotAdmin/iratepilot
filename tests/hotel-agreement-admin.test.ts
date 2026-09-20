import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.auth }));
import { POST } from "../app/api/admin/hotel-agreements/route";

const routeSource = readFileSync(new URL("../app/api/admin/hotel-agreements/route.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../components/dashboard/admin-hotel-agreements.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

const validVersion = {
  action: "record_version",
  agreementVersion: "hotel_agreement_2026_v1",
  templateDocumentSha256: "a".repeat(64),
  counselApprovalReference: "COUNSEL-2026-001",
  counselApprovedAt: "2026-09-18T12:00:00.000Z",
  effectiveAt: "2026-09-18T13:00:00.000Z",
  reviewNotes: "Outside counsel approved the exact final template.",
  counselApprovalConfirmed: true,
};

beforeEach(() => vi.resetAllMocks());

describe("hotel agreement administration", () => {
  it("requires admin authentication before validating submitted evidence", async () => {
    mocks.auth.mockResolvedValue({ error: "Authentication required.", status: 401 });
    const response = await POST(new Request("https://example.test/api/admin/hotel-agreements", {
      method: "POST",
      body: "{}",
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("rejects a version record without explicit counsel confirmation", async () => {
    const rpc = vi.fn();
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" }, supabase: { rpc } });
    const response = await POST(new Request("https://example.test/api/admin/hotel-agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validVersion, counselApprovalConfirmed: false }),
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records a confirmed counsel-approved version through the guarded database procedure", async () => {
    const rpc = vi.fn(async () => ({ data: { agreement_version: validVersion.agreementVersion }, error: null }));
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" }, supabase: { rpc } });
    const response = await POST(new Request("https://example.test/api/admin/hotel-agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVersion),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_counsel_approved_hotel_commercial_agreement_version", {
      p_agreement_version: "hotel_agreement_2026_v1",
      p_template_document_sha256: "a".repeat(64),
      p_counsel_approval_reference: "COUNSEL-2026-001",
      p_counsel_approved_at: "2026-09-18T12:00:00.000Z",
      p_effective_at: "2026-09-18T13:00:00.000Z",
      p_review_notes: "Outside counsel approved the exact final template.",
    });
  });

  it("keeps receipt recording behind effective-version and dual-verification gates", () => {
    expect(routeSource).toContain("list_available_counsel_approved_hotel_commercial_agreement_versions");
    expect(routeSource).toContain("representativeAuthorityVerified: z.literal(true)");
    expect(routeSource).toContain("executedAgreementVerified: z.literal(true)");
    expect(routeSource).toContain("record_hotel_commercial_agreement_receipt");
    expect(uiSource).toContain("Locked until a counsel-approved agreement version is effective.");
    expect(uiSource).toContain("both parties signed the exact document");
    expect(navigationSource).toContain('{ href: "/admin/agreements", label: "Hotel agreements" }');
  });
});
