import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("password recovery", () => {
  it("links password recovery from the login page", () => {
    expect(read("../app/login/page.tsx")).toContain('href="/forgot-password"');
  });

  it("sends recovery emails through Supabase with a safe local callback", () => {
    const source = read("../components/forms/forgot-password-form.tsx");
    expect(source).toContain("resetPasswordForEmail");
    expect(source).toContain('encodeURIComponent("/reset-password")');
  });

  it("confirms recovery token hashes server-side without browser-local PKCE state", () => {
    const route = read("../app/auth/confirm/route.ts");
    expect(route).toContain('type !== "recovery"');
    expect(route).toContain("verifyOtp({");
    expect(route).toContain("token_hash: tokenHash");
    expect(route).toContain('type: "recovery"');
    expect(route).toContain('new URL("/reset-password", request.url)');
    expect(route).toContain("createRecoveryMarker(userId)");
    expect(route).toContain("recoveryMarkerMaxAge");
    expect(route).not.toContain("exchangeCodeForSession");

    const logStart = route.indexOf("console.error");
    const redirectAfterLog = route.indexOf("return NextResponse.redirect", logStart);
    const logStatement = route.slice(logStart, redirectAfterLog);
    expect(logStatement).not.toContain("tokenHash");
    expect(logStatement).not.toContain("token_hash");
  });

  it("ships the matching hosted recovery-email template", () => {
    const template = read("../supabase/auth-templates/recovery.html");
    expect(template).toContain("{{ .SiteURL }}/auth/confirm");
    expect(template).toContain("token_hash={{ .TokenHash }}");
    expect(template).toContain("type=recovery");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });

  it("does not show password inputs without an authenticated recovery session", () => {
    const page = read("../app/reset-password/page.tsx");
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain("verifyRecoveryMarker(recoveryMarker, user.id)");
    expect(page).toContain("if (!recoveryVerified)");
    expect(page).toContain("Reset link required");
    expect(page).toContain('href="/forgot-password"');
  });

  it("clears the recovery marker after a successful password update", () => {
    const form = read("../components/forms/reset-password-form.tsx");
    const completion = read("../app/api/auth/recovery/complete/route.ts");
    expect(form).toContain('fetch("/api/auth/recovery/complete", { method: "POST" })');
    expect(completion).toContain("verifyRecoveryMarker(marker, user.id)");
    expect(completion).toContain("maxAge: 0");
  });

  it("requires matching passwords before updating the authenticated user", () => {
    const source = read("../components/forms/reset-password-form.tsx");
    expect(source).toContain("password !== confirmation");
    expect(source).toContain("updateUser({ password })");
  });
});

