import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderBookingEmailDetails } from "../lib/email/booking-email-template";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("lodging booking disclosures", () => {
  it("renders the complete confirmation details and escapes supplier content", () => {
    const html = renderBookingEmailDetails({
      supplier_itinerary_id: "EXP-123",
      property_name: "Hotel <script>alert(1)</script>",
      room_name: "Deluxe",
      bed_type: "1 king bed",
      check_in: "2026-11-10",
      check_out: "2026-11-12",
      guests: 3,
      child_ages: [7],
      refundable: false,
      cancellation_policy: "Non-refundable",
      checkin_begin_time: "3:00 PM",
      checkin_end_time: "11:00 PM",
      checkin_instructions: "Bring photo identification.",
      special_checkin_instructions: "Call after 11:00 PM.",
      subtotal: 700,
      taxes: 70,
      fees: 50,
      due_at_property: 50,
      total: 820,
      payment_timing: "$770.00 collected now; $50.00 due at the property.",
      support_email: "support@iratepilot.com",
      support_url: "https://www.iratepilot.com/account/support",
    });

    expect(html).toContain("EXP-123");
    expect(html).toContain("Non-refundable");
    expect(html).toContain("children ages 7");
    expect(html).toContain("Charges due at property");
    expect(html).toContain("$820.00");
    expect(html).toContain("Hotel &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("Hotel <script>");
  });

  it("keeps the migration restricted and separates due-now from due-at-property", () => {
    const migration = read("supabase/migrations/202611010180_lodging_booking_disclosures.sql");
    expect(migration).toContain("direct_bed_type");
    expect(migration).toContain("direct_special_checkin_instructions");
    expect(migration).toContain("due_at_property");
    expect(migration).toContain("round((v_subtotal + v_tax_total) * 100)");
    expect(migration).toContain("v_total := v_subtotal + v_tax_total + v_mandatory_fee_total");
    expect(migration).toContain("revoke all on function public.complete_paid_test_booking");
    expect(migration).toContain("to service_role");
  });
});
