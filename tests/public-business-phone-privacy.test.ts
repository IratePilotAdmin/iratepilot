import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoots = [
  new URL("../app", import.meta.url),
  new URL("../components", import.meta.url),
];

function sourceFiles(directory: URL): string[] {
  const root = fileURLToPath(directory);
  const files: string[] = [];

  function visit(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
    }
  }

  visit(root);
  return files;
}

const websiteSources = sourceRoots.flatMap(sourceFiles);
const personalPhonePattern = /(?:\+?1[\s().-]*)?614[\s().-]*439[\s().-]*6660/;
const clickablePhonePattern = /href\s*=\s*(?:\{\s*)?["']tel:/i;

describe("public business phone privacy", () => {
  it("does not publish the owner's current phone number in website source", () => {
    for (const path of websiteSources) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(personalPhonePattern);
    }
  });

  it("does not expose a clickable business phone link", () => {
    for (const path of websiteSources) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(clickablePhonePattern);
    }
  });

  it("keeps browser telephone auto-linking disabled", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain("telephone: false");
  });
});
