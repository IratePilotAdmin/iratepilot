import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reservationReviewSchema } from "../lib/validation";

const reviewRoute = readFileSync(new URL("../app/api/partner/reservations/[id]/route.ts", import.meta.url), "utf8");
const listRoute = readFileSync(new URL("../app/api/partner/reservations/route.ts", import.meta.url), "utf8");
const partnerUi = readFileSync(new URL("../components/bookings/partner-reservations.tsx", import.meta.url), "utf8");

describe("safe reservation decisions", () => {
  it("accepts approvals and requires meaningful decline context", () => {
    expect(reservationReviewSchema.safeParse({ decision: "approve", reason: "" }).success).toBe(true);
    expect(reservationReviewSchema.safeParse({ decision: "reject", reason: "Sold out" }).success).toBe(true);
    expect(reservationReviewSchema.safeParse({ decision: "reject", reason: "" }).success).toBe(false);
    expect(reservationReviewSchema.safeParse({ decision: "reject", reason: "x" }).success).toBe(false);
  });

  it("does not turn a cancelled prompt into an accidental rejection", () => {
    expect(partnerUi).toContain("if (entered === null) return");
    expect(partnerUi).toContain("reason.length < 3");
    expect(partnerUi).toContain("setReviewingId(id)");
    expect(partnerUi).toContain("disabled={Boolean(reviewingId)}");
    expect(partnerUi).toContain("Approve this request and hold its inventory?");
  });

  it("serves fresh reservation state and logs operational failures", () => {
    expect(partnerUi).toContain('{ cache: "no-store" }');
    expect(listRoute).toContain('"Cache-Control": "no-store"');
    expect(reviewRoute).toContain('"Cache-Control": "no-store"');
    expect(listRoute).toContain('console.error("Partner reservation list failed"');
    expect(reviewRoute).toContain('console.error("Reservation decision failed"');
  });
});
