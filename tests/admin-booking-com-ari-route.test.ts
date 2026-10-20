import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as Array<{ data?: unknown; count?: number | null; error?: { code?: string } | null }>,
  adminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient() }));

import { requireRole } from "@/lib/auth/require-role";
import { GET } from "@/app/api/admin/integrations/booking-com/ari/route";

function setupQueries() {
  let index = 0;
  mocks.adminClient.mockReturnValue({
    from: () => {
      const result = mocks.results[index++];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "eq", "in", "lte"]) query[method] = () => query;
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return query;
    },
  });
}

beforeEach(() => {
  vi.stubEnv("IRP_BOOKING_COM_ARI_SYNC_ENABLED", "false");
  vi.mocked(requireRole).mockResolvedValue({ user: { id: "admin-id" }, profile: { role: "admin" } } as never);
  mocks.results = [];
  mocks.adminClient.mockReset();
});

describe("Booking.com test ARI monitoring", () => {
  it("blocks non-admin users before creating a privileged client", async () => {
    vi.mocked(requireRole).mockResolvedValue({ error: "Forbidden", status: 403 } as never);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("reports queue and approval state without returning XML, provider messages, or credentials", async () => {
    mocks.results = [
      { data: [{ connection_id: "booking-synthetic", environment: "test", enabled: false,
        partner_approved: false, ari_endpoint_approved: false, certification_complete: false,
        credentials_ciphertext: "private-credential" }], error: null },
      { data: [{ id: "job-1", connection_id: "booking-synthetic", sync_id: "sync-1", request_index: 0,
        request_kind: "availability", status: "review", attempt_count: 2, created_at: "2026-10-20T00:00:00Z",
        available_at: "2026-10-20T00:00:00Z", lease_expires_at: null, last_http_status: 400,
        request_xml: "<Guest>Private Guest</Guest>", last_result: { message: "Private Guest" } }], error: null },
      ...[3, 1, 1, 2, 1, 4, 1].map((count) => ({ count, error: null })),
    ];
    setupQueries();
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      available: true,
      workerEnabled: false,
      totals: { queued: 3, retry: 1, processing: 1, sent: 2, review: 1 },
      due: 4, expiredLeases: 1,
      connections: [{ connectionId: "booking-synthetic", enabled: false, endpointApproved: false }],
      recent: [{ jobId: "job-1", state: "review", attempts: 2, httpStatus: 400 }],
    });
    expect(JSON.stringify(body)).not.toMatch(/private-credential|Private Guest|request_xml|last_result/);
  });

  it("explains when the hosted ARI schema is absent", async () => {
    mocks.results = [{ data: null, error: { code: "42P01" } }];
    setupQueries();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: "migration_not_installed" });
  });

  it("fails closed if any count is unavailable", async () => {
    mocks.results = [
      { data: [], error: null }, { data: [], error: null },
      { count: null, error: { code: "42501" } },
      ...Array.from({ length: 6 }, () => ({ count: 0, error: null })),
    ];
    setupQueries();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Booking.com test ARI status is temporarily unavailable." });
  });
});
