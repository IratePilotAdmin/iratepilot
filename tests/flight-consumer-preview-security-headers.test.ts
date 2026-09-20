import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

describe("Consumer Preview browser-security headers", () => {
  it("scopes a deny-by-default CSP to flight checkout and My Trips surfaces", () => {
    expect(source).toContain('"/flights/:path*"');
    expect(source).toContain('"/account/flights/:path*"');
    expect(source).toContain('"default-src \'self\'"');
    expect(source).toContain('"object-src \'none\'"');
    expect(source).toContain('"frame-ancestors \'none\'"');
    expect(source).toContain('"form-action \'self\'"');
    expect(source).toContain('"upgrade-insecure-requests"');
  });

  it("allows only the documented Stripe.js, 3DS, and authenticated data connections", () => {
    expect(source).toContain("https://js.stripe.com");
    expect(source).toContain("https://*.js.stripe.com");
    expect(source).toContain("https://hooks.stripe.com");
    expect(source).toContain("https://api.stripe.com");
    expect(source).toContain("https://*.supabase.co");
    expect(source).toContain("wss://*.supabase.co");
    expect(source).not.toContain('"connect-src *');
    expect(source).not.toContain('"frame-src *');
  });
});
