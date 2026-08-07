import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const eas = JSON.parse(read("mobile/eas.json"));
const packageJson = JSON.parse(read("mobile/package.json"));
const preflight = read("mobile/scripts/release-check.mjs");
const checklist = read("mobile/RELEASE_CHECKLIST.md");

describe("native mobile release preparation", () => {
  it("separates internal preview builds from store production builds", () => {
    expect(eas.cli.requireCommit).toBe(true);
    expect(eas.build.preview.distribution).toBe("internal");
    expect(eas.build.preview.android.buildType).toBe("apk");
    expect(eas.build.production.android.buildType).toBe("app-bundle");
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it("binds builds to named EAS environments without committing credentials", () => {
    expect(eas.build.development.environment).toBe("development");
    expect(eas.build.preview.environment).toBe("preview");
    expect(eas.build.production.environment).toBe("production");
    expect(JSON.stringify(eas)).not.toMatch(/pk_(test|live)_|service_role|sk_live_/);
  });

  it("provides a public-variable release preflight and blocks exposed secrets", () => {
    expect(packageJson.scripts["release:check"]).toBe("node scripts/release-check.mjs");
    expect(preflight).toContain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(preflight).toContain("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(preflight).toContain("production HTTPS URL");
    expect(preflight).toContain("SECRET|SERVICE_ROLE|WEBHOOK_SECRET");
  });

  it("requires physical-device and compliance review before submission", () => {
    expect(checklist).toContain("Physical-device acceptance");
    expect(checklist).toContain("Notification opt-in and opt-out");
    expect(checklist).toContain("App Store privacy details");
    expect(checklist).toContain("TestFlight and Play internal-testing");
  });
});
