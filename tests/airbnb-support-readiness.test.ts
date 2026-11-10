import { describe, expect, it } from "vitest";
import { buildAirbnbSupportReadiness } from "../services/hotel-suppliers/airbnb-support-readiness";

describe("Airbnb shared-customer support evidence", () => {
  it("reports implemented support capabilities without claiming Airbnb eligibility", () => {
    const readiness = buildAirbnbSupportReadiness({});

    expect(readiness.status).toBe("evidence_only");
    expect(readiness.eligibilityDetermined).toBe(false);
    expect(readiness.controls.map(({ id }) => id)).toEqual([
      "reservation_message_center",
      "partner_reply_workflow",
      "admin_case_queue",
      "transactional_customer_updates",
      "support_reply_address",
      "operational_escalation",
    ]);
    expect(readiness.controls.find(({ id }) => id === "transactional_customer_updates")?.configured).toBe(false);
    expect(readiness.controls.find(({ id }) => id === "support_reply_address")?.configured).toBe(false);
    expect(readiness.controls.find(({ id }) => id === "operational_escalation")?.configured).toBe(false);
  });

  it("reports configured delivery channels without returning sensitive values", () => {
    const secret = "sensitive-resend-key";
    const readiness = buildAirbnbSupportReadiness({
      RESEND_API_KEY: secret,
      RESEND_FROM_EMAIL: "bookings@example.test",
      EMAIL_REPLY_TO: "support@example.test",
      ERROR_WEBHOOK_URL: "https://alerts.example.test/iratepilot",
    });

    expect(readiness.controls.find(({ id }) => id === "transactional_customer_updates")?.configured).toBe(true);
    expect(readiness.controls.find(({ id }) => id === "support_reply_address")?.configured).toBe(true);
    expect(readiness.controls.find(({ id }) => id === "operational_escalation")?.configured).toBe(true);
    expect(JSON.stringify(readiness)).not.toContain(secret);
    expect(JSON.stringify(readiness)).not.toContain("bookings@example.test");
    expect(JSON.stringify(readiness)).not.toContain("support@example.test");
    expect(JSON.stringify(readiness)).not.toContain("alerts.example.test");
  });
});
