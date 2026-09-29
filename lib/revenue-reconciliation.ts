type InventoryRow = { room_id: string; stay_date: string; available_units: number; rate: number | string };
type RevenueRow = { room_id: string; stay_date: string; rooms_available: number; rooms_sold: number; current_rate: number | string; source: string };

export function reconcileRevenueRows(inventoryRows: InventoryRow[], revenueRows: RevenueRow[]) {
  const key = (roomId: string, date: string) => `${roomId}\u0000${date}`;
  const inventory = new Map(inventoryRows.map(row => [key(row.room_id, row.stay_date), row]));
  const imported = new Map(revenueRows.map(row => [key(row.room_id, row.stay_date), row]));
  let matchedDates = 0;
  let missingInventoryDates = 0;
  let missingImportedDates = 0;
  let rateDifferences = 0;
  let indicativeAvailabilityDifferences = 0;
  const examples: Array<{ roomId: string; stayDate: string; issue: string }> = [];
  const addExample = (roomId: string, stayDate: string, issue: string) => {
    if (examples.length < 20) examples.push({ roomId, stayDate, issue });
  };
  for (const [id, row] of imported) {
    const snapshot = inventory.get(id);
    if (!snapshot) {
      missingInventoryDates++;
      addExample(row.room_id, row.stay_date, "No dated OTA inventory");
      continue;
    }
    matchedDates++;
    if (Math.abs(Number(row.current_rate) - Number(snapshot.rate)) >= 0.005) {
      rateDifferences++;
      addExample(row.room_id, row.stay_date, "CSV and OTA rates differ");
    }
    if (row.rooms_available - row.rooms_sold !== snapshot.available_units) {
      indicativeAvailabilityDifferences++;
      addExample(row.room_id, row.stay_date, "Estimated remaining rooms differ from OTA availability");
    }
  }
  for (const [id, row] of inventory) {
    if (!imported.has(id)) {
      missingImportedDates++;
      addExample(row.room_id, row.stay_date, "No revenue input for dated OTA inventory");
    }
  }
  return {
    status: revenueRows.length === 0 ? "no_revenue_inputs" : (missingInventoryDates || missingImportedDates || rateDifferences || indicativeAvailabilityDifferences ? "differences" : "indicative_match"),
    inventoryRows: inventoryRows.length, revenueRows: revenueRows.length, matchedDates,
    missingInventoryDates, missingImportedDates, rateDifferences, indicativeAvailabilityDifferences,
    inputSources: [...new Set(revenueRows.map(row => row.source))].sort(),
    examples,
  };
}
