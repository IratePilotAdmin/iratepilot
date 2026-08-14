import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const xcode = require("xcode");
const { v4 } = require("uuid");
const identifier = v4();

if (typeof xcode.project !== "function") {
  console.error("Mobile dependency runtime check failed: xcode CommonJS API is unavailable.");
  process.exit(1);
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(identifier)) {
  console.error("Mobile dependency runtime check failed: uuid v4 output is invalid.");
  process.exit(1);
}

console.log("Mobile dependency runtime check passed (xcode CommonJS API with uuid 11.1.1).");
