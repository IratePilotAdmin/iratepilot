import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-reservation-import", () => ({ runBookingComReservationImport: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-reservation-import/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Booking.com PMS import cron route", () => {
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-reservation-import"))).status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("stays disabled by default", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-reservation-import", { headers: { authorization: "Bearer secret" } }));
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("requires server-only config and rejects POST", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("IRP_BOOKING_COM_PMS_IMPORT_ENABLED", "true");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-reservation-import", { headers: { authorization: "Bearer secret" } }))).status).toBe(503);
    expect(runWorker).not.toHaveBeenCalled();
    expect((await POST()).status).toBe(405);
  });
});
