import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));

import HotelIntakePage, { dynamic } from "../app/hotel-intake/page";
import PartnerPage from "../app/partner/page";
import { POST } from "../app/api/partners/apply/route";

const flagCases = [
  { label: "default flags", interest: undefined, application: undefined, enabled: false },
  { label: "both false", interest: "false", application: "false", enabled: false },
  { label: "legacy application alone enabled", interest: undefined, application: "true", enabled: false },
  { label: "interest false and legacy application true", interest: "false", application: "true", enabled: false },
  { label: "interest alone enabled", interest: "true", application: undefined, enabled: true },
  { label: "interest true and legacy application false", interest: "true", application: "false", enabled: true },
  { label: "both true", interest: "true", application: "true", enabled: true },
  { label: "mistyped interest flag", interest: "TRUE", application: "true", enabled: false },
];

function setFlags(flags: typeof flagCases[number]) {
  vi.stubEnv("HOTEL_MANAGER_INTEREST_INTAKE_ENABLED", flags.interest);
  vi.stubEnv("HOTEL_MANAGER_APPLICATION_INTAKE_ENABLED", flags.application);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("interest-only production integration", () => {
  it("evaluates availability during dynamic page rendering", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each(flagCases)("renders only the permitted interest state with $label", (flags) => {
    setFlags(flags);
    const html = renderToStaticMarkup(createElement(HotelIntakePage));

    const inputNames = Array.from(html.matchAll(/name="([^"]+)"/g), (match) => match[1]);
    expect(inputNames).not.toContain("propertyName");
    expect(html).not.toContain('id="hotel-application"');
    expect(html).not.toContain("Submit hotel for verification");
    if (flags.enabled) {
      expect(html.match(/<form\b/g)).toHaveLength(1);
      expect(html).toContain('id="manager-interest-form"');
      expect(html).toContain('href="#manager-interest-form"');
      expect(html).toContain('name="hotelName"');
      expect(html).toContain('name="businessEmail"');
      expect(html).toContain("Request private follow-up");
      expect(html).toContain("This creates an outreach lead only");
      expect(html).not.toContain("Intake paused");
    } else {
      expect(html).not.toMatch(/<form\b|<input\b|<textarea\b/);
      expect(html).toContain("Intake paused");
      expect(html).toContain('href="/contact"');
      expect(html).not.toContain('href="#manager-interest-form"');
    }
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(flagCases)("routes the partner page to interest intake without collecting an application with $label", (flags) => {
    setFlags(flags);
    const html = renderToStaticMarkup(createElement(PartnerPage));
    expect(html).not.toMatch(/<form\b|<input\b|<textarea\b/);
    expect(html).toContain('href="/hotel-intake"');
    expect(html).toContain("Full hotel applications are currently paused.");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(flagCases)("keeps legacy submission closed without reading a request with $label", async (flags) => {
    setFlags(flags);
    const inspectRequest = vi.fn(() => { throw new Error("The paused endpoint inspected the request."); });
    const request = new Proxy({} as Request, { get: inspectRequest });
    const response = await (POST as unknown as (request: Request) => Promise<Response>)(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Full hotel manager applications are not available yet.",
    });
    expect(inspectRequest).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("leaves a real malformed submission body unread", async () => {
    vi.stubEnv("HOTEL_MANAGER_APPLICATION_INTAKE_ENABLED", "true");
    const request = new Request("https://iratepilot.test/api/partners/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{unread",
    });
    const response = await (POST as unknown as (request: Request) => Promise<Response>)(request);
    expect(response.status).toBe(503);
    expect(request.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
