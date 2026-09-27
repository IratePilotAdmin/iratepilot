import { describe, expect, it } from "vitest";
import { loadCompleteSnapshotRows } from "../lib/pms-snapshot-pagination";

describe("PMS snapshot pagination", () => {
  it("loads all rows when the API caps responses below the requested page size", async () => {
    const source = Array.from({ length: 250 }, (_, index) => index);
    const offsets: number[] = [];
    const rows = await loadCompleteSnapshotRows(async (offset) => {
      offsets.push(offset);
      return { rows: source.slice(offset, offset + 100), count: offset === 0 ? source.length : null };
    }, 9_000);

    expect(rows).toEqual(source);
    expect(offsets).toEqual([0, 100, 200]);
  });

  it("refuses a partial snapshot when a later page disappears", async () => {
    await expect(loadCompleteSnapshotRows(async (offset) => ({
      rows: offset === 0 ? [1, 2] : [],
      count: offset === 0 ? 3 : null,
    }), 9_000)).rejects.toThrow("incomplete");
  });

  it("refuses a snapshot above the room and date bound", async () => {
    await expect(loadCompleteSnapshotRows(async () => ({ rows: [1], count: 9_001 }), 9_000))
      .rejects.toThrow("row limit");
  });
});
