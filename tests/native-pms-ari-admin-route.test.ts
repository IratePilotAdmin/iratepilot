import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const admin = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const result = table === "irp_pms_native_ari_audit"
        ? { data: [{ id: 1, action: "enabled" }], error: null }
        : table === "irp_pms_outbox_connections"
          ? { data: [], error: null }
          : { data: [{ connection_id: "redroof-1", enabled: false }], error: null };
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    }),
    rpc: vi.fn(),
  };
  return {
    calls,
    admin,
    createAdminClient: vi.fn(() => admin),
    requireRole: vi.fn(async () => ({ user: { id: "admin-user" }, profile: { role: "admin" } })),
  };
});

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET, PATCH } from "../app/api/admin/integrations/native-ari/route";

function request(body: unknown, options: { origin?: string; contentType?: string; crossSite?: boolean } = {}) {
  return new Request("https://www.iratepilot.com/api/admin/integrations/native-ari", {
    method: "PATCH",
    headers: {
      "content-type": options.contentType ?? "application/json",
      origin: options.origin ?? "https://www.iratepilot.com",
      "sec-fetch-site": options.crossSite ? "cross-site" : "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("native ARI administrator configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    delete process.env.IRATEPILOT_PMS_ARI_ENABLED;
    mocks.admin.rpc.mockResolvedValue({ data: { connectionId: "redroof-1", enabled: false }, error: null });
  });

  it("returns only non-secret connection and audit metadata, plus the global receiver state", async () => {
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "true";
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      receiverEnabled: true,
      connections: [{ connection_id: "redroof-1", enabled: false }],
      audit: [{ action: "enabled" }],
      reservationSources: [],
    });
    expect(mocks.calls).toEqual([
      "irp_pms_native_ari_connections",
      "irp_pms_native_ari_audit",
      "irp_pms_outbox_connections",
    ]);
  });

  it("keeps a property connection disabled while the global receiver flag is off", async () => {
    const response = await PATCH(request({ connectionId: "redroof-1", enabled: true }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("globally disabled") });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("allows an administrator to disable a connection even if the global receiver is off", async () => {
    const response = await PATCH(request({ connectionId: "redroof-1", enabled: false }));
    expect(response.status).toBe(200);
    expect(mocks.admin.rpc).toHaveBeenCalledWith("irp_pms_set_native_ari_connection_enabled", {
      p_actor: "admin-user",
      p_connection: "redroof-1",
      p_enabled: false,
    });
  });

  it("requires the global flag before per-property enablement and maps failed scope checks safely", async () => {
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "true";
    mocks.admin.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private row detail" } });
    const response = await PATCH(request({ connectionId: "redroof-1", enabled: true }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Activation checks failed. Verify the approved property, enabled PMS reservation connection, and active room mappings." });
  });

  it("rejects cross-site and malformed state changes before database access", async () => {
    expect((await PATCH(request({ connectionId: "redroof-1", enabled: false }, { crossSite: true }))).status).toBe(403);
    expect((await PATCH(request({ connectionId: "../unsafe", enabled: false }))).status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
