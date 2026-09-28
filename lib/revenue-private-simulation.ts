import { addDays, format } from "date-fns";
import { buildRateRecommendation, type RevenueCsvRow } from "./revenue";
import { summarizeRevenueInputs } from "./revenue-report";

const roomTypes = [
  { name: "Standard room (sample)", capacity: 10, rate: 129 },
  { name: "Suite (sample)", capacity: 4, rate: 179 },
] as const;

export function buildPrivateRevenueSimulation(start: Date) {
  const inputs = Array.from({ length: 30 }, (_, day) => roomTypes.map((room, index): RevenueCsvRow & { room_name: string } => {
    const roomsSold = Math.min(room.capacity, Math.floor(room.capacity * (0.4 + ((day + index * 3) % 6) * 0.1)));
    return {
      property_id: "simulation-only", room_id: `sample-${index + 1}`, room_name: room.name,
      stay_date: format(addDays(start, day), "yyyy-MM-dd"),
      rooms_available: room.capacity, rooms_sold: roomsSold, current_rate: room.rate,
      competitor_rate: room.rate + 15, last_year_occupancy: 60,
      event_name: day === 12 ? "Sample local event" : null,
    };
  })).flat();
  const recommendations = inputs.map(input => ({
    room_name: input.room_name, stay_date: input.stay_date,
    ...buildRateRecommendation(input),
  }));
  return {
    propertyName: "Red Roof Inn Ridgeland — synthetic private test",
    simulated: true as const, readOnly: true as const, days: 30,
    roomTypes: roomTypes.map(room => room.name),
    inputRows: inputs.length,
    report: summarizeRevenueInputs(inputs),
    recommendations: recommendations.slice(0, 10),
  };
}
