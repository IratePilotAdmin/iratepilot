import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FLORIDA_SELLER_OF_TRAVEL_DISCLOSURE,
  FLORIDA_SELLER_OF_TRAVEL_REGISTRATION,
} from "../lib/legal/seller-of-travel";

const footer = readFileSync(new URL("../components/layout/site-footer.tsx", import.meta.url), "utf8");
const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
const emailWorker = readFileSync(new URL("../app/api/email/process/route.ts", import.meta.url), "utf8");

describe("Florida seller of travel disclosure", () => {
  it("uses the issued registration number and statutory contract wording", () => {
    expect(FLORIDA_SELLER_OF_TRAVEL_REGISTRATION).toBe("ST150207");
    expect(FLORIDA_SELLER_OF_TRAVEL_DISCLOSURE).toBe(
      "iRatePilot Group, LLC is registered with the State of Florida as a Seller of Travel. Registration No. ST150207.",
    );
  });

  it("appears on public pages, in terms, and in transactional travel emails", () => {
    expect(footer).toContain("FLORIDA_SELLER_OF_TRAVEL_DISCLOSURE");
    expect(terms).toContain("FLORIDA_SELLER_OF_TRAVEL_DISCLOSURE");
    expect(emailWorker).toContain("FLORIDA_SELLER_OF_TRAVEL_DISCLOSURE");
  });
});
