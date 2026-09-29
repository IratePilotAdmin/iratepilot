import { describe, expect, it } from "vitest";
import { loadCompleteRevenueRows, RevenueRowLimitError } from "./revenue-pagination";

describe("revenue input pagination", () => {
  it("loads every page before a report or recommendation uses it", async () => {
    const rows = await loadCompleteRevenueRows(async offset => ({ rows: offset === 0 ? [1, 2] : [3], count: offset === 0 ? 3 : null }));
    expect(rows).toEqual([1, 2, 3]);
  });
  it("fails closed when a page is missing", async () => {
    await expect(loadCompleteRevenueRows(async offset => ({ rows: offset === 0 ? [1] : [], count: 2 }))).rejects.toThrow(/incomplete/);
  });
  it("rejects windows beyond the supported limit", async () => {
    await expect(loadCompleteRevenueRows(async () => ({ rows: [1], count: 9_001 }))).rejects.toBeInstanceOf(RevenueRowLimitError);
  });
});
