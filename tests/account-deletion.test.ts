import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("account deletion disclosure", () => {
  it("publishes a public account-deletion request page", () => {
    const page = read("app/account-deletion/page.tsx");

    expect(page).toContain("Request account deletion");
    expect(page).toContain("Support@iratepilot.com");
    expect(page).toContain("within 30 days");
    expect(page).toContain("Reservation, payment, fraud-prevention");
  });

  it("links account deletion from the privacy policy and signed-in mobile account", () => {
    expect(read("app/privacy/page.tsx")).toContain('href="/account-deletion"');
    expect(read("mobile/src/app/(tabs)/account.tsx")).toContain('openWebPath("/account-deletion")');
  });
});
