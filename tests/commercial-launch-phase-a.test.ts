import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("commercial launch remediation phase A", () => {
  it("verifies Resend signatures against the raw body and journals delivery events", () => {
    const route = read("app/api/webhooks/resend/route.ts");
    const migration = read("supabase/migrations/202608140050_commercial_launch_email_reliability.sql");
    expect(route).toContain("const rawBody = await request.text()");
    expect(route).toContain("webhooks.verify");
    expect(route).toContain('request.headers.get("svix-signature")');
    expect(route).toContain('from("email_delivery_events")');
    expect(route).toContain('from("email_suppressions")');
    expect(migration).toContain("create table if not exists public.email_delivery_events");
    expect(migration).toContain("create table if not exists public.email_suppressions");
    expect(migration).toContain("attempts < 5");
    expect(migration).toContain("'dead_letter'");
  });

  it("provides an admin-only operational readiness view and structured logs", () => {
    const route = read("app/api/admin/operational-readiness/route.ts");
    const monitoring = read("lib/monitoring/operational.ts");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain("emailDeadLetters");
    expect(route).toContain("payoutExceptions");
    expect(monitoring).toContain("JSON.stringify");
    expect(monitoring).toContain("[redacted]");
    expect(monitoring).toContain("ERROR_WEBHOOK_URL");
  });

  it("runs a no-network sandbox preflight with every live path and SynXis disabled", () => {
    const output = execFileSync(process.execPath, ["scripts/commercial-sandbox-preflight.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PILOT_MODE: "true",
        NEXT_PUBLIC_PUBLIC_BOOKING: "false",
        ENABLE_LIVE_BOOKING_PAYMENTS: "false",
        ENABLE_LIVE_PARTNER_PAYOUTS: "false",
        ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
        STRIPE_SECRET_KEY: "sk_test_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        RESEND_WEBHOOK_SECRET: "whsec_resend_placeholder",
        NEXT_PUBLIC_SUPABASE_URL: "https://sandbox.example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sandbox-placeholder",
      },
    });
    const result = JSON.parse(output) as {
      ready: boolean;
      networkRequestsMade: number;
      synxisTraffic: string;
      liveTransactions: string;
    };
    expect(result).toMatchObject({
      ready: true,
      networkRequestsMade: 0,
      synxisTraffic: "disabled",
      liveTransactions: "disabled",
    });
  });

  it("documents backup recovery, incident response, support targets, and external sandbox separation", () => {
    expect(read("docs/BACKUP_RESTORE_RUNBOOK.md")).toContain("Commercial launch target");
    expect(read("docs/BACKUP_RESTORE_RUNBOOK.md")).toContain("separate production-write approval");
    expect(read("docs/INCIDENT_SUPPORT_RUNBOOK.md")).toContain("P0");
    expect(read("docs/INCIDENT_SUPPORT_RUNBOOK.md")).toContain("Payments owner");
    expect(read("docs/COMMERCIAL_SANDBOX_TEST_PLAN.md")).toContain("requires a later approval gate");
  });
});
