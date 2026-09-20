import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  automationRunbooks,
  containsSensitiveIncidentContent,
  unavailableAutomationWorkflow,
} from "../lib/admin/automation-workflow";

const migration = readFileSync(
  new URL("../supabase/migrations/202608170064_automation_incident_workflow.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/admin/operations/route.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/admin/operations/actions.ts", import.meta.url), "utf8");
const component = readFileSync(
  new URL("../components/dashboard/automation-incident-workspace.tsx", import.meta.url),
  "utf8",
);

describe("Automation Operations Center Phase 2", () => {
  it("defines one bounded runbook for every Phase 1 operational lane", () => {
    expect(automationRunbooks.map((runbook) => runbook.id)).toEqual([
      "communications",
      "bookings",
      "partners",
      "support",
      "payments",
      "suppliers",
    ]);
    for (const runbook of automationRunbooks) {
      expect(runbook.steps.length).toBeGreaterThanOrEqual(4);
      expect(runbook.completionChecks.length).toBeGreaterThanOrEqual(3);
      expect(runbook.prohibitedActions.join(" ").toLowerCase()).toContain("separate approval");
    }
  });

  it("rejects credential-shaped and payment-card-shaped incident text", () => {
    expect(containsSensitiveIncidentContent("Supplier mapping needs operator review")).toBe(false);
    expect(containsSensitiveIncidentContent("password=do-not-store-this")).toBe(true);
    expect(containsSensitiveIncidentContent("Authorization: Bearer abc123")).toBe(true);
    expect(containsSensitiveIncidentContent("sk_live_1234567890abcdef")).toBe(true);
    expect(containsSensitiveIncidentContent("4111111111111111")).toBe(true);
  });

  it("creates private incident, note, and immutable event ledgers", () => {
    expect(migration).toContain("create table if not exists public.automation_incidents");
    expect(migration).toContain("create table if not exists public.automation_incident_notes");
    expect(migration).toContain("create table if not exists public.automation_incident_events");
    expect(migration).toContain("default gen_random_uuid()");
    expect(migration).not.toContain("uuid_generate_v4()");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("before update or delete on public.automation_incident_notes");
    expect(migration).toContain("before update or delete on public.automation_incident_events");
    expect(migration).toContain("Automation incident history is immutable");
  });

  it("keeps incident transitions atomic, admin-owned, and separate from automation execution", () => {
    expect(migration).toContain("v_actor_id uuid := auth.uid()");
    expect(migration).toContain("where id = p_actor_id and role = 'admin'");
    expect(migration).toContain("create or replace function public.create_automation_incident");
    expect(migration).toContain("create or replace function public.update_automation_incident");
    expect(migration).toContain("create or replace function public.add_automation_incident_note");
    expect(migration).toContain("Acknowledge the incident before resolution");
    expect(migration).toContain("status = 'open' or acknowledged_at is not null");
    expect(migration).toContain("resolved_at >= acknowledged_at");
    expect(migration).toContain("grant execute on function public.create_automation_incident");
    expect(migration).not.toMatch(/create\s+(payment|refund|transfer|payout)/i);
  });

  it("authenticates every server action and validates sensitive text before mutation", () => {
    expect(actions.match(/requireRole\(\["admin"\]\)/g)).toHaveLength(5);
    expect(actions).toContain("containsSensitiveIncidentContent");
    expect(actions).toContain('rpc("create_automation_incident"');
    expect(actions).toContain('rpc("update_automation_incident"');
    expect(actions).toContain('rpc("add_automation_incident_note"');
    expect(actions).not.toContain("createAdminClient");
  });

  it("degrades safely before migration 064 and exposes only operator workflow controls", () => {
    const unavailable = unavailableAutomationWorkflow();
    expect(unavailable).toMatchObject({ available: false, migrationRequired: true, readOnlyAutomation: true });
    expect(unavailable.runbooks).toHaveLength(6);
    expect(route).toContain("unavailableAutomationWorkflow()");
    expect(route).toContain("incidentWorkflowAvailable: workflow.available");
    expect(component).toContain("Acknowledge");
    expect(component).toContain("Save assignment");
    expect(component).toContain("Add note");
    expect(component).toContain("Resolve incident");
    expect(component).not.toContain(">Run automation<");
    expect(component).not.toContain(">Retry payment<");
    expect(component).not.toContain(">Send email<");
  });
});
