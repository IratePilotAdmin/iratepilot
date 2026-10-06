import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/native-pms-reservation-delivery", () => ({ drainNativePmsReservationDelivery: runWorker }));

import { GET, POST } from "@/app/api/cron/native-pms-reservations/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("native PMS reservation recovery route", () => {
  it("rejects unauthenticated requests and does not run the worker", async () => {
    vi.stubEnv("CRON_SECRET", "secret-for-tests");
    const response = await GET(new Request("https://ota.example/api/cron/native-pms-reservations"));
    expect(response.status).toBe(401);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("stays disabled by default after authenticating the cron caller", async () => {
    vi.stubEnv("CRON_SECRET", "secret-for-tests");
    vi.stubEnv("IRP_PMS_SYNC_ENABLED", "false");
    const response = await GET(new Request("https://ota.example/api/cron/native-pms-reservations", {
      headers: { authorization: "Bearer secret-for-tests" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, disabled: true });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("requires the credential encryption key before running", async () => {
    vi.stubEnv("CRON_SECRET", "secret-for-tests");
    vi.stubEnv("IRP_PMS_SYNC_ENABLED", "true");
    vi.stubEnv("PMS_CREDENTIAL_ENCRYPTION_KEY", "");
    const response = await GET(new Request("https://ota.example/api/cron/native-pms-reservations", {
      headers: { authorization: "Bearer secret-for-tests" },
    }));
    expect(response.status).toBe(503);
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("reports a retry as a failed scheduled run without exposing an event id", async () => {
    vi.stubEnv("CRON_SECRET", "secret-for-tests");
    vi.stubEnv("IRP_PMS_SYNC_ENABLED", "true");
    vi.stubEnv("PMS_CREDENTIAL_ENCRYPTION_KEY", "encryption-key-fixture");
    vi.stubEnv("IRP_PMS_DESTINATION_URL", "https://pms.supabase.co/rest/v1/rpc/irp_pms_ota_gateway");
    vi.stubEnv("IRP_PMS_DESTINATION_PUBLISHABLE_KEY", "sb_publishable_abcdefghijklmnop");
    runWorker.mockResolvedValueOnce([{ outcome: "retry", eventId: "private-event-id", code: "http_503" }]);
    const response = await GET(new Request("https://ota.example/api/cron/native-pms-reservations", {
      headers: { authorization: "Bearer secret-for-tests" },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, outcomes: [{ outcome: "retry", code: "http_503" }] });
    expect(runWorker).toHaveBeenCalledTimes(1);
  });

  it("reports a bounded source failure code without leaking the underlying error", async () => {
    vi.stubEnv("CRON_SECRET", "secret-for-tests");
    vi.stubEnv("IRP_PMS_SYNC_ENABLED", "true");
    vi.stubEnv("PMS_CREDENTIAL_ENCRYPTION_KEY", "encryption-key-fixture");
    vi.stubEnv("IRP_PMS_DESTINATION_URL", "https://pms.supabase.co/rest/v1/rpc/irp_pms_ota_gateway");
    vi.stubEnv("IRP_PMS_DESTINATION_PUBLISHABLE_KEY", "sb_publishable_abcdefghijklmnop");
    runWorker.mockRejectedValueOnce(new Error("Reservation worker database call failed: irp_pms_list_configured_delivery_connections."));
    const response = await GET(new Request("https://ota.example/api/cron/native-pms-reservations", {
      headers: { authorization: "Bearer secret-for-tests" },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Reservation delivery worker is unavailable.", code: "source_connection_list_failed" });
  });

  it("does not expose the worker to POST requests", async () => {
    const response = await POST();
    expect(response.status).toBe(405);
    expect(runWorker).not.toHaveBeenCalled();
  });
});
