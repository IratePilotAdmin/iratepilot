import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const registration = readFileSync(new URL("../components/pwa-registration.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const offlinePage = readFileSync(new URL("../app/offline/page.tsx", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("privacy-safe offline PWA support", () => {
  it("only intercepts navigation failures and never caches runtime responses", () => {
    expect(worker).toContain('event.request.mode !== "navigate"');
    expect(worker).toContain('caches.match("/offline")');
    expect(worker).not.toContain("cache.put(");
    expect(worker).not.toContain('"/api/');
    expect(worker).not.toContain('"/account');
    expect(worker).not.toContain('"/partner');
    expect(worker).not.toContain('"/admin');
  });

  it("registers the root-scoped worker only in production", () => {
    expect(registration).toContain('process.env.NODE_ENV !== "production"');
    expect(registration).toContain('register("/sw.js", { scope: "/" })');
    expect(layout).toContain("<PwaRegistration />");
  });

  it("ships a public offline fallback and fresh worker headers", () => {
    expect(offlinePage).toContain("Sensitive travel data is never stored in the offline cache.");
    expect(nextConfig).toContain('source: "/sw.js"');
    expect(nextConfig).toContain('value: "public, max-age=0, must-revalidate"');
    expect(nextConfig).toContain('key: "Service-Worker-Allowed", value: "/"');
  });
});
