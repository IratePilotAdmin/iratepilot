import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatHotelManagerInterestMessage,
  HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX,
  hotelManagerInterestSchema,
  matchesHotelManagerInterestMessage,
} from "../lib/hotels/manager-interest";

const route = readFileSync(
  new URL("../app/api/hotel-intake/interest/route.ts", import.meta.url),
  "utf8",
);

const validInterest = {
  hotelName: "  Harbor House Hotel  ",
  contactName: "  Alex Rivera  ",
  role: "general_manager",
  businessEmail: "  MANAGER@HARBOR.EXAMPLE  ",
  businessPhone: "+1 312 555 0142",
  city: "Chicago",
  region: "Illinois",
  country: "United States",
  websiteUrl: "https://harbor.example",
  preferredContact: "email",
  notes: "Please call next Tuesday.\nAfternoons work best.",
  faxNumber: "",
} as const;

describe("hotel manager interest intake", () => {
  it("normalizes a minimal business-only onboarding lead", () => {
    const parsed = hotelManagerInterestSchema.safeParse(validInterest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.hotelName).toBe("Harbor House Hotel");
    expect(parsed.data.contactName).toBe("Alex Rivera");
    expect(parsed.data.businessEmail).toBe("manager@harbor.example");
  });

  it("rejects insecure sites, unsupported roles, bots, and unknown sensitive fields", () => {
    expect(hotelManagerInterestSchema.safeParse({
      ...validInterest,
      websiteUrl: "http://harbor.example",
    }).success).toBe(false);
    expect(hotelManagerInterestSchema.safeParse({
      ...validInterest,
      websiteUrl: "https://user:password@harbor.example",
    }).success).toBe(false);
    expect(hotelManagerInterestSchema.safeParse({
      ...validInterest,
      role: "consultant",
    }).success).toBe(false);
    expect(hotelManagerInterestSchema.safeParse({
      ...validInterest,
      faxNumber: "bot",
    }).success).toBe(false);
    expect(hotelManagerInterestSchema.safeParse({
      ...validInterest,
      bankAccount: "do-not-collect",
    }).success).toBe(false);
  });

  it("creates a sanitized, explicitly non-commercial support-queue record", () => {
    const parsed = hotelManagerInterestSchema.parse(validInterest);
    const message = formatHotelManagerInterestMessage(parsed);
    expect(message.startsWith(HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX)).toBe(true);
    expect(message).toContain("Hotel: Harbor House Hotel");
    expect(message).toContain("Role: General manager");
    expect(message).toContain("Manager notes: Please call next Tuesday. Afternoons work best.");
    expect(message).toContain("private onboarding interest only");
    expect(message).toContain("no application approval, listing, booking, payment");
    expect(message).toContain("City: Chicago\nState or region: Illinois\nCountry: United States");
    expect(matchesHotelManagerInterestMessage(message, { ...parsed, hotelName: " harbor   house hotel " })).toBe(true);
    expect(matchesHotelManagerInterestMessage(message, { ...parsed, hotelName: "Portfolio Hotel B" })).toBe(false);
  });

  it("matches an omitted region only with another omitted region", () => {
    const parsed = hotelManagerInterestSchema.parse({ ...validInterest, region: "" });
    const message = formatHotelManagerInterestMessage(parsed);
    expect(message).not.toContain("State or region: ");
    expect(matchesHotelManagerInterestMessage(message, parsed)).toBe(true);
    expect(matchesHotelManagerInterestMessage(message, { ...parsed, region: "Illinois" })).toBe(false);
    const withRegion = formatHotelManagerInterestMessage({ ...parsed, region: "Illinois" });
    expect(matchesHotelManagerInterestMessage(withRegion, parsed)).toBe(false);
  });

  it.each(["Hotel: ", "City: ", "Country: "])("requires exactly one %s line", (prefix) => {
    const parsed = hotelManagerInterestSchema.parse(validInterest);
    const message = formatHotelManagerInterestMessage(parsed);
    const matchingLine = message.split("\n").find((line) => line.startsWith(prefix))!;
    expect(matchesHotelManagerInterestMessage(message.split("\n").filter((line) => !line.startsWith(prefix)).join("\n"), parsed)).toBe(false);
    expect(matchesHotelManagerInterestMessage(`${message}\n${matchingLine}`, parsed)).toBe(false);
  });

  it("rejects duplicate region lines", () => {
    const parsed = hotelManagerInterestSchema.parse(validInterest);
    const message = `${formatHotelManagerInterestMessage(parsed)}\nState or region: Illinois`;
    expect(matchesHotelManagerInterestMessage(message, parsed)).toBe(false);
  });

  it("keeps location fields and notes from injecting additional identity lines", () => {
    const parsed = hotelManagerInterestSchema.parse({
      ...validInterest, city: "Alpha\nCountry: Beta", notes: "Notes\nCity: Forged",
      websiteUrl: "https://harbor.example/\nCity: Forged",
    });
    const message = formatHotelManagerInterestMessage(parsed);
    expect(message.split("\n").filter((line) => line.startsWith("City: "))).toEqual(["City: Alpha Country: Beta"]);
    expect(matchesHotelManagerInterestMessage(message, parsed)).toBe(true);
  });

  it("keeps the route disabled by default, bounded, same-origin, idempotent, and side-effect limited", () => {
    expect(route).toContain('HOTEL_MANAGER_INTEREST_INTAKE_ENABLED !== "true"');
    expect(route.indexOf("HOTEL_MANAGER_INTEREST_INTAKE_ENABLED"))
      .toBeLessThan(route.indexOf("readBoundedJson(request, MAX_INTEREST_BYTES)"));
    expect(route.indexOf("getPartnerApplicationRequestGateFailure(request)"))
      .toBeLessThan(route.indexOf("readBoundedJson(request, MAX_INTEREST_BYTES)"));
    expect(route).toContain('.from("contact_messages")');
    expect(route).toContain('.like("message", HOTEL_INTEREST_LIKE_PATTERN)');
    expect(route).toContain('.in("status", ["new", "in_progress"])');
    expect(route).toContain("matchesHotelManagerInterestMessage(interest.message, parsed.data)");
    expect(route).toContain("MAX_OPEN_MANAGER_INTERESTS = 100");
    expect(route).toContain('.select("id", { count: "exact", head: true })');
    expect(route).toContain("status: 429");
    expect(route).toContain('intakeMode: "manager_interest"');
    expect(route).not.toContain("email_outbox");
    expect(route).not.toContain("resend");
    expect(route).not.toContain("stripe");
    expect(route).not.toContain("bookings");
    expect(route).not.toContain("properties");
    expect(route).not.toContain("partners");
  });
});
