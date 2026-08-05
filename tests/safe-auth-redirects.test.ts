import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "../lib/auth/safe-next-path";

const authSurfaces = [
  "../app/auth/callback/route.ts",
  "../app/login/page.tsx",
  "../app/register/page.tsx",
  "../components/forms/login-form.tsx",
  "../components/forms/register-form.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("safe authentication redirects", () => {
  it("allows internal paths while preserving query strings and fragments", () => {
    expect(getSafeNextPath("/checkout?room=abc#payment"))
      .toBe("/checkout?room=abc#payment");
    expect(getSafeNextPath("/account/../partner"))
      .toBe("/partner");
  });

  it("rejects absolute, protocol-relative, backslash, and control-character redirects", () => {
    for (const value of [
      "https://evil.example/phish",
      "//evil.example/phish",
      "///evil.example/phish",
      "/\\evil.example/phish",
      "\\evil.example/phish",
      "/account\nevil.example",
      "",
    ]) {
      expect(getSafeNextPath(value)).toBeNull();
    }
  });

  it("uses the shared validator on every user-controlled authentication surface", () => {
    for (const surface of authSurfaces) {
      expect(surface).toContain("getSafeNextPath");
      expect(surface).not.toContain('startsWith("//")');
    }
  });
});
