import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/revenue-private-simulation", () => ({
  buildPrivateRevenueSimulation: () => ({ simulated: true, readOnly: true, inputRows: 60 }),
}));

import { requireRole } from "@/lib/auth/require-role";
import { GET } from "../app/api/revenue/private-simulation/route";

afterEach(() => vi.resetAllMocks());

describe("private revenue simulation endpoint", () => {
  it("denies callers without admin access", async () => {
    vi.mocked(requireRole).mockResolvedValue({ error: "Access denied", status: 403 } as never);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith(["admin"]);
  });

  it("serves a no-store synthetic response for an admin", async () => {
    vi.mocked(requireRole).mockResolvedValue({ profile: { role: "admin" } } as never);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toMatchObject({ simulated: true, readOnly: true, inputRows: 60 });
  });
});
