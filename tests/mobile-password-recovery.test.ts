import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync(new URL("../mobile/src/providers/AuthProvider.tsx", import.meta.url), "utf8");
const signInScreen = readFileSync(new URL("../mobile/src/app/sign-in.tsx", import.meta.url), "utf8");

describe("mobile password recovery", () => {
  it("requests a Supabase reset link that returns to the secure web reset page", () => {
    expect(provider).toContain("resetPasswordForEmail");
    expect(provider).toContain("https://www.iratepilot.com/auth/callback?next=%2Freset-password");
  });

  it("offers password recovery without requiring the current password", () => {
    expect(signInScreen).toContain('mode !== "recovery" && password.length < 8');
    expect(signInScreen).toContain("Forgot password?");
    expect(signInScreen).toContain("Send reset link");
  });
});
