import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
        "tests/hotel-manager-interest.test.ts",
        "tests/hotel-manager-interest-route.test.ts",
        "tests/hotel-manager-interest-form-errors.test.ts",
        "tests/hotel-manager-interest-submission.test.ts",
        "tests/admin-support-inbox.test.ts",
        "tests/admin-support-inbox-route.test.ts",
        "tests/admin-support-status-route.test.ts",
        "tests/admin-support-status-update.test.ts",
        "tests/admin-support-load-inbox.test.ts",
        "tests/contact-submission-security.test.ts",
        "tests/contact-form-submission.test.ts",
        "tests/hotel-interest-integration-boundary.test.{ts,tsx}",
        "tests/hotel-manager-intake.test.ts",
        "tests/flight-runtime-safety.test.ts",
        "tests/flight-consumer-production-public-shopping-runtime.test.ts",
        "tests/flight-consumer-preview-support-ui.test.ts"
    ],
    setupFiles: ["tests/hotel-interest-integration.setup.ts"],
    fileParallelism: false,
    isolate: true,
    sequence: { concurrent: false, shuffle: false },
    testTimeout: 5_000,
  },
});
