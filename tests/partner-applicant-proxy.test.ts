import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(), getConfig: vi.fn(), getUser: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: mocks.getConfig }));
vi.mock("@/config/partner-acquisition", () => import("../config/partner-acquisition"));

import { proxy } from "../proxy";

const origin = "https://www.iratepilot.com";
const userId = "11111111-1111-4111-8111-111111111111";
const request = (path: string) => new NextRequest(`${origin}${path}`);

describe("restricted customer access to the partner applicant dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "true");
    mocks.getConfig.mockReturnValue({ url: "https://project.example.test", key: "public-anon-key" });
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { role: "customer" }, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("allows only the exact applicant dashboard for an authenticated customer when enabled", async () => {
    const response = await proxy(request("/partner/dashboard?setup=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
  });

  it.each([undefined, "false", "TRUE", "1"])("denies the customer dashboard when flag is %s", async (flag) => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", flag);
    const response = await proxy(request("/partner/dashboard?setup=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/partner`);
  });

  it.each([
    "/partner/properties", "/partner/rates", "/partner/payouts", "/partner/finance",
    "/partner/connect", "/partner/reservations", "/partner/dashboard/private",
    "/partner/dashboard/", "/partner/dashboard-other",
  ])("keeps customer operational route %s denied even with setup query", async (path) => {
    const response = await proxy(request(`${path}?setup=1`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/partner`);
  });

  it.each(["/admin", "/admin/finance", "/admin/partners"])("keeps customers out of %s", async (path) => {
    const response = await proxy(request(path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/account`);
  });

  it("preserves the intended applicant URL including query parameters after login", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const destination = "/partner/dashboard?setup=1&utm_source=facebook";
    const response = await proxy(request(destination));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(307);
    expect(location.origin).toBe(origin);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(destination);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["/partner/dashboard", "/partner/properties", "/partner/rates", "/partner/payouts"])("preserves partner access to %s with the applicant gate disabled", async (path) => {
    vi.stubEnv("PARTNER_SELF_SERVICE_ONBOARDING_ENABLED", "false");
    mocks.single.mockResolvedValueOnce({ data: { role: "partner" }, error: null });
    const response = await proxy(request(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/admin/partners", "/partner/dashboard"])("preserves admin access to %s", async (path) => {
    mocks.single.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
    expect((await proxy(request(path))).status).toBe(200);
  });

  it("does not let missing or unrecognized profile roles use the applicant exception", async () => {
    for (const data of [null, { role: "unknown" }]) {
      mocks.single.mockResolvedValueOnce({ data, error: null });
      const response = await proxy(request("/partner/dashboard?setup=1"));
      expect(response.headers.get("location")).toBe(`${origin}/partner`);
    }
  });

  it("leaves public recruitment pages public and makes no session query", async () => {
    for (const path of ["/partners", "/partners/register", "/partner"]) {
      expect((await proxy(request(path))).status).toBe(200);
    }
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("keeps protected pages closed when public Supabase configuration is missing", async () => {
    mocks.getConfig.mockReturnValueOnce({ url: undefined, key: undefined });
    const response = await proxy(request("/partner/dashboard"));
    expect(response.headers.get("location")).toBe(`${origin}/login?reason=configuration`);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
