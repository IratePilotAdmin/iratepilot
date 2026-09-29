export type RevenueReportInput = {
  rooms_available: number;
  rooms_sold: number;
  current_rate: number | string;
};

export function summarizeRevenueInputs(inputs: RevenueReportInput[]) {
  if (inputs.some(row => !Number.isFinite(Number(row.rooms_available)) || !Number.isFinite(Number(row.rooms_sold))
    || !Number.isFinite(Number(row.current_rate)) || Number(row.rooms_available) < 0
    || Number(row.rooms_sold) < 0 || Number(row.rooms_sold) > Number(row.rooms_available)
    || Number(row.current_rate) < 0)) {
    throw new Error("Revenue inputs contain invalid occupancy or rate values.");
  }
  const available = inputs.reduce((sum, row) => sum + Number(row.rooms_available), 0);
  const sold = inputs.reduce((sum, row) => sum + Number(row.rooms_sold), 0);
  const revenue = inputs.reduce((sum, row) => sum + Number(row.rooms_sold) * Number(row.current_rate), 0);
  if (![available, sold, revenue].every(Number.isFinite) || available < 0 || sold < 0 || sold > available) {
    throw new Error("Revenue inputs contain invalid occupancy or rate values.");
  }
  return {
    averageOccupancy: available ? Math.round(sold / available * 10000) / 100 : 0,
    averageRate: sold ? Math.round(revenue / sold * 100) / 100 : 0,
    forecastRevenue: Math.round(revenue * 100) / 100,
  };
}
