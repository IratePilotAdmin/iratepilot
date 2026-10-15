import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-reservation-retention", () => ({ runBookingComReservationRetention: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-reservation-retention/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Booking.com reservation PII retention cron route", () => {
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-reservation-retention"))).status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("is disabled until explicitly enabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-reservation-retention", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("purges a bounded batch and rejects POST", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("IRP_BOOKING_COM_RESERVATION_RETENTION_ENABLED", "true");
    runWorker.mockResolvedValue({ purged: 3, retentionDays: 30 });
    const request = new Request("https://pms.example/api/cron/booking-com-reservation-retention", {
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(await (await GET(request)).json()).toMatchObject({ ok: true, purged: 3, retentionDays: 30 });
    expect(runWorker).toHaveBeenCalledWith(50);
    expect((await POST()).status).toBe(405);
  });
});
