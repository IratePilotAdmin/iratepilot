import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as Array<{ data?: unknown; count?: number | null; error?: { code?: string } | null }>,
  adminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient() }));

import { requireRole } from "@/lib/auth/require-role";
import { GET } from "@/app/api/admin/integrations/native-pms/outbox/route";

function setupQueries() {
  let index = 0;
  mocks.adminClient.mockReturnValue({
    from: () => {
      const result = mocks.results[index++];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "eq", "lte"]) query[method] = () => query;
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

describe("native PMS delivery monitoring", () => {
  it("blocks non-admin users before creating a privileged client", async () => {
    vi.mocked(requireRole).mockResolvedValue({ error: "Forbidden", status: 403 } as never);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("reports exact states and due counts without returning payloads or credentials", async () => {
    mocks.results = [
      { data: [{ connection_id: "SYNTHPMS001", property_id: "property", environment: "sandbox", enabled: false, delivery_enabled: false, signing_secret: "must-not-leak" }], error: null },
      { data: [{ event_id: "event", connection_id: "SYNTHPMS001", property_id: "property", state: "review", attempts: 2,
        due_at: "2026-10-20T00:00:00Z", created_at: "2026-10-20T00:00:00Z", result_code: "pms_review-required",
        event_payload: { guest: "Private Guest" } },
      { event_id: "other", connection_id: "SYNTHPMS001", property_id: "property", state: "retry", attempts: 1,
        due_at: "2026-10-20T00:00:00Z", created_at: "2026-10-20T00:00:00Z", result_code: "guest_name_in_error" }], error: null },
      { data: [{ event_id: "older-review", connection_id: "SYNTHPMS001", property_id: "property", state: "review", attempts: 5,
        due_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", result_code: "retry_exhausted",
        event_payload: { guest: "Older Private Guest" } }], error: null },
      ...[2, 0, 1, 8, 1, 2, 1, 1, 1, 0, 0].map((count) => ({ count, error: null })),
    ];
    setupQueries();
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      available: true,
      totals: { pending: 2, leased: 0, retry: 1, delivered: 8, review: 1 },
      due: 3,
      health: { level: "attention", reviewEvents: 1, expiredLeases: 1, overdueEvents: 1, deliveryEnabledConnections: 0 },
      connections: [{ connectionId: "SYNTHPMS001", captureEnabled: false, deliveryEnabled: false }],
      recent: [{ state: "review", resultCode: "pms_review-required" }, { state: "retry", resultCode: "unrecognized_result" }],
      review: [{ eventId: "older-review", state: "review", attempts: 5, resultCode: "retry_exhausted" }],
    });
    expect(JSON.stringify(body)).not.toMatch(/must-not-leak|Private Guest|guest_name_in_error/);
  });

  it("treats an overdue but intentionally paused queue as paused", async () => {
    mocks.results = [
      { data: [], error: null }, { data: [], error: null }, { data: [], error: null },
      ...[2, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0].map((count) => ({ count, error: null })),
    ];
    setupQueries();
    const response = await GET();
    const body = await response.json();
    expect(body.health).toMatchObject({ level: "paused", overdueEvents: 2, deliveryEnabledConnections: 0 });
  });

  it("states clearly when the connector migration is absent", async () => {
    mocks.results = [{ data: null, error: { code: "42P01" } }];
    setupQueries();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: "migration_not_installed" });
  });
});
