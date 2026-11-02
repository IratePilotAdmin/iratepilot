import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202611010182_allow_test_hotel_payment_finalization.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("legacy hotel payment finalization barrier", () => {
  it("allows only Stripe test-mode settlement while the live payment hold is closed", () => {
    expect(migration).toContain("new.stripe_payment_mode is distinct from 'test'");
    expect(migration).toContain("new.status = 'eligible' and v_booking_payment_mode = 'test'");
    expect(migration).toContain("not coalesce(v_payment_enabled, false)");
  });

  it("keeps booking approval and partner payout authority fail-closed", () => {
    expect(migration).toContain("Legacy hotel booking approval is disabled");
    expect(migration).toContain("Legacy hotel partner payout authority is disabled");
    expect(migration).not.toMatch(/update\s+public\.hotel_legacy_transaction_controls/i);
  });
});
