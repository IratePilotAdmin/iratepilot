import { afterEach, describe, expect, it, vi } from "vitest";

const { runWorker } = vi.hoisted(() => ({ runWorker: vi.fn() }));
vi.mock("@/lib/native-pms-reservation-delivery", () => ({ runNativePmsReservationDelivery: runWorker }));

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

  it("does not expose the worker to POST requests", async () => {
    const response = await POST();
    expect(response.status).toBe(405);
    expect(runWorker).not.toHaveBeenCalled();
  });
});
