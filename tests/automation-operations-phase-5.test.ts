import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emailOutboxReceiptAdapter,
  unavailableAutomationExecutor,
} from "../lib/admin/automation-executor";

const migration = readFileSync(
  new URL("../supabase/migrations/202608170067_automation_sandbox_executor.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/admin/operations/route.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/admin/operations/executor-actions.ts", import.meta.url), "utf8");
const component = readFileSync(
  new URL("../components/dashboard/automation-executor-workspace.tsx", import.meta.url),
  "utf8",
);
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

describe("Automation Operations Center Phase 5", () => {
  it("allowlists exactly one disabled internal read-only adapter", () => {
    expect(emailOutboxReceiptAdapter).toEqual({
      code: "email_outbox_receipt_check",
      label: "Email outbox receipt check",
      sourceRetryKind: "email_delivery_review",
      executionMode: "internal_read_only_sandbox",
      enabled: false,
      networkAccess: false,
      externalSideEffects: false,
    });
    expect(migration).toContain("adapter_code text primary key check (adapter_code = 'email_outbox_receipt_check')");
    expect(migration).toContain("enabled boolean not null default false");
    expect(envExample).toContain("AUTOMATION_SANDBOX_EXECUTOR_ENABLED=false");
  });

  it("creates private idempotent execution and immutable event ledgers", () => {
    expect(migration).toContain("create table if not exists public.automation_executor_registry");
    expect(migration).toContain("create table if not exists public.automation_sandbox_executions");
    expect(migration).toContain("create table if not exists public.automation_sandbox_execution_events");
    expect(migration).toContain("retry_request_id uuid not null unique");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration.match(/enable row level security/g)).toHaveLength(3);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("automation_sandbox_executions_immutable_trigger");
    expect(migration).toContain("automation_sandbox_execution_events_immutable_trigger");
  });

  it("inherits completed dual-approved request eligibility and re-checks admin authorization", () => {
    expect(migration).toContain("v_actor_id uuid := auth.uid()");
    expect(migration).toContain("public.automation_incident_actor_name(v_actor_id)");
    expect(migration).toContain("v_request.retry_kind <> 'email_delivery_review'");
    expect(migration).toContain("v_request.status <> 'dry_run_completed'");
    expect(migration).toContain("where retry_request_id = p_retry_request_id");
    expect(migration).toContain("if found then return v_execution");
  });

  it("reads only sanitized internal status and hard-blocks side effects", () => {
    expect(migration).toContain("select status into v_observed_status");
    expect(migration).toContain("from public.email_outbox");
    expect(migration).not.toMatch(/select\s+(recipient_email|subject|template_data|resend_email_id)/i);
    expect(migration).not.toMatch(/update\s+public\.email_outbox|insert\s+into\s+public\.email_outbox/i);
    expect(migration).toContain("check (not network_accessed)");
    expect(migration).toContain("check (not external_side_effect_created)");
    expect(migration).toContain("check (not message_sent)");
    expect(migration).toContain("check (not money_moved)");
    expect(migration).not.toMatch(/net\.http|http_post|pg_net|dblink/i);
  });

  it("checks authorization and the application kill switch before RPC execution", () => {
    expect(actions).toContain('requireRole(["admin"])');
    expect(actions).toContain('process.env.AUTOMATION_SANDBOX_EXECUTOR_ENABLED !== "true"');
    expect(actions.indexOf('requireRole(["admin"])')).toBeLessThan(actions.indexOf('rpc("run_email_outbox_receipt_sandbox"'));
    expect(actions.indexOf("AUTOMATION_SANDBOX_EXECUTOR_ENABLED")).toBeLessThan(actions.indexOf('rpc("run_email_outbox_receipt_sandbox"'));
    expect(actions).not.toMatch(/fetch\(|Resend|Stripe|createAdminClient/);
  });

  it("degrades safely before migration 067 and hides controls while locked", () => {
    expect(unavailableAutomationExecutor(false)).toMatchObject({
      available: false,
      migrationRequired: true,
      applicationKillSwitchEnabled: false,
      databaseKillSwitchEnabled: false,
      effectiveEnabled: false,
    });
    expect(route).toContain("unavailableAutomationExecutor(applicationKillSwitchEnabled)");
    expect(route).toContain("executorWorkflowAvailable: executorWorkflow.available");
    expect(component).toContain("executorWorkflow.effectiveEnabled ?");
    expect(component).toContain("Run internal receipt check");
    expect(component).not.toContain(">Send email<");
    expect(component).not.toContain(">Retry email<");
  });
});
