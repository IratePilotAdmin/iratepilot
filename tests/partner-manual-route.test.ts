import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { GET } from "@/app/api/partner/manual/route";

describe("partner PMS manual download", () => {
  beforeEach(() => vi.mocked(requireRole).mockReset());

  it("requires an authenticated partner or administrator", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      error: "Authentication required.", status: 401,
    } as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("serves the pilot guide privately as a downloadable file", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ profile: { role: "partner" } } as never);

    const response = await GET();
    const manual = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("iRatePilot-PMS-Operating-Manual.md");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(manual).toContain("Status:** Pilot draft");
    expect(manual).toContain("Supervised pilot acceptance checklist");
  });
});
