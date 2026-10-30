import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    }),
  },
}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), createAdminClient: vi.fn(), from: vi.fn(), select: vi.fn(),
  insert: vi.fn(), order: vi.fn(), single: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET, POST } from "../app/api/admin/integrations/inventory/expedia-rapid/site-review/route";

function request(body: Record<string, unknown>) {
  return new Request("https://example.test/api/admin/integrations/inventory/expedia-rapid/site-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const receipt = {
  id: "receipt-1",
  requirement_code: "SP1",
  decision: "verified",
  evidence_reference: "tests/expedia-search-child-ages.test.ts",
  verification_notes: null,
  reviewed_at: "2026-10-30T18:20:00.000Z",
  deployment_revision: null,
};

describe("Expedia B2C site-review evidence route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T18:20:00.000Z"));
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.single.mockResolvedValue({ data: receipt, error: null });
    mocks.order.mockImplementation(() => ({ order: mocks.order }));
    mocks.select.mockImplementation(() => ({ order: mocks.order, single: mocks.single }));
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("records a verified requirement as an append-only receipt", async () => {
    const response = await POST(request({
      requirementCode: "SP1",
      decision: "verified",
      evidenceReference: "tests/expedia-search-child-ages.test.ts",
      verificationNotes: "",
      confirmation: "RECORD EXPEDIA SITE REVIEW EVIDENCE",
    }));

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      requirement_code: "SP1",
      decision: "verified",
      evidence_reference: "tests/expedia-search-child-ages.test.ts",
      verification_notes: null,
      reviewed_by: "admin-1",
      reviewed_at: "2026-10-30T18:20:00.000Z",
      deployment_revision: null,
    });
    expect(await response.json()).toEqual({ receipt });
  });

  it("rejects unknown requirement codes and missing evidence", async () => {
    const unknown = await POST(request({
      requirementCode: "ZZ9",
      decision: "verified",
      evidenceReference: "tests/example.test.ts",
      confirmation: "RECORD EXPEDIA SITE REVIEW EVIDENCE",
    }));
    expect(unknown.status).toBe(400);

    const missing = await POST(request({
      requirementCode: "SP1",
      decision: "verified",
      evidenceReference: "",
      confirmation: "RECORD EXPEDIA SITE REVIEW EVIDENCE",
    }));
    expect(missing.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns only the latest receipt for each requirement", async () => {
    const older = { ...receipt, id: "receipt-0", decision: "pending", reviewed_at: "2026-10-29T18:20:00.000Z" };
    const other = { ...receipt, id: "receipt-2", requirement_code: "BP7" };
    mocks.order.mockReturnValueOnce({ order: vi.fn().mockResolvedValue({ data: [receipt, older, other], error: null }) });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ receipts: [receipt, other] });
  });

  it("requires administrator access before reading or writing evidence", async () => {
    mocks.requireRole.mockResolvedValue({ error: "Access denied.", status: 403 });
    const getResponse = await GET();
    const postResponse = await POST(request({}));
    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
