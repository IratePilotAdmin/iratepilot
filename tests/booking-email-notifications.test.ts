import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("booking transactional notifications", () => {
  it("queues every customer lifecycle event", () => {
    const helper = read("lib/email/booking-notifications.ts");
    for (const event of ["request_received", "approved", "declined", "payment_confirmed", "cancelled", "refund_completed"]) {
      expect(helper).toContain(event);
    }
    expect(helper).toContain("dedupe_key");
    expect(helper).toContain("queueTransactionalEmail");
  });

  it("wires booking, review, payment, cancellation, and refund routes", () => {
    const routes = [
      "app/api/bookings/route.ts",
      "app/api/partner/reservations/[id]/route.ts",
      "app/api/bookings/[id]/complete-payment/route.ts",
      "app/api/bookings/complete-payment/route.ts",
      "app/api/admin/cancellations/[id]/route.ts",
    ].map(read).join("\n");
    for (const event of ["request_received", "payment_confirmed", "cancelled", "refund_completed"]) {
      expect(routes).toContain(`event: "${event}"`);
    }
    expect(routes).toContain('? "declined" : "approved"');
  });
});
