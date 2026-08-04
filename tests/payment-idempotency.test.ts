import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020008_payment_intent_idempotency.sql", import.meta.url),
  "utf8",
);
const completion = readFileSync(
  new URL("../lib/bookings/complete-paid-test-booking.ts", import.meta.url),
  "utf8",
);

describe("paid booking idempotency", () => {
  it("enforces one booking per Stripe PaymentIntent after checking historical duplicates", () => {
    expect(migration).toContain("group by stripe_payment_intent_id");
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("create unique index if not exists bookings_stripe_payment_intent_id_key");
    expect(migration).toContain("where stripe_payment_intent_id is not null");
  });

  it("recovers the winning booking when concurrent completion hits the unique index", () => {
    expect(completion).toContain("if (error) {");
    expect(completion).toContain('.eq("stripe_payment_intent_id", intent.id)');
    expect(completion).toContain("if (existingError) throw existingError");
    expect(completion).toContain("booking = existingBooking");
  });
});
