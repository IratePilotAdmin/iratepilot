import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sender = readFileSync(new URL("../lib/notifications/expo.ts", import.meta.url), "utf8");
const bookingNotifications = readFileSync(new URL("../lib/email/booking-notifications.ts", import.meta.url), "utf8");

describe("mobile push delivery", () => {
  it("is disabled by default and targets only enabled devices owned by the customer", () => {
    expect(sender).toContain('ENABLE_MOBILE_PUSH_NOTIFICATIONS !== "true"');
    expect(sender).toContain('.eq("user_id", input.customerId)');
    expect(sender).toContain('.eq("enabled", true)');
    expect(sender).toContain(".limit(100)");
  });

  it("sends server-side through Expo without exposing credentials to the app", () => {
    expect(sender).toContain('"https://exp.host/--/api/v2/push/send"');
    expect(sender).toContain("process.env.EXPO_ACCESS_TOKEN");
    expect(sender).toContain("headers.Authorization");
    expect(sender).not.toContain("EXPO_PUBLIC_EXPO_ACCESS_TOKEN");
  });

  it("stops targeting tokens rejected as DeviceNotRegistered", () => {
    expect(sender).toContain('details?.error === "DeviceNotRegistered"');
    expect(sender).toContain(".update({ enabled: false");
    expect(sender).toContain('.eq("user_id", input.customerId)');
  });

  it("keeps push failures isolated from transactional email delivery", () => {
    expect(bookingNotifications).toContain("await wakeTransactionalEmailWorker()");
    expect(bookingNotifications).toContain("await sendBookingPushNotification");
    expect(bookingNotifications).toContain('console.error("Booking push notification could not be sent"');
  });
});
