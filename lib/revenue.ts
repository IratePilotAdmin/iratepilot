export type RevenueCsvRow = {
  property_id: string;
  room_id: string;
  stay_date: string;
  rooms_available: number;
  rooms_sold: number;
  current_rate: number;
  competitor_rate: number | null;
  last_year_occupancy: number | null;
  event_name: string | null;
};

const requiredHeaders = ["property_id", "room_id", "stay_date", "rooms_available", "rooms_sold", "current_rate"];

export function parseRevenueCsv(csv: string): RevenueCsvRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV must include a header and at least one data row.");
  const headers = lines[0].split(",").map(value => value.trim().toLowerCase());
  if (requiredHeaders.some(header => !headers.includes(header))) throw new Error(`Required columns: ${requiredHeaders.join(", ")}.`);
  if (lines.length > 5001) throw new Error("A single upload can contain no more than 5,000 rows.");
  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map(value => value.trim());
    const value = (key: string) => values[headers.indexOf(key)] || "";
    const number = (key: string) => Number(value(key));
    const nullableNumber = (key: string) => value(key) === "" ? null : Number(value(key));
    const row: RevenueCsvRow = {
      property_id: value("property_id"), room_id: value("room_id"), stay_date: value("stay_date"),
      rooms_available: number("rooms_available"), rooms_sold: number("rooms_sold"), current_rate: number("current_rate"),
      competitor_rate: nullableNumber("competitor_rate"), last_year_occupancy: nullableNumber("last_year_occupancy"),
      event_name: value("event_name") || null
    };
    if (!row.property_id || !row.room_id || !/^\d{4}-\d{2}-\d{2}$/.test(row.stay_date)) throw new Error(`Row ${index + 2} has invalid IDs or date.`);
    if ([row.rooms_available, row.rooms_sold, row.current_rate].some(item => !Number.isFinite(item) || item < 0) || row.rooms_sold > row.rooms_available) throw new Error(`Row ${index + 2} has invalid room or rate values.`);
    if (row.last_year_occupancy !== null && (row.last_year_occupancy < 0 || row.last_year_occupancy > 100)) throw new Error(`Row ${index + 2} has invalid occupancy.`);
    return row;
  });
}

export function buildRateRecommendation(input: RevenueCsvRow) {
  const occupancy = input.rooms_available ? input.rooms_sold / input.rooms_available : 0;
  let multiplier = occupancy >= 0.85 ? 1.15 : occupancy >= 0.7 ? 1.08 : occupancy < 0.35 ? 0.92 : 1;
  const reasons = [`${Math.round(occupancy * 100)}% booking occupancy`];
  if (input.competitor_rate && input.competitor_rate > input.current_rate * 1.08) { multiplier += 0.04; reasons.push("competitors are priced higher"); }
  if (input.event_name) { multiplier += 0.06; reasons.push(`demand event: ${input.event_name}`); }
  const recommendedRate = Math.max(1, Math.round(input.current_rate * multiplier));
  const unsold = Math.max(0, input.rooms_available - input.rooms_sold);
  return {
    currentRate: input.current_rate,
    recommendedRate,
    occupancyForecast: Math.min(100, Math.round((occupancy * 100 + (input.last_year_occupancy || occupancy * 100)) / 2)),
    estimatedRevenueImpact: Math.round((recommendedRate - input.current_rate) * unsold * 100) / 100,
    reason: `Based on ${reasons.join(", ")}. Manager approval is required.`
  };
}
