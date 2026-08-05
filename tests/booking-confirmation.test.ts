import { describe, expect, it } from "vitest";
import { getBookingConfirmationPresentation } from "../lib/booking-confirmation";

describe("booking confirmation presentation", () => {
  it("distinguishes pending requests, replayed requests, and paid confirmations", () => {
    expect(getBookingConfirmationPresentation("pending", false).title).toBe("Your booking request was sent");
    expect(getBookingConfirmationPresentation("pending", false, true).title).toBe("Your request is already pending");
    expect(getBookingConfirmationPresentation("confirmed", true).title).toBe("Your test stay is confirmed");
    expect(getBookingConfirmationPresentation("confirmed", false).title).toBe("Your booking is confirmed");
  });

  it("does not describe closed bookings as successful", () => {
    expect(getBookingConfirmationPresentation("cancelled", false).title).toBe("This booking was cancelled");
    expect(getBookingConfirmationPresentation("refunded", true).title).toBe("This booking was refunded");
  });
});
