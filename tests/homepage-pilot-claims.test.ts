import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const hotelCard = readFileSync(new URL("../components/hotels/hotel-card.tsx", import.meta.url), "utf8");

describe("homepage private-pilot claims", () => {
  it("does not claim live payments or verified sample inventory", () => {
    expect(homepage).not.toContain("Secure live payments");
    expect(homepage).not.toContain("Premium verified properties");
    expect(homepage).toContain("Private-pilot safeguards");
    expect(homepage).toContain("They are not live bookable inventory");
    expect(homepage).toContain('loading="eager"');
  });

  it("aligns global metadata with the private pilot and smooth scrolling", () => {
    expect(layout).not.toContain("secure online payments");
    expect(layout).toContain("private-pilot safeguards");
    expect(layout).toContain('data-scroll-behavior="smooth"');
  });

  it("distinguishes approved database properties from demonstration cards", () => {
    expect(hotelCard).toContain('source === "database" ? "approved" : "demo"');
    expect(hotelCard).not.toContain("{hotel.stars}-star verified");
  });
});
