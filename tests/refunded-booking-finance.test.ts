import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/admin/cancellations/[id]/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020013_reconcile_refunded_booking_finance.sql", import.meta.url),
  "utf8",
);

describe("refunded booking finance reconciliation", () => {
  it("records a Stripe transfer reversal before issuing the refund", () => {
    expect(route).toContain('.select("id,status,stripe_transfer_id,stripe_transfer_status")');
    expect(route).toContain('booking.status !== "confirmed"');
    expect(route).toContain("if (financialError) throw financialError");
    expect(route).toContain("const { error: reversalUpdateError }");
    expect(route).toContain("if (reversalUpdateError) throw reversalUpdateError");
    expect(route.indexOf("if (reversalUpdateError) throw reversalUpdateError"))
      .toBeLessThan(route.indexOf("stripe.refunds.create"));
  });

  it("blocks refund finalization while a paid partner transfer is unreversed", () => {
    expect(route).toContain('financial?.status === "paid" && transferStatus !== "reversed"');
    expect(migration).toContain("status = 'paid'");
    expect(migration).toContain("stripe_transfer_status <> 'reversed'");
    expect(migration).toContain("Partner transfer must be reversed before refund finalization");
  });

  it("voids finance after its paid transfer has been reversed", () => {
    expect(migration).toContain("set status = 'void'");
    expect(migration).toContain("status <> 'paid' or stripe_transfer_status = 'reversed'");
  });
});
