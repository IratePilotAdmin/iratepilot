import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  automationSloPolicies,
  unavailableAutomationEscalation,
} from "../lib/admin/automation-escalation";

const migration = readFileSync(
  new URL("../supabase/migrations/202608170066_automation_slo_escalations.sql", import.meta.url),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../app/api/cron/automation-policy-scan/route.ts", import.meta.url),
  "utf8",
);
const adminRoute = readFileSync(new URL("../app/api/admin/operations/route.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/admin/operations/escalation-actions.ts", import.meta.url), "utf8");
const component = readFileSync(
  new URL("../components/dashboard/automation-escalation-workspace.tsx", import.meta.url),
  "utf8",
);
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

describe("Automation Operations Center Phase 4", () => {
  it("defines six bounded acknowledgment and resolution policies", () => {
    expect(automationSloPolicies).toHaveLength(6);
    expect(new Set(automationSloPolicies.map((policy) => policy.code)).size).toBe(6);
    expect(new Set(automationSloPolicies.map((policy) => policy.severity))).toEqual(new Set(["review", "warning", "critical"]));
    expect(new Set(automationSloPolicies.map((policy) => policy.checkpoint))).toEqual(new Set(["acknowledgement", "resolution"]));
    for (const policy of automationSloPolicies) {
      expect(policy.warningMinutes).toBeGreaterThan(0);
      expect(policy.targetMinutes).toBeGreaterThan(policy.warningMinutes);
    }
  });

  it("creates private SLO, provider-health, escalation, and immutable event ledgers", () => {
    for (const table of [
      "automation_escalation_policies",
      "automation_policy_scans",
      "automation_slo_evaluations",
      "automation_provider_health_snapshots",
      "automation_escalations",
      "automation_escalation_events",
    ]) expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration.match(/enable row level security/g)).toHaveLength(6);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("automation_slo_evaluations_immutable_trigger");
    expect(migration).toContain("automation_provider_health_snapshots_immutable_trigger");
    expect(migration).toContain("automation_escalation_events_immutable_trigger");
  });

  it("makes the scheduled scan service-role-only and idempotent by UTC date", () => {
    expect(migration).toContain("scheduled_for date not null unique");
    expect(migration).toContain("on conflict (scheduled_for) do nothing");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("grant execute on function public.run_automation_policy_scan(timestamptz) to service_role");
    expect(migration).toContain("scanner_mode = 'observation_only'");
  });

  it("derives health only from internal ledgers and contains no provider adapter", () => {
    for (const table of ["email_outbox", "stripe_financial_events", "pms_connection_test_events", "synxis_request_journal"]) {
      expect(migration).toContain(`from public.${table}`);
    }
    expect(migration).toContain("no external notification was sent");
    expect(migration).not.toMatch(/net\.http|http_post|pg_net|dblink/i);
    expect(cronRoute).not.toMatch(/fetch\(|Resend|Stripe|SynxisClient/i);
  });

  it("authenticates and checks the disabled scanner flag before service-role access", () => {
    expect(cronRoute).toContain("process.env.CRON_SECRET");
    expect(cronRoute).toContain('process.env.AUTOMATION_POLICY_SCANNER_ENABLED !== "true"');
    expect(cronRoute.indexOf('request.headers.get("authorization")')).toBeLessThan(cronRoute.indexOf("createAdminClient()"));
    expect(cronRoute.indexOf("AUTOMATION_POLICY_SCANNER_ENABLED")).toBeLessThan(cronRoute.indexOf("createAdminClient()"));
    expect(cronRoute).toContain('rpc("run_automation_policy_scan"');
    expect(envExample).toContain("AUTOMATION_POLICY_SCANNER_ENABLED=false");
    expect(vercel.crons).toContainEqual({ path: "/api/cron/automation-policy-scan", schedule: "15 8 * * *" });
    expect(vercel.crons).toHaveLength(2);
  });

  it("keeps acknowledgment admin-owned and degrades safely before migration 066", () => {
    expect(actions).toContain('requireRole(["admin"])');
    expect(actions).toContain("containsSensitiveIncidentContent");
    expect(actions).toContain('rpc("acknowledge_automation_escalation"');
    expect(actions).not.toContain("createAdminClient");
    expect(unavailableAutomationEscalation(false)).toMatchObject({
      available: false,
      migrationRequired: true,
      scannerEnabled: false,
      scannerMode: "observation_only",
    });
    expect(adminRoute).toContain("unavailableAutomationEscalation(scannerEnabled)");
    expect(adminRoute).toContain("escalationWorkflowAvailable: escalationWorkflow.available");
    expect(component).toContain("Acknowledge escalation");
    expect(component).not.toContain(">Run scan<");
    expect(component).not.toContain(">Send notification<");
  });
});
