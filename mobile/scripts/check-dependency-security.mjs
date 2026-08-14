import { readFile } from "node:fs/promises";

const lockfile = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const packages = lockfile.packages ?? {};
const uuidVersion = packages["node_modules/uuid"]?.version;
const imageSizeVersion = packages["node_modules/image-size"]?.version;

if (uuidVersion !== "11.1.1") {
  console.error(
    `Mobile dependency security check failed: expected uuid 11.1.1, found ${uuidVersion ?? "missing"}.`,
  );
  process.exit(1);
}

if (!imageSizeVersion) {
  console.error("Mobile dependency security check failed: image-size lock entry is missing.");
  process.exit(1);
}

console.log(
  `Mobile dependency security check passed (uuid ${uuidVersion}; image-size ${imageSizeVersion} remains asset-restricted pending an upstream patch).`,
);
