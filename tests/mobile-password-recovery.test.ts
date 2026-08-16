import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync(new URL("../mobile/src/providers/AuthProvider.tsx", import.meta.url), "utf8");
const signInScreen = readFileSync(new URL("../mobile/src/app/sign-in.tsx", import.meta.url), "utf8");
const recoveryTemplate = readFileSync(new URL("../supabase/auth-templates/recovery.html", import.meta.url), "utf8");

describe("mobile password recovery", () => {
  it("requests a Supabase reset link through the token-hash confirmation endpoint", () => {
    expect(provider).toContain("resetPasswordForEmail");
    expect(provider).toContain('redirectTo: "https://www.iratepilot.com/auth/confirm"');
    expect(provider).not.toContain("/auth/callback?next=");
    expect(recoveryTemplate).toContain('href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery"');
  });

  it("offers password recovery without requiring the current password", () => {
    expect(signInScreen).toContain('mode !== "recovery" && password.length < 8');
    expect(signInScreen).toContain("Forgot password?");
    expect(signInScreen).toContain("Send reset link");
  });
});
