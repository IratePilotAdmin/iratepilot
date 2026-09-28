import { describe, expect, it } from "vitest";
import { buildRateRecommendation, parseRevenueCsv } from "./revenue";

describe("Revenue AI CSV and recommendations", () => {
  it("parses required revenue fields", () => {
    const rows = parseRevenueCsv("property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate,competitor_rate,event_name\np1,r1,2026-08-14,10,9,189,220,Concert");
    expect(rows[0]).toMatchObject({ room_id: "r1", rooms_sold: 9, current_rate: 189, event_name: "Concert" });
  });
  it("handles quoted events containing commas, escaped quotes and line breaks", () => {
    const rows = parseRevenueCsv('property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate,event_name\r\np1,r1,2026-10-01,10,7,189,"Festival, \"\"Fall\"\"\nWeekend"');
    expect(rows[0].event_name).toBe('Festival, "Fall"\nWeekend');
  });
  it.each([
    ["invalid calendar date", "p1,r1,2026-02-30,10,7,189,,"],
    ["nonnumeric competitor", "p1,r1,2026-10-01,10,7,189,abc,"],
    ["fractional room inventory", "p1,r1,2026-10-01,10.5,7,189,,"],
    ["extra unquoted comma", "p1,r1,2026-10-01,10,7,189,,Festival, Downtown"],
  ])("rejects %s", (_description, row) => {
    expect(() => parseRevenueCsv(`property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate,competitor_rate,event_name\n${row}`)).toThrow();
  });
  it("rejects duplicate room dates in an upload", () => {
    const csv = "property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate\np1,r1,2026-10-01,10,7,189\np1,r1,2026-10-01,10,8,199";
    expect(() => parseRevenueCsv(csv)).toThrow(/duplicates/);
  });
  it("raises rates for high demand and an event", () => {
    const recommendation = buildRateRecommendation({ property_id: "p1", room_id: "r1", stay_date: "2026-08-14", rooms_available: 10, rooms_sold: 9, current_rate: 189, competitor_rate: 220, last_year_occupancy: 75, event_name: "Concert" });
    expect(recommendation.recommendedRate).toBeGreaterThan(189);
    expect(recommendation.reason).toContain("Manager approval");
  });
});
