import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../components/layout/header-actions.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/layout/site-header.tsx", import.meta.url), "utf8");

describe("authenticated site navigation", () => {
  it("loads uncached session state and replaces static auth controls", () => {
    expect(actions).toContain('fetch("/api/auth/session", { cache: "no-store" })');
    expect(sessionRoute.match(/"Cache-Control": "no-store"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(header).toContain("<HeaderActions />");
    expect(header).not.toContain('href="/login"');
  });

  it("exposes every customer account destination on desktop and mobile", () => {
    for (const href of ["/account", "/account/trips", "/account/payments", "/account/rewards", "/account/profile", "/account/support"]) {
      expect(actions).toContain(`href: "${href}"`);
    }
    expect(actions).toContain('aria-label="Account navigation"');
    expect(actions).toContain('aria-label="Mobile navigation"');
  });

  it("routes staff roles to their own consoles", () => {
    expect(actions).toContain('role === "admin"');
    expect(actions).toContain('href: "/admin"');
    expect(actions).toContain('role === "partner"');
    expect(actions).toContain('href: "/partner/dashboard"');
  });

  it("signs out through a same-origin POST", () => {
    expect(actions).toContain('fetch("/api/auth/session", { method: "POST" })');
    expect(sessionRoute).toContain('origin !== new URL(request.url).origin');
    expect(sessionRoute).toContain("supabase.auth.signOut()");
    expect(actions).toContain('window.location.assign("/")');
  });
});
