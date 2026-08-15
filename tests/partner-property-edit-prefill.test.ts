import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  new URL("../components/dashboard/partner-properties.tsx", import.meta.url),
  "utf8",
);

describe("partner property content editing", () => {
  it("prefills saved listing content after a partner selects a property", () => {
    expect(form).toContain("selectedPropertyId");
    expect(form).toContain('defaultValue={selectedProperty?.description ?? ""}');
    expect(form).toContain('defaultValue={selectedProperty?.image_url ?? ""}');
    expect(form).toContain('defaultValue={(selectedProperty?.amenities ?? []).join(", ")}');
  });

  it("does not allow a content update without a selected property", () => {
    expect(form).toContain("disabled={busy || !selectedProperty || (delegatedManager && selectedProperty.active)}");
  });
});
