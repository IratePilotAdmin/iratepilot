import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "admin-id" }, profile: { role: "admin" } } as unknown,
  results: [] as Array<{ data?: unknown; count?: number | null; error?: { code?: string } | null }>,
  adminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn(async () => mocks.auth) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient() }));

import { requireRole } from "@/lib/auth/require-role";
import { GET } from "@/app/api/admin/integrations/ota/inbox/route";

function setupQueries() {
  let index = 0;
  mocks.adminClient.mockReturnValue({
    from: () => {
      const result = mocks.results[index++];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "eq"]) query[method] = () => query;
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return query;
    },
  });
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({ user: { id: "admin-id" }, profile: { role: "admin" } } as never);
  mocks.results = [];
  mocks.adminClient.mockReset();
});

describe("admin OTA inbox status", () => {
  it("requires an administrator", async () => {
    vi.mocked(requireRole).mockResolvedValue({ error: "Forbidden", status: 403 } as never);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("returns counts and safe operational fields without guest or payload data", async () => {
    mocks.results = [
      { data: [{ id: "event-id", connection_id: "connection", property_id: "property-id", event_kind: "new", status: "review", received_at: "2026-09-30T12:00:00Z", attempt_count: 2, result_code: "payment_treatment_required", pii_ciphertext: "secret", guest_name: "Guest" }], error: null },
      ...[2, 1, 10, 3].map((count) => ({ count, error: null })),
    ];
    setupQueries();

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      available: true,
      provider: "booking_com",
      totals: { received: 2, leased: 1, imported: 10, review: 3 },
      recent: [{ eventKind: "new", status: "review", attempts: 2, resultCode: "payment_treatment_required" }],
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("Guest");
  });

  it("reports an uninstalled hosted schema as unavailable without exposing database errors", async () => {
    mocks.results = [{ data: null, error: { code: "42P01" } }];
    setupQueries();

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: "migration_not_installed" });
  });
});
