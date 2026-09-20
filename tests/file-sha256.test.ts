import { describe, expect, it } from "vitest";
import { sha256File } from "../lib/file-sha256";

describe("agreement document fingerprinting", () => {
  it("calculates the standard SHA-256 fingerprint from the exact file bytes", async () => {
    const file = new Blob(["iRatePilot agreement"]);

    await expect(sha256File(file)).resolves.toBe(
      "8cc5293971232d23f3fbd632e4d4664426cfa3ccf4f414c2845f7ebec98a1a65",
    );
  });
});
