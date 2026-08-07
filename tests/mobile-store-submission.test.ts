import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const apple = read("mobile/store/APP_STORE_LISTING.md");
const play = read("mobile/store/PLAY_STORE_LISTING.md");
const privacy = read("mobile/store/DATA_SAFETY_DRAFT.md");

describe("mobile store submission drafts", () => {
  it("uses accurate marketplace and payment language", () => {
    expect(apple).toContain("pay only after a hotel approves");
    expect(apple).toContain("Card details are handled by Stripe");
    expect(play).toContain("approved partner hotel inventory");
    expect(play).not.toContain("guaranteed lowest");
  });

  it("includes public privacy and support destinations", () => {
    for (const listing of [apple, play]) {
      expect(listing).toContain("https://www.iratepilot.com/privacy");
      expect(listing).toContain("https://www.iratepilot.com/contact");
    }
  });

  it("keeps compliance answers explicitly subject to owner review", () => {
    expect(privacy).toContain("not legal advice");
    expect(privacy).toContain("Decisions still requiring owner/legal review");
    expect(privacy).toContain("Stripe, Supabase, Expo, and Vercel");
    expect(privacy).toContain("Account deletion");
  });

  it("requires test access and graphics before submission", () => {
    expect(apple).toContain("dedicated non-production reviewer account");
    expect(apple).toContain("Final screenshots and 1024×1024 icon");
    expect(play).toContain("512×512 Play icon");
    expect(play).toContain("Internal-testing build approved");
  });
});
