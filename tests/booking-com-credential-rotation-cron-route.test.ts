import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-credential-rotation", () => ({ runBookingComCredentialRotation: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-credential-rotation/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Booking.com credential rotation cron route", () => {
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await GET(new Request("https://pms.example/api/cron/booking-com-credential-rotation"))).status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("stays disabled until explicitly enabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(new Request("https://pms.example/api/cron/booking-com-credential-rotation", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("rotates only to the configured active key version and rejects POST", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("IRP_BOOKING_COM_CREDENTIAL_ROTATION_ENABLED", "true");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "2");
    runWorker.mockResolvedValue({ claimed: 2, rotated: 2, stale: 0, failed: 0 });
    const request = new Request("https://pms.example/api/cron/booking-com-credential-rotation", {
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(await (await GET(request)).json()).toMatchObject({ ok: true, rotated: 2 });
    expect(runWorker).toHaveBeenCalledWith({ targetKeyVersion: 2, limit: 10 });
    expect((await POST()).status).toBe(405);
  });
});
