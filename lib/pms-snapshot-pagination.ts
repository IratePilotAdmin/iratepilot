export async function loadCompleteSnapshotRows<T>(
  fetchPage: (offset: number) => Promise<{ rows: T[]; count: number | null }>,
  maximumRows: number,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  while (true) {
    const page = await fetchPage(rows.length);
    if (expected === null) {
      if (page.count === null || !Number.isSafeInteger(page.count) || page.count < 0) {
        throw new Error("PMS snapshot row count is unavailable.");
      }
      expected = page.count;
      if (expected > maximumRows) throw new Error("PMS snapshot exceeds the supported row limit.");
    }
    if (rows.length + page.rows.length > expected) throw new Error("PMS snapshot count changed while loading.");
    if (page.rows.length === 0 && rows.length < expected) throw new Error("PMS snapshot is incomplete.");
    rows.push(...page.rows);
    if (rows.length === expected) return rows;
  }
}
