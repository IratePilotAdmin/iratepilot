import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: mocks.getConfig }));

import { proxy } from "../proxy";
import { previewUsesLivePmsDatabase } from "../lib/supabase/preview-isolation";

const request = (path: string) => new NextRequest(`https://iratepilotadmin-git-test.vercel.app${path}`);
const livePms = "https://eiqmdldjnedqgbtoozqa.supabase.co";

afterEach(() => vi.unstubAllEnvs());

describe("OTA Preview database isolation", () => {
  it.each(["/login", "/admin/settings", "/api/cron/native-pms-reservations"])("blocks %s before it can access the live PMS project", async (path) => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", livePms);
    const response = await proxy(request(path));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("allows Preview traffic when it is bound to the isolated test project", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://onbdizzwwubfdgkgaphx.supabase.co");
    expect((await proxy(request("/login"))).status).toBe(200);
  });

  it("does not alter Production routing and ignores lookalike hosts", () => {
    expect(previewUsesLivePmsDatabase("production", livePms)).toBe(false);
    expect(previewUsesLivePmsDatabase("preview", "https://eiqmdldjnedqgbtoozqa.supabase.co.attacker.test")).toBe(false);
    expect(previewUsesLivePmsDatabase("preview", `${livePms}/`)).toBe(true);
  });
});
