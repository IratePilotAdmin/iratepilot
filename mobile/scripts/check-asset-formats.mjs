import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
const blockedExtensions = new Set([".heic", ".heif", ".icns", ".jxl"]);
const ignoredDirectories = new Set([".expo", ".git", "node_modules"]);
const blockedAssets = [];

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await scan(path);
      continue;
    }

    if (blockedExtensions.has(extname(entry.name).toLowerCase())) {
      blockedAssets.push(relative(mobileRoot, path).replaceAll("\\", "/"));
    }
  }
}

await scan(mobileRoot);

if (blockedAssets.length > 0) {
  console.error([
    "Mobile asset security check failed.",
    "ICNS, JXL, HEIF, and HEIC assets are blocked while Metro's image-size dependency has no patched release.",
    ...blockedAssets.sort().map((path) => `- ${path}`),
  ].join("\n"));
  process.exit(1);
}

console.log("Mobile asset security check passed.");
