import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/booking-com-reservation-import", () => ({ runBookingComReservationImport: runWorker }));

import { GET, POST } from "@/app/api/cron/booking-com-reservation-import/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Booking.com PMS import cron route", () => {
  function configureEnabledWorker() {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("IRP_BOOKING_COM_PMS_IMPORT_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://source.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", "e".repeat(44));
    vi.stubEnv("OTA_RESERVATION_PII_ENCRYPTION_KEY", "e".repeat(44));
    vi.stubEnv("IRP_PMS_DESTINATION_URL", "https://receiver.supabase.co/rest/v1/rpc/irp_pms_ota_gateway");
    vi.stubEnv("IRP_PMS_DESTINATION_PUBLISHABLE_KEY", `sb_publishable_${"p".repeat(20)}`);
    return new Request("https://pms.example/api/cron/booking-com-reservation-import", {
      headers: { authorization: "Bearer secret" },
    });
  }

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

  it("reports missing paired credentials as unavailable without claiming an event", async () => {
    runWorker.mockResolvedValueOnce({ outcome: "idle", code: "no_valid_connection_credentials" });
    const response = await GET(configureEnabledWorker());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, outcome: "idle", code: "no_valid_connection_credentials" });
  });

  it("reports registry overflow without exposing connection details", async () => {
    runWorker.mockRejectedValueOnce(new Error("booking_com_reservation_import_registry_limit_exceeded"));
    const response = await GET(configureEnabledWorker());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Booking.com PMS import registry exceeds its safe connection limit." });
  });
});
