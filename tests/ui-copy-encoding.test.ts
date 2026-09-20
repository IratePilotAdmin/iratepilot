import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("operator UI copy encoding", () => {
  it("keeps administrative and PMS controls free from mojibake", () => {
    const sources = [
      read("components/dashboard/admin-settings.tsx"),
      read("components/dashboard/partner-pms-connections.tsx"),
    ];

    for (const source of sources) {
      expect(source).not.toContain("â");
      expect(source).not.toContain("Ã");
      expect(source).not.toContain("�");
    }
  });
});
