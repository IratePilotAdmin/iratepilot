import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("immediate transactional email delivery", () => {
  it("wakes the secured worker after booking notifications are queued", () => {
    const outbox = read("lib/email/outbox.ts");
    const booking = read("lib/email/booking-notifications.ts");
    expect(outbox).toContain("wakeTransactionalEmailWorker");
    expect(outbox).toContain("VERCEL_URL");
    expect(outbox).toContain("authorization: `Bearer ${cronSecret}`");
    expect(booking).toContain("await wakeTransactionalEmailWorker()");
  });

  it("provides an admin-only test endpoint and control", () => {
    const route = read("app/api/admin/email-test/route.ts");
    const settings = read("components/dashboard/admin-settings.tsx");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("auth.user.email");
    expect(route).toContain("No booking or payment was created");
    expect(settings).toContain("/api/admin/email-test");
    expect(settings).toContain("Send test email");
  });
});
