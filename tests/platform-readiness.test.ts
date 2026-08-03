import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPlatformReadiness } from "../lib/admin/platform-readiness";

const route = readFileSync(new URL("../app/api/admin/settings/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/settings/page.tsx", import.meta.url), "utf8");

const configured = {
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
  PILOT_MODE: "true",
  RESEND_API_KEY: "resend-secret-value",
  RESEND_FROM_EMAIL: "support@example.com",
  CRON_SECRET: "cron-secret-value",
  STRIPE_SECRET_KEY: "sk_test_secret-value",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_public-value",
};

describe("platform readiness console", () => {
  it("requires admin authorization before administrative connectivity checks", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("reports readiness without returning credential values", () => {
    const result = buildPlatformReadiness(configured, true);
    const serialized = JSON.stringify(result);
    expect(result.requiredReady).toBe(true);
    for (const secret of Object.values(configured).filter((value) => value.includes("value"))) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("distinguishes disabled features from missing required services", () => {
    const result = buildPlatformReadiness({}, false);
    expect(result.requiredReady).toBe(false);
    expect(result.items.find((item) => item.id === "public_booking")?.status).toBe("off");
    expect(result.items.find((item) => item.id === "database")?.status).toBe("attention");
  });

  it("replaces the mutable-settings placeholder with a read-only console", () => {
    expect(page).toContain("<AdminSettings />");
    expect(page).not.toContain("Administrative module placeholder");
    expect(page).toContain("without exposing credential values");
  });
});
