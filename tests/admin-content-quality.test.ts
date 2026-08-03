import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContentQuality, type ContentQualityProperty } from "../lib/admin/content-quality";

const route = readFileSync(new URL("../app/api/admin/content/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/content/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");
const partnerContentRoute = readFileSync(new URL("../app/api/partner/properties/[id]/route.ts", import.meta.url), "utf8");
const partnerProperties = readFileSync(new URL("../components/dashboard/partner-properties.tsx", import.meta.url), "utf8");

const completeProperty = (overrides: Partial<ContentQualityProperty> = {}): ContentQualityProperty => ({
  id: "p1", name: "Pilot Hotel", slug: "pilot-hotel", type: "hotel", star_rating: 5,
  description: "A premium hotel description with enough editorial detail to help travelers understand the stay, location, atmosphere, and distinctive hospitality experience.",
  image_url: "https://images.example.com/hotel.jpg", amenities: ["Pool", "Spa", "Wi-Fi"], city: "Austin", country: "US", active: true,
  partners: { business_name: "Pilot Hospitality", status: "approved" },
  rooms: [{ active: true, inventory: [{ stay_date: "2026-09-01", available_units: 2 }] }], ...overrides,
});

describe("admin marketplace content quality", () => {
  it("separates editorial quality from existing technical publication readiness", () => {
    const result = buildContentQuality([completeProperty()], "2026-08-01");
    expect(result.summary).toEqual({ total: 1, published: 1, highQuality: 1, publishedWithIssues: 0 });
    expect(result.items[0]).toMatchObject({ score: 100, complete: true, missing: [] });
  });

  it("surfaces published listings with weak or unsafe content first", () => {
    const weak = completeProperty({ id: "weak", name: "Weak", description: "Too short", image_url: "javascript:alert(1)", amenities: ["Pool"] });
    const draft = completeProperty({ id: "draft", name: "Draft", active: false });
    const result = buildContentQuality([draft, weak], "2026-08-01");
    expect(result.summary.publishedWithIssues).toBe(1);
    expect(result.items[0].id).toBe("weak");
    expect(result.items[0].missing).toEqual(expect.arrayContaining(["safe primary photo", "description of at least 120 characters", "at least 3 amenities"]));
  });

  it("requires administrator access and caps the property query", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("PROPERTY_LIMIT");
    expect(route).toContain('{ count: "exact" }');
    expect(route).toContain("truncated");
  });

  it("replaces and exposes the former admin placeholder", () => {
    expect(page).toContain("<AdminContentQuality />");
    expect(page).not.toContain("Administrative module placeholder");
    expect(navigation).toContain('{ href: "/admin/content", label: "Content quality" }');
  });

  it("gives partners a remediation path for editorial description issues", () => {
    expect(partnerContentRoute).toContain("description: parsed.data.description");
    expect(partnerProperties).toContain('name="description"');
    expect(partnerProperties).toContain("minLength={120}");
  });
});
