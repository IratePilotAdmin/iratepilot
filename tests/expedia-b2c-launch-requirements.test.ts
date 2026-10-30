import { describe, expect, it } from "vitest";
import {
  expediaB2cLaunchRequirements,
  expediaB2cRequirementCount,
} from "../lib/expedia-rapid/b2c-launch-requirements";

describe("Expedia Rapid B2C launch requirements", () => {
  it("tracks all 37 checklist requirements without duplicate codes", () => {
    const codes = expediaB2cLaunchRequirements.flatMap((section) =>
      section.requirements.map((requirement) => requirement.code),
    );

    expect(expediaB2cRequirementCount).toBe(37);
    expect(new Set(codes).size).toBe(37);
  });

  it("keeps the official review sections visible", () => {
    expect(expediaB2cLaunchRequirements.map((section) => section.id)).toEqual([
      "general",
      "search",
      "availability",
      "booking",
      "confirmation",
      "email",
      "technical",
    ]);
  });
});
