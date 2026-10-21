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
      for (const method of ["select", "order", "limit", "eq", "in"]) query[method] = () => query;
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
      { data: [{ id: "new-event", connection_id: "connection", property_id: "property-id", event_kind: "new", status: "imported", received_at: "2026-09-30T12:00:00Z", attempt_count: 1, result_code: "pms_persisted_and_provider_acknowledged", pii_ciphertext: "secret", guest_name: "Guest" }], error: null },
      { data: [{ id: "older-review", connection_id: "connection", property_id: "property-id", event_kind: "modified", status: "review", received_at: "2026-09-29T12:00:00Z", attempt_count: 2, result_code: "payment_treatment_required", pii_ciphertext: "secret", guest_name: "Guest" }], error: null },
      ...[2, 1, 10, 3].map((count) => ({ count, error: null })),
      { data: [{ connection_id: "connection", provider: "booking_com" }], error: null },
    ];
    setupQueries();

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      available: true,
      scope: "all_external_ota_connections",
      totals: { received: 2, leased: 1, imported: 10, review: 3 },
      recent: [{ provider: "booking_com", eventKind: "new", status: "imported", attempts: 1 }],
      review: [{ id: "older-review", provider: "booking_com", eventKind: "modified", status: "review", attempts: 2, resultCode: "payment_treatment_required" }],
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("Guest");
  });

  it("labels each staged channel from its connection and redacts unrecognized result codes", async () => {
    mocks.results = [
      { data: [{ id: "event-id", connection_id: "expedia-connection", property_id: "property-id", event_kind: "new", status: "review", received_at: "2026-09-30T12:00:00Z", attempt_count: 1, result_code: "guest_name_encoded" }], error: null },
      { data: [], error: null },
      ...[0, 0, 0, 1].map((count) => ({ count, error: null })),
      { data: [{ connection_id: "expedia-connection", provider: "expedia" }], error: null },
    ];
    setupQueries();

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recent[0]).toMatchObject({ provider: "expedia", resultCode: "unrecognized_result" });
    expect(JSON.stringify(body)).not.toContain("guest_name_encoded");
  });

  it("fails closed when review counts or connection ownership cannot be verified", async () => {
    mocks.results = [
      { data: [], error: null }, { data: [], error: null },
      ...[0, 0, 0].map((count) => ({ count, error: null })),
      { count: null, error: null },
    ];
    setupQueries();
    expect((await GET()).status).toBe(503);

    mocks.results = [
      { data: [{ id: "event-id", connection_id: "missing", property_id: "property-id", event_kind: "new", status: "review", received_at: "2026-09-30T12:00:00Z", attempt_count: 1, result_code: null }], error: null },
      { data: [], error: null },
      ...[0, 0, 0, 1].map((count) => ({ count, error: null })),
      { data: [], error: null },
    ];
    setupQueries();
    expect((await GET()).status).toBe(503);
  });

  it("reports an uninstalled hosted schema as unavailable without exposing database errors", async () => {
    mocks.results = [{ data: null, error: { code: "42P01" } }];
    setupQueries();

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: "migration_not_installed" });
  });
});
