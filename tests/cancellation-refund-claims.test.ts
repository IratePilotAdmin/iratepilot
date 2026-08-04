import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cancellationClaimTimeoutMs, isCancellationClaimStale } from "../lib/bookings/cancellation-claims";
import { getBookingStatusLabel } from "../lib/bookings/status-history";

const decisionRoute = readFileSync(new URL("../app/api/admin/cancellations/[id]/route.ts", import.meta.url), "utf8");
const listRoute = readFileSync(new URL("../app/api/admin/cancellations/route.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../components/bookings/admin-cancellations.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202608020022_claim_cancellation_refunds.sql", import.meta.url), "utf8");

describe("cancellation refund claims", () => {
  it("recognizes only expired processing claims as stale", () => {
    const now = Date.parse("2026-08-02T12:20:00Z");
    expect(isCancellationClaimStale("processing", "2026-08-02T12:00:00Z", now)).toBe(true);
    expect(isCancellationClaimStale("processing", new Date(now - cancellationClaimTimeoutMs + 1).toISOString(), now)).toBe(false);
    expect(isCancellationClaimStale("pending", "2026-08-02T12:00:00Z", now)).toBe(false);
    expect(getBookingStatusLabel("processing")).toBe("Refund processing");
  });

  it("claims before Stripe mutations and releases failures for retry", () => {
    const claimIndex = decisionRoute.indexOf('status: "processing"');
    const stripeIndex = decisionRoute.indexOf("stripe.transfers.createReversal");
    expect(claimIndex).toBeGreaterThan(0);
    expect(claimIndex).toBeLessThan(stripeIndex);
    expect(decisionRoute).toContain('.eq("status", "processing")');
    expect(decisionRoute).toContain('status: "pending"');
    expect(decisionRoute).toContain("cancellationClaimTimeoutMs");
  });

  it("requires a processing claim in SQL and exposes stale retry state", () => {
    expect(migration).toContain("'pending','processing','approved','rejected','refunded'");
    expect(migration).toContain("v_request.status <> 'processing'");
    expect(migration).toContain("coalesce(auth.uid(), reviewed_by)");
    expect(listRoute).toContain("isCancellationClaimStale");
    expect(adminUi).toContain("Retry refund");
  });
});
