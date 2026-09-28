type PmsRow = { room_id: string; stay_date: string; available_units: number; rate: number | string };
type RevenueRow = { room_id: string; stay_date: string; rooms_available: number; rooms_sold: number; current_rate: number | string; source: string };

export function reconcileRevenueRows(pmsRows: PmsRow[], revenueRows: RevenueRow[]) {
  const key = (roomId: string, date: string) => `${roomId}\u0000${date}`;
  const pms = new Map(pmsRows.map(row => [key(row.room_id, row.stay_date), row]));
  const imported = new Map(revenueRows.map(row => [key(row.room_id, row.stay_date), row]));
  let matchedDates = 0;
  let missingPmsDates = 0;
  let missingImportedDates = 0;
  let rateDifferences = 0;
  let indicativeAvailabilityDifferences = 0;
  const examples: Array<{ roomId: string; stayDate: string; issue: string }> = [];
  const addExample = (roomId: string, stayDate: string, issue: string) => {
    if (examples.length < 20) examples.push({ roomId, stayDate, issue });
  };
  for (const [id, row] of imported) {
    const snapshot = pms.get(id);
    if (!snapshot) {
      missingPmsDates++;
      addExample(row.room_id, row.stay_date, "No dated PMS inventory");
      continue;
    }
    matchedDates++;
    if (Math.abs(Number(row.current_rate) - Number(snapshot.rate)) >= 0.005) {
      rateDifferences++;
      addExample(row.room_id, row.stay_date, "CSV and PMS rates differ");
    }
    if (row.rooms_available - row.rooms_sold !== snapshot.available_units) {
      indicativeAvailabilityDifferences++;
      addExample(row.room_id, row.stay_date, "Estimated remaining rooms differ from PMS availability");
    }
  }
  for (const [id, row] of pms) {
    if (!imported.has(id)) {
      missingImportedDates++;
      addExample(row.room_id, row.stay_date, "No revenue input for dated PMS inventory");
    }
  }
  return {
    status: revenueRows.length === 0 ? "no_revenue_inputs" : (missingPmsDates || missingImportedDates || rateDifferences || indicativeAvailabilityDifferences ? "differences" : "indicative_match"),
    pmsRows: pmsRows.length, revenueRows: revenueRows.length, matchedDates,
    missingPmsDates, missingImportedDates, rateDifferences, indicativeAvailabilityDifferences,
    inputSources: [...new Set(revenueRows.map(row => row.source))].sort(),
    examples,
  };
}
