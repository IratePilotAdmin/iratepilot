import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../docs/DEPLOYMENT.md", import.meta.url), "utf8");

describe("production environment contract", () => {
  it.each([
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PILOT_MODE",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "CRON_SECRET",
  ])("documents the required pilot variable %s", (name) => {
    expect(example).toContain(`${name}=`);
  });

  it("requires migration history verification before deployment", () => {
    expect(deployment).toContain("supabase migration list");
    expect(deployment).toContain("supabase db push");
    expect(deployment).toContain("Do not deploy the application when repository migrations are missing");
  });
});
