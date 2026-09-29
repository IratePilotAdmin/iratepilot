export class RevenueRowLimitError extends Error {}

export async function loadCompleteRevenueRows<T>(
  fetchPage: (offset: number) => Promise<{ rows: T[]; count: number | null }>,
  maximumRows = 9_000,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  while (true) {
    const page = await fetchPage(rows.length);
    if (expected === null) {
      if (page.count === null || !Number.isSafeInteger(page.count) || page.count < 0) {
        throw new Error("Revenue input count is unavailable.");
      }
      expected = page.count;
      if (expected > maximumRows) throw new RevenueRowLimitError("Revenue inputs exceed the supported 9,000 row window.");
    }
    if (rows.length + page.rows.length > expected) throw new Error("Revenue input count changed while loading.");
    if (page.rows.length === 0 && rows.length < expected) throw new Error("Revenue inputs are incomplete.");
    rows.push(...page.rows);
    if (rows.length === expected) return rows;
  }
}
