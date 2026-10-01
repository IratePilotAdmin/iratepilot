import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-ari-delivery", () => ({ runBookingComAriDelivery: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-ari/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Booking.com ARI cron route", () => {
  it("rejects callers without the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-ari"))).status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("is disabled by default even for authenticated cron callers", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("IRP_BOOKING_COM_ARI_SYNC_ENABLED", "false");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-ari", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("requires server configuration before dispatching, and does not expose POST", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("IRP_BOOKING_COM_ARI_SYNC_ENABLED", "true");
    const request = new Request("https://pms.example/api/cron/booking-com-ari", {
      headers: { authorization: "Bearer cron-test-secret" },
    });
    expect((await GET(request)).status).toBe(503);
    expect(runWorker).not.toHaveBeenCalled();
    expect((await POST()).status).toBe(405);
  });
});
