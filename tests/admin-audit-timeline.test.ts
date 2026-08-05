import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminAuditEvents, type BookingAuditRow, type RevenueAuditRow } from "../lib/admin/audit-events";

const route = readFileSync(new URL("../app/api/admin/audit/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/audit/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

describe("admin audit timeline", () => {
  it("authorizes admins before reading audit tables with the service role", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    expect(route).toContain('from("booking_status_history")');
    expect(route).toContain('from("revenue_audit_log")');
    expect(route).toContain("Promise.all([");
  });

  it("normalizes and sorts only recorded events", () => {
    const booking: BookingAuditRow = {
      id: "booking-event", status: "confirmed", note: null, created_at: "2026-08-02T10:00:00Z",
      profiles: { full_name: "Admin User" }, bookings: { confirmation_code: "IRP-123", properties: { name: "Pilot Hotel" } },
    };
    const revenue: RevenueAuditRow = {
      id: "revenue-event", action: "csv_imported", details: { rows: 30, filename: "rates.csv" }, created_at: "2026-08-02T11:00:00Z",
      profiles: null, properties: { name: "Pilot Hotel" },
    };

    const events = buildAdminAuditEvents([booking], [revenue]);
    expect(events.map((event) => event.id)).toEqual(["revenue:revenue-event", "booking:booking-event"]);
    expect(events[0].actor).toBe("System");
    expect(events[0].detail).toContain("rows: 30");
    expect(events[1].title).toContain("IRP-123");
  });

  it("replaces the placeholder and exposes audit navigation", () => {
    expect(page).toContain("<AdminAudit />");
    expect(page).not.toContain("Administrative module placeholder");
    expect(navigation).toContain('{ href: "/admin/audit", label: "Audit" }');
  });
});
