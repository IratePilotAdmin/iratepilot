import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/mobile/page.tsx", import.meta.url), "utf8");
const installer = readFileSync(new URL("../components/mobile-install-card.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../components/layout/site-footer.tsx", import.meta.url), "utf8");

describe("mobile install page", () => {
  it("exposes a public, discoverable mobile app destination", () => {
    expect(page).toContain("Premium travel, one tap away.");
    expect(page).toContain("<MobileInstallCard />");
    expect(footer).toContain('["Mobile app", "/mobile"]');
  });

  it("supports the native browser install lifecycle", () => {
    expect(installer).toContain('addEventListener("beforeinstallprompt"');
    expect(installer).toContain("event.preventDefault()");
    expect(installer).toContain("await installPrompt.prompt()");
    expect(installer).toContain('addEventListener("appinstalled"');
    expect(installer).toContain('(display-mode: standalone)');
  });

  it("provides an iOS fallback without blocking browser access", () => {
    expect(installer).toContain("Add to Home Screen");
    expect(installer).toContain("Install app or Add to Home screen");
    expect(page).toContain('href="/search"');
  });
});
