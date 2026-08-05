import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const icon = readFileSync(new URL("../app/icon.tsx", import.meta.url), "utf8");
const appleIcon = readFileSync(new URL("../app/apple-icon.tsx", import.meta.url), "utf8");

describe("mobile PWA metadata", () => {
  it("provides installable manifest icons and mobile shortcuts", () => {
    const value = manifest();

    expect(value.display).toBe("standalone");
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/icon", sizes: "512x512", purpose: "maskable" }),
      expect.objectContaining({ src: "/apple-icon", sizes: "180x180" }),
    ]));
    expect(value.shortcuts?.map((shortcut) => shortcut.url)).toEqual(["/search", "/account/trips"]);
  });

  it("enables Apple standalone mode and a safe-area viewport", () => {
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('themeColor: "#096fd1"');
  });

  it("generates both standard and Apple PNG icons", () => {
    expect(icon).toContain("width: 512, height: 512");
    expect(appleIcon).toContain("width: 180, height: 180");
    expect(icon).toContain('contentType = "image/png"');
    expect(appleIcon).toContain('contentType = "image/png"');
  });
});
