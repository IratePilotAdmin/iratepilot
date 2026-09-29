import { describe, expect, it } from "vitest";
import { isPmsOnlyRoom } from "./pms-only-room";

describe("PMS-only room guard", () => {
  it("detects PMS-only properties in object and array relation responses", () => {
    expect(isPmsOnlyRoom({ pms_only: true })).toBe(true);
    expect(isPmsOnlyRoom([{ pms_only: true }])).toBe(true);
  });

  it("allows ordinary and missing relations through the PMS-only check", () => {
    expect(isPmsOnlyRoom({ pms_only: false })).toBe(false);
    expect(isPmsOnlyRoom([])).toBe(false);
    expect(isPmsOnlyRoom(null)).toBe(false);
  });
});
