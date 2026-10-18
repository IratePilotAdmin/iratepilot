import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("public contact privacy", () => {
  it("keeps public contact surfaces free of telephone links", () => {
    const publicContactSurfaces = [
      "app/contact/page.tsx",
      "components/forms/contact-form.tsx",
      "components/layout/site-footer.tsx",
    ].map(read).join("\n");

    expect(publicContactSurfaces).not.toMatch(/href\s*=\s*["'`]tel:/i);
    expect(publicContactSurfaces).not.toMatch(/\btel:/i);
  });

  it("does not advertise a public organization telephone number in metadata", () => {
    expect(read("app/layout.tsx")).toContain("telephone: false");
  });
});
