import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    // These run with node --test in the package test command.
    exclude: [...configDefaults.exclude,
      "scripts/verify-iratepilot-pms-onboarding-handler.test.mjs",
      "tests/pms-journal.test.mjs",
      "tests/pms-service-components.test.mjs",
    ],
  },
});
