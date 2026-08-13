import { describe, expect, it } from "vitest";
import { createStayntouchSyncAdapter, loadStayntouchSyncConfig } from "../services/hotel-suppliers/stayntouch";

describe("Stayntouch synchronization configuration", () => {
  it("loads production-safe configuration and creates the adapter", () => {
    const config = loadStayntouchSyncConfig({
      PMS_STAYNTOUCH_ACCESS_TOKEN: "token",
      PMS_STAYNTOUCH_CURRENCY: "USD",
      PMS_STAYNTOUCH_BOOKING_ORIGIN_CODE: "IRP",
    });
    expect(config).toMatchObject({
      transport: { baseUrl: "https://api.stayntouch.com/connect/", apiVersion: "2.0" },
      mapper: { currency: "USD", bookingOriginCode: "IRP" },
    });
    expect(createStayntouchSyncAdapter(config).providerId).toBe("stayntouch");
  });

  it("fails closed when booking credentials or currency are missing", () => {
    expect(() => loadStayntouchSyncConfig({ PMS_STAYNTOUCH_CURRENCY: "USD" }))
      .toThrow("PMS_STAYNTOUCH_ACCESS_TOKEN");
    expect(() => loadStayntouchSyncConfig({ PMS_STAYNTOUCH_ACCESS_TOKEN: "token" }))
      .toThrow("PMS_STAYNTOUCH_CURRENCY");
  });
});
