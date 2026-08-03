import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const center = readFileSync(new URL("../components/bookings/booking-message-center.tsx", import.meta.url), "utf8");

describe("booking message reliability", () => {
  it("aborts stale inbox and thread requests during navigation", () => {
    expect(center.match(/new AbortController\(\)/g)).toHaveLength(2);
    expect(center.match(/signal: controller\.signal/g)).toHaveLength(2);
    expect(center.match(/return \(\) => controller\.abort\(\)/g)).toHaveLength(2);
    expect(center).toContain('error.name !== "AbortError"');
  });

  it("always unlocks the composer after send or refresh failures", () => {
    expect(center).toContain("try {");
    expect(center).toContain("} finally {");
    expect(center).toContain("setSending(false)");
    expect(center).toContain("The conversation could not be refreshed.");
    expect(center).toContain("The message could not be sent. Please try again.");
  });

  it("prevents conversation switching while a message is in flight", () => {
    expect(center).toContain('disabled={sending} onClick={() => selectBooking(booking.id)}');
    expect(center).toContain("disabled:cursor-not-allowed disabled:opacity-60");
  });
});
