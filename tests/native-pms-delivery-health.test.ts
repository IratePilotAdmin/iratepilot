import { describe, expect, it } from "vitest";
import { assessNativePmsDeliveryHealth } from "@/lib/native-pms-delivery-health";

const at = "2026-10-20T20:00:00.000Z";

describe("native PMS delivery health", () => {
  it("keeps an intentionally paused, aged queue distinct from a live incident", () => {
    expect(assessNativePmsDeliveryHealth({ reviewEvents: 0, expiredLeases: 0,
      overduePending: 2, overdueRetry: 0, deliveryEnabledConnections: 0 }, at).level).toBe("paused");
  });

  it("flags review events and expired leases even when delivery is paused", () => {
    expect(assessNativePmsDeliveryHealth({ reviewEvents: 1, expiredLeases: 1,
      overduePending: 0, overdueRetry: 0, deliveryEnabledConnections: 0 }, at)).toMatchObject({
      level: "attention", reviewEvents: 1, expiredLeases: 1,
    });
  });

  it("flags aged due events when delivery is enabled", () => {
    expect(assessNativePmsDeliveryHealth({ reviewEvents: 0, expiredLeases: 0,
      overduePending: 1, overdueRetry: 1, deliveryEnabledConnections: 1 }, at)).toMatchObject({
      level: "attention", overdueEvents: 2,
    });
  });
});
