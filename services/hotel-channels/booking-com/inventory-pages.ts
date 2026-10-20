const PAGE_SIZE = 1_000;
const MAX_ROWS = 50_000;

/** Collects ordered inventory pages without assuming the API's configured row cap. */
export async function loadBookingComInventoryPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    // Ask for one row past the ceiling so an oversized scope fails rather than truncates.
    const remaining = MAX_ROWS - rows.length;
    const { data, error } = await fetchPage(rows.length, rows.length + Math.min(PAGE_SIZE, remaining + 1) - 1);
    if (error || !Array.isArray(data) || data.length > Math.min(PAGE_SIZE, remaining + 1)) {
      throw new Error("booking_com_sync_inventory_unavailable");
    }
    if (data.length === 0) return rows;
    rows.push(...data);
    if (rows.length > MAX_ROWS) throw new Error("booking_com_sync_inventory_too_large");
  }
}
