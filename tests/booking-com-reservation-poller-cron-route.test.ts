import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-reservation-poller", () => ({ runBookingComReservationPoller: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-reservations/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Booking.com reservation polling cron route", () => {
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-reservations"))).status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("remains disabled unless explicitly enabled", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("IRP_BOOKING_COM_RESERVATION_POLL_ENABLED", "false");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-reservations", { headers: { authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("requires server-side encryption configuration and rejects POST", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("IRP_BOOKING_COM_RESERVATION_POLL_ENABLED", "true");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-reservations", { headers: { authorization: "Bearer secret" } }));
    expect(response.status).toBe(503);
    expect(runWorker).not.toHaveBeenCalled();
    expect((await POST()).status).toBe(405);
  });
});
