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

function csvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else field += character;
    } else if (character === '"' && field === "" && !closed) {
      quoted = true;
    } else if (character === "," || character === "\n" || character === "\r") {
      record.push(field.trim()); field = ""; closed = false;
      if (character !== ",") {
        if (record.some(value => value !== "")) records.push(record);
        record = [];
        if (character === "\r" && csv[index + 1] === "\n") index++;
      }
    } else {
      if (closed || character === '"') throw new Error(`Malformed CSV near row ${records.length + 1}.`);
      field += character;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  record.push(field.trim());
  if (record.some(value => value !== "")) records.push(record);
  return records;
}

export function parseRevenueCsv(csv: string): RevenueCsvRow[] {
  const records = csvRecords(csv.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new Error("CSV must include a header and at least one data row.");
  const headers = records[0].map(value => value.toLowerCase());
  if (requiredHeaders.some(header => !headers.includes(header))) throw new Error(`Required columns: ${requiredHeaders.join(", ")}.`);
  if (new Set(headers).size !== headers.length) throw new Error("CSV columns must be unique.");
  if (records.length > 5001) throw new Error("A single upload can contain no more than 5,000 rows.");
  const seen = new Set<string>();
  return records.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const value = (key: string) => values[headers.indexOf(key)] || "";
    const number = (key: string) => Number(value(key));
    const nullableNumber = (key: string) => value(key) === "" ? null : Number(value(key));
    if (["rooms_available", "rooms_sold", "current_rate"].some(key => value(key) === "")) {
      throw new Error(`Row ${index + 2} is missing a required room or rate value.`);
    }
    const row: RevenueCsvRow = {
      property_id: value("property_id"), room_id: value("room_id"), stay_date: value("stay_date"),
      rooms_available: number("rooms_available"), rooms_sold: number("rooms_sold"), current_rate: number("current_rate"),
      competitor_rate: nullableNumber("competitor_rate"), last_year_occupancy: nullableNumber("last_year_occupancy"),
      event_name: value("event_name") || null
    };
    const date = new Date(`${row.stay_date}T00:00:00Z`);
    if (!row.property_id || !row.room_id || !/^\d{4}-\d{2}-\d{2}$/.test(row.stay_date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== row.stay_date) throw new Error(`Row ${index + 2} has invalid IDs or date.`);
    if ([row.rooms_available, row.rooms_sold, row.current_rate].some(item => !Number.isFinite(item) || item < 0) || !Number.isInteger(row.rooms_available) || !Number.isInteger(row.rooms_sold) || row.rooms_sold > row.rooms_available || row.current_rate <= 0) throw new Error(`Row ${index + 2} has invalid room or rate values.`);
    if (row.competitor_rate !== null && (!Number.isFinite(row.competitor_rate) || row.competitor_rate <= 0)) throw new Error(`Row ${index + 2} has invalid competitor rate.`);
    if (row.last_year_occupancy !== null && (!Number.isFinite(row.last_year_occupancy) || row.last_year_occupancy < 0 || row.last_year_occupancy > 100)) throw new Error(`Row ${index + 2} has invalid occupancy.`);
    const key = `${row.room_id}\u0000${row.stay_date}`;
    if (seen.has(key)) throw new Error(`Row ${index + 2} duplicates a room and date.`);
    seen.add(key);
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
