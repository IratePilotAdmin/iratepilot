import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRequestClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/partner/acquisition-api", () => import("../lib/partner/acquisition-api"));
vi.mock("@/lib/partner/acquisition", () => import("../lib/partner/acquisition"));
vi.mock("@/config/partner-acquisition", () => import("../config/partner-acquisition"));
vi.mock("@/lib/supabase/request", () => ({ createRequestClient: mocks.createRequestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { POST as register } from "../app/api/partner/registration/route";
import { GET as listDrafts } from "../app/api/partner/onboarding-drafts/route";
import { PATCH as saveDraft } from "../app/api/partner/onboarding-drafts/[id]/route";
import { POST as submitDraft } from "../app/api/partner/onboarding-drafts/[id]/submit/route";

const origin = "https://www.iratepilot.com";
const ownerId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const registrationKey = "33333333-3333-4333-8333-333333333333";
const registration = {
  propertyName: "Example Hotel", firstName: "Hiren", lastName: "Patel",
  phone: "+16144396660", countryCode: "US", region: "FL", propertyType: "hotel",
  roomCount: 30, continueOnboarding: true,
};
const registrationBody = { registrationKey, registration };
const user = { id: ownerId, email: "OWNER@EXAMPLE.TEST", email_confirmed_at: "2026-09-01T00:00:00Z" };

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId, registration_key: registrationKey, registration, details: {},
    revision: 1, status: "draft", application_id: null,
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    submitted_at: null, ...overrides,
  };
}

function mutation(path: string, body: unknown, options: {
  method?: string; origin?: string | null; headers?: Record<string, string>; rawBody?: BodyInit;
} = {}) {
  const headers = new Headers({ "Content-Type": "application/json", ...options.headers });
  if (options.origin !== null) headers.set("origin", options.origin ?? origin);
  return new Request(`${origin}${path}`, {
    method: options.method ?? "POST", headers,
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function params(id = draftId) { return { params: Promise.resolve({ id }) }; }

const operations = [
  ["registration", () => register(mutation("/api/partner/registration", registrationBody))],
  ["list", () => listDrafts(new Request(`${origin}/api/partner/onboarding-drafts`))],
  ["save", () => saveDraft(mutation(`/api/partner/onboarding-drafts/${draftId}`, { revision: 1, details: {} }, { method: "PATCH" }), params())],
  ["submit", () => submitDraft(mutation(`/api/partner/onboarding-drafts/${draftId}/submit`, { revision: 1 }), params())],
] as const;

describe("partner applicant API boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "true");
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.createRequestClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from });
    mocks.createAdminClient.mockImplementation(() => { throw new Error("Service role must never serve applicant routes"); });
    mocks.rpc.mockResolvedValue({ data: draft(), error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({ data: [draft()], error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(operations)("keeps %s closed by default before auth or database access", async (_name, operation) => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", undefined);
    const response = await operation();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createRequestClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { origin: null },
    { origin: "https://attacker.example" },
    { headers: { "sec-fetch-site": "cross-site" } },
  ])("rejects missing or cross-site mutation origin before auth: %j", async (options) => {
    const response = await register(mutation("/api/partner/registration", registrationBody, options));
    expect(response.status).toBe(403);
    expect(mocks.createRequestClient).not.toHaveBeenCalled();
  });

  it.each(operations)("requires an authenticated account for %s", async (_name, operation) => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await operation()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { ...user, email_confirmed_at: null },
    { ...user, email: null },
  ])("requires a confirmed account email: %j", async (unconfirmed) => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: unconfirmed }, error: null });
    expect((await register(mutation("/api/partner/registration", registrationBody))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats authentication errors as unauthenticated even if a user object is returned", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user }, error: { message: "expired session" } });
    expect((await register(mutation("/api/partner/registration", registrationBody))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["role", "owner_id", "email", "password"])("rejects injected %s at either registration boundary", async (key) => {
    for (const body of [
      { ...registrationBody, [key]: "attacker-controlled" },
      { ...registrationBody, registration: { ...registration, [key]: "attacker-controlled" } },
    ]) {
      expect((await register(mutation("/api/partner/registration", body))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("bounds streamed UTF-8 bytes without trusting Content-Length", async () => {
    const request = mutation("/api/partner/registration", undefined, {
      rawBody: JSON.stringify({ padding: "é".repeat(16_001) }),
    });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await register(request)).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ rawBody: "{broken" }, 400],
    [{ rawBody: new Uint8Array([0xc3, 0x28]) }, 400],
  ] as const)("rejects unreadable or unsupported request data", async (options, status) => {
    expect((await register(mutation("/api/partner/registration", registrationBody, options))).status).toBe(status);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes the registration idempotency key using the caller's request client and no supplied identity", async () => {
    const request = mutation("/api/partner/registration", registrationBody);
    const response = await register(request);
    expect(response.status).toBe(201);
    expect(mocks.createRequestClient).toHaveBeenCalledWith(request);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_partner_onboarding_draft", {
      p_registration_key: registrationKey, p_registration: registration,
    });
    expect(await response.json()).toEqual({ draft: draft() });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("lists only drafts belonging to the authenticated owner and bounds results", async () => {
    const response = await listDrafts(new Request(`${origin}/api/partner/onboarding-drafts?owner_id=someone-else`));
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("partner_onboarding_drafts");
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("owner_id", ownerId);
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(50);
    expect(await response.json()).toEqual({ drafts: [draft()], email: "owner@example.test" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("passes the draft id and expected revision atomically for saving and submission", async () => {
    const details = { city: "Pensacola", starRating: 4 };
    expect((await saveDraft(mutation(`/api/partner/onboarding-drafts/${draftId}`, { revision: 7, details }, { method: "PATCH" }), params())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "save_partner_onboarding_draft", {
      p_draft_id: draftId, p_expected_revision: 7, p_details: details,
    });
    expect((await submitDraft(mutation(`/api/partner/onboarding-drafts/${draftId}/submit`, { revision: 8 }), params())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "submit_partner_onboarding_draft", {
      p_draft_id: draftId, p_expected_revision: 8,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid ids, revisions, privilege fields and unsupported star ratings before RPC", async () => {
    const path = `/api/partner/onboarding-drafts/${draftId}`;
    const invalidSaves = [
      { revision: 0, details: {} }, { revision: 1.5, details: {} },
      { revision: 1, details: { starRating: 3 } },
      { revision: 1, details: { owner_id: ownerId } },
      { revision: 1, details: { status: "approved" } },
      { revision: 1, details: { email: "changed@example.test" } },
    ];
    for (const body of invalidSaves) {
      expect((await saveDraft(mutation(path, body, { method: "PATCH" }), params())).status).toBe(400);
    }
    expect((await saveDraft(mutation(path, { revision: 1, details: {} }, { method: "PATCH" }), params("not-a-uuid"))).status).toBe(400);
    expect((await submitDraft(mutation(`${path}/submit`, { revision: 1, owner_id: ownerId }), params())).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PT409", 409], ["40001", 409], ["23505", 409], ["42501", 403], ["P0002", 404], ["22023", 400], ["54000", 429],
  ])("maps database code %s to a safe %s response", async (code, status) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "private SQL and caller details" } });
    const response = await submitDraft(mutation(`/api/partner/onboarding-drafts/${draftId}/submit`, { revision: 1 }), params());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private SQL");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns generic 503 for unexpected RPC failure or invalid database receipts", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("secret database failure") });
    const failed = await register(mutation("/api/partner/registration", registrationBody));
    mocks.rpc.mockResolvedValueOnce({ data: { secret: "malformed receipt" }, error: null });
    const malformed = await register(mutation("/api/partner/registration", registrationBody));
    for (const response of [failed, malformed]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Hotel setup is temporarily unavailable. Your previously saved details are retained." });
    }
  });
});
