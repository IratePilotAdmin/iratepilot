import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("password recovery", () => {
  it("links password recovery from the login page", () => {
    expect(read("../app/login/page.tsx")).toContain('href="/forgot-password"');
  });

  it("sends recovery emails to the allow-listed confirmation endpoint", () => {
    const source = read("../components/forms/forgot-password-form.tsx");
    expect(source).toContain("resetPasswordForEmail");
    expect(source).toContain('`${window.location.origin}/auth/confirm`');
    expect(source).not.toContain("/auth/callback?next=");
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
    expect(route).toContain("exchangeCodeForSession(code)");
    expect(route).toContain("isPasswordRecoveryExchange(data)");

    const logStart = route.indexOf("console.error");
    const redirectAfterLog = route.indexOf("return NextResponse.redirect", logStart);
    const logStatement = route.slice(logStart, redirectAfterLog);
    expect(logStatement).not.toContain("tokenHash");
    expect(logStatement).not.toContain("token_hash");
  });

  it("hands implicit recovery fragments to a client-only compatibility route", () => {
    const confirmation = read("../app/auth/confirm/route.ts");
    const recoveryPage = read("../app/auth/recovery/page.tsx");
    const recoveryStart = read("../app/api/auth/recovery/start/route.ts");

    expect(confirmation).toContain('const implicitRecoveryPath = "/auth/recovery"');
    expect(confirmation).toContain("NextResponse.redirect(new URL(implicitRecoveryPath, request.url))");
    expect(recoveryPage).toContain('fragment.get("access_token")');
    expect(recoveryPage).toContain('fragment.get("refresh_token")');
    expect(recoveryPage).toContain('type !== "recovery"');
    expect(recoveryPage).toContain('window.history.replaceState(null, "", window.location.pathname)');
    expect(recoveryPage).toContain("supabase.auth.setSession({");
    expect(recoveryPage).toContain('fetch("/api/auth/recovery/start"');
    expect(recoveryPage).toContain('window.location.replace("/reset-password")');
    expect(recoveryStart).toContain("supabase.auth.getUser()");
    expect(recoveryStart).toContain("supabase.auth.getClaims()");
    expect(recoveryStart).toContain('entry.method === "otp"');
    expect(recoveryStart).toContain("entry.timestamp > now - recoveryMarkerMaxAge");
    expect(recoveryStart).toContain("createRecoveryMarker(user.id)");
    expect(recoveryStart).toContain("recoveryMarkerMaxAge");

    const scrub = recoveryPage.indexOf("window.history.replaceState");
    const session = recoveryPage.indexOf("supabase.auth.setSession");
    expect(scrub).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(scrub);
  });

  it("ships the matching hosted recovery-email template", () => {
    const template = read("../supabase/auth-templates/recovery.html");
    expect(template).toContain("{{ .RedirectTo }}?token_hash=");
    expect(template).toContain("token_hash={{ .TokenHash }}");
    expect(template).toContain("type=recovery");
    expect(template).not.toContain("{{ .SiteURL }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });

  it("keeps previously issued PKCE recovery links valid without trusting normal login codes", () => {
    const callback = read("../app/auth/callback/route.ts");
    expect(callback).toContain('nextPath === "/reset-password"');
    expect(callback).toContain("isPasswordRecoveryExchange(data)");
    expect(callback).toContain("createRecoveryMarker(userId)");
    expect(callback).toContain('new URL("/reset-password", url.origin)');
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
    const completionRequest = form.indexOf('fetch("/api/auth/recovery/complete", { method: "POST" })');
    const completionCheck = form.indexOf("if (!completionResponse.ok)");
    const successRedirect = form.indexOf('router.replace("/login?password=updated")');

    expect(completionRequest).toBeGreaterThan(-1);
    expect(completionCheck).toBeGreaterThan(completionRequest);
    expect(successRedirect).toBeGreaterThan(completionCheck);
    expect(form).not.toContain(".catch(() => undefined)");
    expect(completion).toContain("verifyRecoveryMarker(marker, user.id)");
    expect(completion).toContain("maxAge: 0");
  });

  it("requires matching passwords before updating the authenticated user", () => {
    const source = read("../components/forms/reset-password-form.tsx");
    expect(source).toContain("password !== confirmation");
    expect(source).toContain("updateUser({ password })");
  });
});

