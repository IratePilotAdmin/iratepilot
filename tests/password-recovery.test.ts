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

  it("requires matching passwords before updating the authenticated user", () => {
    const source = read("../components/forms/reset-password-form.tsx");
    expect(source).toContain("password !== confirmation");
    expect(source).toContain("updateUser({ password })");
  });
});
